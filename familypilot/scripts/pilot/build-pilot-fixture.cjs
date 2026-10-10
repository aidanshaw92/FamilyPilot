#!/usr/bin/env node
/**
 * Builds the two states of the pilot venues the fixture server can serve: `before` (what production serves today, from the
 * stored claims) and `after` (the same venues with the profile's facts applied, assuming each proposed fact is approved).
 *
 *   node scripts/pilot/build-pilot-fixture.cjs --layer-a /path/layer-a.json --out /path/dir
 *
 * Layer A (names, coordinates, hours) is read from a LOCAL file that is never committed: it is provider content. Photographs
 * are left out, which is the state the product is in with Google photographs switched off.
 */
const fs = require('node:fs');
const path = require('node:path');
const { metadataFor } = require('./profile-claims.cjs');

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const layerA = JSON.parse(fs.readFileSync(flag('--layer-a'), 'utf8'));
const outDir = flag('--out');
const profilesDir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const baselineFile = JSON.parse(fs.readFileSync(path.join(profilesDir, 'baseline-claims.json'), 'utf8'));
const profiles = fs.readdirSync(path.join(profilesDir, 'profiles')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(profilesDir, 'profiles', f), 'utf8')));

/** "Monday: 10:00 AM – 6:00 PM" -> structured periods (Google numbers days from Sunday = 0). */
const DAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
function periodsFrom(weekdayText) {
  const periods = [];
  for (const line of weekdayText) {
    const [dayName, rest] = line.split(': ');
    const day = DAY[dayName];
    if (day === undefined || /closed/i.test(rest)) continue;
    if (/24 hours/i.test(rest)) { periods.push({ open: { day, hour: 0, minute: 0 }, close: { day: (day + 1) % 7, hour: 0, minute: 0 } }); continue; }
    const m = rest.match(/(\d+):(\d+)\s*(AM|PM)\s*[–-]\s*(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) continue;
    const to24 = (h, ap) => (Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0);
    periods.push({ open: { day, hour: to24(m[1], m[3]), minute: Number(m[2]) }, close: { day, hour: to24(m[4], m[6]), minute: Number(m[5]) } });
  }
  return periods;
}

const placeFor = (profile) => {
  const a = layerA[profile.id];
  if (!a) throw new Error(`no provider snapshot for ${profile.id}`);
  return {
    familypilotId: profile.id, externalId: `google:${profile.id.replace('fp-google-', '')}`, provider: 'google', name: a.name, category: a.category,
    latitude: a.lat, longitude: a.lng, address: a.address, description: a.description ?? undefined, website: a.website, phone: a.phone ?? undefined,
    photos: [], openingHours: a.weekdayText.length ? { source: 'google', weekdayText: a.weekdayText, periods: periodsFrom(a.weekdayText), timeZone: 'Europe/London' } : undefined, provenance: {}, fetchedAt: '2026-10-08T09:00:00.000Z',
    googlePrimaryType: a.category, googleTypes: [a.category],
  };
};

const { PROJECTED_RULES } = require(path.join(__dirname, '..', '..', '..', 'server', 'enrichment', '_lib', 'venue-rules.js'));
const { PROJECTED_OFFICIAL_HOURS } = require(path.join(__dirname, '..', '..', '..', 'server', 'enrichment', '_lib', 'official-hours.js'));
const metadata = (id, payload, extras, state) => ({
  familypilotPlaceId: id, enrichmentStatus: 'enriched', ...payload, ...extras, ...(payload[PROJECTED_RULES]?.length ? { rules: payload[PROJECTED_RULES] } : {}), ...(payload[PROJECTED_OFFICIAL_HOURS]?.length ? { officialHours: payload[PROJECTED_OFFICIAL_HOURS] } : {}), provenance: {}, lastChecked: '2026-10-08',
  checkedBy: state === 'after' ? 'pilot-profile' : 'stored-claims', updatedAt: '2026-10-08',
});

const states = { before: [], after: [], afterAuto: [] };
const claimsOut = { before: {}, after: {}, afterAuto: {} };
for (const profile of profiles) {
  const base = baselineFile.venues[profile.id] ?? [];
  const baselineClaims = base.map((c) => ({ fieldKey: c.field, valueJson: c.value, status: 'active', confidence: 'high', approvedBy: 'source_evidence_auto_v2', checkedAt: c.checkedAt, validUntil: c.validUntil, sourceUrl: c.source }));
  // before: stored claims only, projected the way the consumer API projects them
  const before = metadataFor({ facts: [] }, 'auto', { baseline: baselineClaims });
  const beforePlace = placeFor(profile);
  if (baselineClaims.length) { beforePlace.enrichmentStatus = 'enriched'; beforePlace.familyMetadata = metadata(profile.id, before.payload, {}, 'before'); }
  else beforePlace.enrichmentStatus = 'provider_only';
  states.before.push(beforePlace);
  claimsOut.before[profile.id] = baselineClaims;
  for (const [view, key] of [['approved', 'after'], ['auto', 'afterAuto']]) {
    const m = metadataFor(profile, view, { baseline: baselineClaims });
    const place = placeFor(profile);
    place.enrichmentStatus = 'enriched';
    place.familyMetadata = metadata(profile.id, m.payload, m.extras, 'after');
    states[key].push(place);
    claimsOut[key][profile.id] = m.allClaims;
  }
}
fs.mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(states)) fs.writeFileSync(path.join(outDir, `pilot-${k}.json`), JSON.stringify(v, null, 1));
// The claims behind each state, for the fixture's trust panel ("How we know this"): the same shape the feedback rules read.
for (const [k, v] of Object.entries(claimsOut)) fs.writeFileSync(path.join(outDir, `pilot-${k}.claims.json`), JSON.stringify(v, null, 1));
console.log(`wrote ${Object.keys(states).map((k) => `pilot-${k}.json`).join(', ')} (${profiles.length} venues each)`);
