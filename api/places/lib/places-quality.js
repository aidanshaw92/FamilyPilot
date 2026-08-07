/**
 * Server-side places quality layer (Vercel API mirror of places-quality.ts).
 * Keep in sync with familypilot/server/places/places-quality.ts
 */

const EXPLORE_INCLUDED_PRIMARY_TYPES = [
  'park', 'playground', 'museum', 'zoo', 'tourist_attraction', 'amusement_park',
  'aquarium', 'national_park', 'botanical_garden', 'planetarium', 'water_park',
  'hiking_area', 'marina', 'campground', 'ice_skating_rink', 'bowling_alley',
  'cultural_center', 'art_gallery',
];

const RESTAURANT_INCLUDED_PRIMARY_TYPES = [
  'restaurant', 'cafe', 'coffee_shop', 'bakery', 'meal_takeaway',
  'fast_food_restaurant', 'ice_cream_shop', 'meal_delivery',
];

const EXPLORE_EXCLUDED_PRIMARY_TYPES = [
  'hotel', 'lodging', 'motel', 'hostel', 'bed_and_breakfast', 'guest_house',
  'supermarket', 'grocery_store', 'department_store', 'shopping_mall',
  'convenience_store', 'gas_station', 'bar', 'pub', 'night_club', 'liquor_store',
  'movie_theater', 'casino', 'bank', 'atm', 'pharmacy', 'hospital', 'doctor',
  'dentist', 'car_dealer', 'car_rental', 'car_wash', 'funeral_home', 'cemetery',
  'restaurant', 'cafe', 'coffee_shop', 'place_of_worship', 'hindu_temple',
  'church', 'mosque', 'synagogue', 'storage', 'real_estate_agency',
  'insurance_agency', 'lawyer', 'accounting',
];

const RESTAURANT_EXCLUDED_PRIMARY_TYPES = [
  'hotel', 'lodging', 'motel', 'supermarket', 'grocery_store', 'department_store',
  'shopping_mall', 'gas_station', 'bar', 'pub', 'night_club', 'movie_theater',
  'casino', 'bank', 'pharmacy', 'hospital',
];

const GOOGLE_TYPE_TO_TAXONOMY = {
  park: 'park', playground: 'playground', national_park: 'park', city_park: 'park', botanical_garden: 'park',
  hiking_area: 'park', marina: 'attraction', campground: 'attraction', rv_park: 'attraction',
  museum: 'museum', art_gallery: 'museum', art_museum: 'museum', aquarium: 'museum', planetarium: 'museum',
  childrens_museum: 'museum', cultural_center: 'museum',
  zoo: 'zoo', wildlife_park: 'zoo', petting_zoo: 'farm', farm: 'farm',
  tourist_attraction: 'attraction', amusement_park: 'activity', theme_park: 'activity',
  water_park: 'activity', bowling_alley: 'activity', indoor_playground: 'activity',
  trampoline_park: 'activity', ice_skating_rink: 'activity', sports_complex: 'activity',
  stadium: 'attraction', opera_house: 'attraction', ski_resort: 'activity',
  restaurant: 'restaurant', fast_food_restaurant: 'restaurant', meal_takeaway: 'restaurant',
  meal_delivery: 'restaurant', cafe: 'cafe', coffee_shop: 'cafe', bakery: 'cafe',
  ice_cream_shop: 'cafe', beach: 'attraction', lodging: 'hotel', hotel: 'hotel',
  motel: 'hotel', supermarket: 'shop', grocery_store: 'shop', department_store: 'shop',
  shopping_mall: 'shop', convenience_store: 'shop',
};

const TAXONOMY_TO_VENUE_CATEGORY = {
  park: 'park', playground: 'park', museum: 'museum', zoo: 'museum', farm: 'farm',
  attraction: 'museum', activity: 'soft_play', restaurant: 'restaurant', cafe: 'cafe',
  shop: 'shop', hotel: 'hotel', other: null,
};

const FORCE_NULL_TYPES = new Set([
  'historical_landmark', 'monument', 'place_of_worship', 'hindu_temple', 'church',
  'mosque', 'synagogue', 'movie_theater', 'cinema', 'bar', 'pub', 'night_club',
  'gas_station', 'supermarket', 'grocery_store', 'department_store', 'shopping_mall',
  'hotel', 'lodging', 'bank', 'atm', 'pharmacy', 'hospital', 'car_dealer',
  'car_wash', 'casino', 'storage', 'library', 'performing_arts_theater',
]);

