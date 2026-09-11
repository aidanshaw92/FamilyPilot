/**
 * Shared venue alias detection heuristics.
 * Used by search-time dedupe and canonical venue linking.
 */

const ALIAS_STOP_WORDS = new Set([
  'the',
  'and',
  'at',
  'by',
  'park',
  'london',
  'north',
  'west',
  'south',
  'east',
  'centre',
  'center',
  'family',
  'day',
  'out',
  'visit',
  'tours',
]);

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normaliseVenueAliasKey(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !ALIAS_STOP_WORDS.has(word))
    .sort()
    .join(' ');
}

function tokenOverlapScore(nameA, nameB) {
  const tokensA = new Set(normaliseVenueAliasKey(nameA).split(' ').filter(Boolean));
  const tokensB = new Set(normaliseVenueAliasKey(nameB).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function areLikelySameVenueAlias(a, b, km) {
  if (km > 0.5) return false;
  if (tokenOverlapScore(a.name, b.name) >= 0.45) return true;

  const nameA = a.name.toLowerCase();
  const nameB = b.name.toLowerCase();
  const studioTourSignals = /studio|tour|harry potter|warner bros|warner bros\./;
  return km <= 0.2 && studioTourSignals.test(nameA) && studioTourSignals.test(nameB);
}

function findVenueAliasPairs(places) {
  const suppressedIds = new Set();
  const pairs = [];

  for (let i = 0; i < places.length; i += 1) {
    if (suppressedIds.has(places[i].familypilotId)) continue;

    for (let j = i + 1; j < places.length; j += 1) {
      if (suppressedIds.has(places[j].familypilotId)) continue;

      const a = places[i];
      const b = places[j];
      const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
      if (!areLikelySameVenueAlias(a, b, km)) continue;

      const keeper = a.name.length >= b.name.length ? a : b;
      const duplicate = keeper.familypilotId === a.familypilotId ? b : a;
      suppressedIds.add(duplicate.familypilotId);
      pairs.push({
        primary: keeper,
        alias: duplicate,
        distanceKm: km,
        tokenOverlap: tokenOverlapScore(a.name, b.name),
        matchMethod: 'heuristic:venue_alias',
        matchConfidence: Math.min(0.95, 0.55 + tokenOverlapScore(a.name, b.name) * 0.4),
      });
    }
  }

  return {
    places: places.filter((place) => !suppressedIds.has(place.familypilotId)),
    pairs,
    suppressedIds,
  };
}

function dedupeVenueAliases(places) {
  return findVenueAliasPairs(places).places;
}

module.exports = {
  ALIAS_STOP_WORDS,
  haversineKm,
  normaliseVenueAliasKey,
  tokenOverlapScore,
  areLikelySameVenueAlias,
  findVenueAliasPairs,
  dedupeVenueAliases,
};
