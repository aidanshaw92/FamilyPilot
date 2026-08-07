#!/usr/bin/env node
/**
 * Report category mappings for known audit examples + optional live Bushey sync.
 * Usage: node scripts/audit-category-mapping.mjs [--live]
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { mapGoogleCategory, mapGoogleTaxonomy, dedupeVenueAliases } = require(
  join(root, 'api/places/lib/places-quality.js'),
);
const { googlePlaceToRecord } = require(join(root, 'api/places/lib/google-places.js'));

const AUDIT_EXAMPLES = [
  {
    name: 'Jump In by AirHop Adventure & Trampoline Park Elstree',
    primaryType: 'park',
    types: ['park', 'point_of_interest'],
  },
  {
    name: 'Warner Bros. Studio Tour London',
    primaryType: 'tourist_attraction',
    types: ['tourist_attraction', 'point_of_interest'],
  },
  {
    name: 'Harry Potter Studio',
    primaryType: 'tourist_attraction',
    types: ['tourist_attraction', 'point_of_interest'],
    latitude: 51.6561,
    longitude: -0.4181,
  },
  {
    name: 'Troubadour Wembley Park Theatre',
    primaryType: 'performing_arts_theater',
    types: ['performing_arts_theater', 'point_of_interest'],
  },
  {
    name: 'College Lane Campus LRC',
    primaryType: 'library',
    types: ['library', 'point_of_interest'],
  },
  {
    name: 'Hanwell Zoo',
    primaryType: 'zoo',
    types: ['zoo', 'point_of_interest'],
  },
];

function legacyCategory(primaryType) {
  const taxonomy = mapGoogleTaxonomy(primaryType, []);
  if (taxonomy === 'attraction') return 'park';
  if (taxonomy === 'zoo') return 'farm';
  if (taxonomy === 'library') return 'museum';
  return mapGoogleCategory(primaryType, []) ?? 'excluded';
}

function reportExamples(label) {
  console.log(`\n=== ${label} ===`);
  for (const example of AUDIT_EXAMPLES) {
    const category = mapGoogleCategory(example.primaryType, example.types, example.name);
    const record = googlePlaceToRecord(
      {
        id: `audit-${example.name.slice(0, 12).replace(/\W/g, '')}`,
        displayName: { text: example.name },
        location: {
          latitude: example.latitude ?? 51.656,
          longitude: example.longitude ?? -0.418,
        },
        formattedAddress: 'Audit',
        primaryType: example.primaryType,
        types: example.types,
        businessStatus: 'OPERATIONAL',
      },
      'explore',
    );
    console.log(
      JSON.stringify({
        name: example.name,
        primaryType: example.primaryType,
        taxonomy: mapGoogleTaxonomy(example.primaryType, example.types, example.name),
        category: category ?? 'excluded',
        includedInExplore: Boolean(record),
      }),
    );
  }

  const aliasCandidates = AUDIT_EXAMPLES.filter((e) => e.name.includes('Studio')).map((example) => ({
    familypilotId: example.name,
    name: example.name,
    latitude: example.latitude ?? 51.656,
    longitude: example.longitude ?? -0.418,
    category: mapGoogleCategory(example.primaryType, example.types, example.name) ?? 'museum',
  }));
  const deduped = dedupeVenueAliases(aliasCandidates);
  console.log('\nAlias dedupe (studio tour pair):', deduped.map((p) => p.name));
}

reportExamples('Before (legacy collapse: attraction→park, zoo→farm)');

console.log('\nLegacy collapsed mappings for comparison:');
for (const example of AUDIT_EXAMPLES) {
  console.log(`  ${example.name}: ${legacyCategory(example.primaryType)}`);
}

reportExamples('After (current quality-pass rules)');

if (process.argv.includes('--live')) {
  const { searchGoogle } = require(join(root, 'api/places/lib/google-places.js'));
  const lat = 51.643;
  const lng = -0.36;
  console.log('\n=== Live Bushey sync sample ===');
  try {
    const places = await searchGoogle(lat, lng, 15, { intent: 'explore' });
    const flagged = places.filter((place) =>
      /jump in|warner|harry potter|troubadour|college lane|hanwell zoo|trampoline|studio tour/i.test(
        place.name,
      ),
    );
    console.log(`Synced ${places.length} places; flagged ${flagged.length} audit-relevant rows:`);
    for (const place of flagged) {
      console.log(
        JSON.stringify({
          name: place.name,
          category: place.category,
          googlePrimaryType: place.googlePrimaryType,
          googleTypes: place.googleTypes,
        }),
      );
    }
  } catch (error) {
    console.error('Live Bushey sync skipped:', error instanceof Error ? error.message : error);
  }
}