const IGNORED_SECONDARY_TYPES = new Set(['point_of_interest', 'establishment']);

const GENERIC_PRIMARY_TYPES = new Set([
  'park', 'tourist_attraction', 'point_of_interest', 'establishment',
]);

const TAXONOMY_SPECIFICITY = [
  'activity', 'zoo', 'museum', 'farm', 'attraction', 'playground', 'park',
  'restaurant', 'cafe', 'shop', 'hotel', 'other',
];

function inferActivityTaxonomyFromName(name) {
  const normalised = name.toLowerCase();
  if (/trampoline|jump in|airhop|soft play|indoor play|inflatable|adventure park|clip '?n climb|tenpin|bowling/i.test(normalised)) {
    return 'activity';
  }
  return null;
}

function pickBestTaxonomyFromTypes(types) {
  for (const taxonomy of TAXONOMY_SPECIFICITY) {
    for (const type of types) {
      if (GOOGLE_TYPE_TO_TAXONOMY[type] === taxonomy) return taxonomy;
    }
  }
  return null;
}

function mapGoogleTaxonomy(primaryType, types = [], name) {
  const candidates = [primaryType, ...types].filter(Boolean);

  if (name) {
    const fromName = inferActivityTaxonomyFromName(name);
    if (fromName) return fromName;
  }

  if (primaryType && GENERIC_PRIMARY_TYPES.has(primaryType)) {
    const fromSecondary = pickBestTaxonomyFromTypes(
      types.filter((type) => !IGNORED_SECONDARY_TYPES.has(type) && !FORCE_NULL_TYPES.has(type)),
    );
    if (fromSecondary) return fromSecondary;
  }

  for (const type of candidates) {
    if (FORCE_NULL_TYPES.has(type) || IGNORED_SECONDARY_TYPES.has(type)) continue;
    if (type.endsWith('_restaurant') && type !== 'fast_food_restaurant') {
      return 'restaurant';
    }
    const taxonomy = GOOGLE_TYPE_TO_TAXONOMY[type];
    if (taxonomy) return taxonomy;
  }

  return null;
}

function mapGoogleCategory(primaryType, types = [], name) {
  const taxonomy = mapGoogleTaxonomy(primaryType, types, name);
  if (!taxonomy) return null;
  return TAXONOMY_TO_VENUE_CATEGORY[taxonomy];
}

function googleTypesForIntent(intent) {
  return intent === 'restaurant'
    ? [...RESTAURANT_INCLUDED_PRIMARY_TYPES]
    : [...EXPLORE_INCLUDED_PRIMARY_TYPES];
}

function excludedTypesForIntent(intent) {
  return intent === 'restaurant'
    ? [...RESTAURANT_EXCLUDED_PRIMARY_TYPES]
    : [...EXPLORE_EXCLUDED_PRIMARY_TYPES];
}

function isExploreCategory(category) {
  return !['restaurant', 'cafe', 'hotel', 'shop'].includes(category);
}

function shouldExcludePlace(primaryType, types, intent) {
  const excluded = new Set(excludedTypesForIntent(intent));
  const candidates = [primaryType, ...types].filter(Boolean);
  return candidates.some((type) => excluded.has(type));
}

function isSupportedForIntent(primaryType, types, intent, name) {
  if (shouldExcludePlace(primaryType, types, intent)) return false;
  const category = mapGoogleCategory(primaryType, types, name);
  if (!category) return false;
  if (intent === 'explore') return isExploreCategory(category);
  return category === 'restaurant' || category === 'cafe';
}

function normaliseChainKey(name) {
  let base = name.trim();
  const separators = [' - ', ' | ', ' · ', ','];
  for (const sep of separators) {
    const idx = base.indexOf(sep);
    if (idx > 0) base = base.slice(0, idx);
  }
  base = base.replace(/\s+\([^)]+\)\s*$/, '').trim();

  const brandSuffixWords = new Set([
    'coffee', 'express', 'kitchen', 'market', 'store', 'shop', 'grill', 'house', 'inn', 'pub', 'bar',
  ]);

  const parts = base.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const lastLower = last.toLowerCase();
    if (/^[A-Z][a-zA-Z'-]+$/.test(last) && !brandSuffixWords.has(lastLower)) {
      base = parts.slice(0, -1).join(' ');
    }
  }

  return base.toLowerCase().replace(/[^\w\s']/g, '').replace(/\s+/g, ' ');
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ALIAS_STOP_WORDS = new Set([
  'the', 'london', 'uk', 'england', 'studio', 'tour', 'tours', 'and', 'at', 'by', 'park',
]);

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
    if (tokensB.has(token)) overlap++;
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

function dedupeVenueAliases(places) {
  const suppressedIds = new Set();
  for (let i = 0; i < places.length; i++) {
    if (suppressedIds.has(places[i].familypilotId)) continue;
    for (let j = i + 1; j < places.length; j++) {
      if (suppressedIds.has(places[j].familypilotId)) continue;
      const a = places[i];
      const b = places[j];
      const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
      if (!areLikelySameVenueAlias(a, b, km)) continue;
      const keeper = a.name.length >= b.name.length ? a : b;
      const duplicate = keeper.familypilotId === a.familypilotId ? b : a;
      suppressedIds.add(duplicate.familypilotId);
    }
  }
  return places.filter((place) => !suppressedIds.has(place.familypilotId));
}

function categoryRelevanceScore(category, intent) {
  if (intent === 'restaurant') {
    return category === 'restaurant' ? 90 : category === 'cafe' ? 85 : 40;
  }
  switch (category) {
    case 'park': return 95;
    case 'farm': return 92;
    case 'museum': return 90;
    case 'soft_play': return 88;
    case 'beach': return 85;
    default: return 50;
  }
}

function distanceScore(km) {
  if (km <= 2) return 95;
  if (km <= 5) return 85;
  if (km <= 10) return 70;
  if (km <= 20) return 55;
  return 40;
}

function rankPlaces(places, context) {
  const scored = places.map((place) => {
    const km = haversineKm(
      context.originLat, context.originLng, place.latitude, place.longitude,
    );
    const score =
      categoryRelevanceScore(place.category, context.intent) * 0.4 +
      distanceScore(km) * 0.35 +
      50 * 0.25;
    return { place, score, km };
  });
  scored.sort((a, b) => b.score - a.score || a.km - b.km);
  const limit = context.maxResults ?? 20;
  return scored.slice(0, limit).map((entry) => entry.place);
}

function dedupeChains(places, originLat, originLng, intent) {
  if (intent === 'restaurant') return places;

  const bestByChain = new Map();
  for (const place of places) {
    const chainKey = normaliseChainKey(place.name);
    if (!chainKey || chainKey.length < 3) continue;
    const km = haversineKm(originLat, originLng, place.latitude, place.longitude);
    const existing = bestByChain.get(chainKey);
    if (!existing || km < existing.km) {
      bestByChain.set(chainKey, { place, km });
    }
  }

  const suppressedIds = new Set();
  const chainGroups = new Map();
  for (const place of places) {
    const chainKey = normaliseChainKey(place.name);
    if (!chainKey || chainKey.length < 3) continue;
    const group = chainGroups.get(chainKey) ?? [];
    group.push(place);
    chainGroups.set(chainKey, group);
  }

  for (const [, group] of chainGroups) {
    if (group.length <= 1) continue;
    const chainKey = normaliseChainKey(group[0].name);
    const keeper = bestByChain.get(chainKey)?.place;
    for (const place of group) {
      if (keeper && place.familypilotId !== keeper.familypilotId) {
        suppressedIds.add(place.familypilotId);
      }
    }
  }

  return places.filter((place) => !suppressedIds.has(place.familypilotId));
}

module.exports = {
  mapGoogleCategory,
  mapGoogleTaxonomy,
  googleTypesForIntent,
  excludedTypesForIntent,
  isSupportedForIntent,
  shouldExcludePlace,
  normaliseChainKey,
  normaliseVenueAliasKey,
  rankPlaces,
  dedupeChains,
  dedupeVenueAliases,
  EXPLORE_INCLUDED_PRIMARY_TYPES,
  RESTAURANT_INCLUDED_PRIMARY_TYPES,
};
