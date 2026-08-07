#!/usr/bin/env node
/**
 * Live audit script — compares legacy vs quality-pass Explore filtering.
 * Usage: node scripts/audit-google-quality.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { searchGoogle } = require(join(root, 'api/places/lib/google-places.js'));

const LEGACY_INCLUDED = ['park', 'museum', 'restaurant', 'cafe', 'zoo'];
const IRRELEVANT_CATEGORIES = new Set(['hotel', 'shop', 'restaurant', 'cafe']);
const IRRELEVANT_PRIMARY = new Set([
  'hotel', 'lodging', 'supermarket', 'grocery_store', 'department_store',
  'shopping_mall', 'gas_station', 'bar', 'pub', 'movie_theater', 'bank',
]);

function legacyMapCategory(primaryType) {
  if (!primaryType) return 'park';
  if (primaryType.includes('restaurant') || primaryType === 'cafe') return 'restaurant';
  if (primaryType === 'hotel' || primaryType === 'lodging') return 'hotel';
  if (primaryType === 'supermarket') return 'shop';
  if (primaryType === 'museum') return 'museum';
  if (primaryType === 'zoo') return 'farm';
  return 'park';
}

function countIrrelevantLegacy(places) {
  return places.filter((p) => {
    const cat = legacyMapCategory(p.googlePrimaryType ?? p.primaryType);
    const primary = p.googlePrimaryType ?? p.primaryType;
    return IRRELEVANT_CATEGORIES.has(cat) || (primary && IRRELEVANT_PRIMARY.has(primary));
  }).length;
}

function countIrrelevantNew(places) {
  return places.filter((p) => {
    return IRRELEVANT_CATEGORIES.has(p.category) ||
      (p.googlePrimaryType && IRRELEVANT_PRIMARY.has(p.googlePrimaryType));
  }).length;
}

const AUDIT_LOCATIONS = [
  { name: 'Bushey', lat: 51.643, lng: -0.360 },
  { name: 'Edinburgh', lat: 55.953, lng: -3.188 },
  { name: 'Manchester', lat: 53.480, lng: -2.242 },
  { name: 'Bristol', lat: 51.454, lng: -2.587 },
  { name: 'Cardiff', lat: 51.481, lng: -3.179 },
  { name: 'Central London', lat: 51.507, lng: -0.128 },
];

async function fetchLegacySample(lat, lng) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not set');

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.types,places.location',
    },
    body: JSON.stringify({
      includedTypes: LEGACY_INCLUDED,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 15000 },
      },
    }),
  });

  const data = await response.json();
  return (data.places ?? []).map((p) => ({
    name: p.displayName?.text,
    primaryType: p.primaryType,
    types: p.types ?? [],
    category: legacyMapCategory(p.primaryType),
  }));
}

async function runAudit() {
  const results = [];

  for (const loc of AUDIT_LOCATIONS) {
    process.stdout.write(`Auditing ${loc.name}… `);
    const legacy = await fetchLegacySample(loc.lat, loc.lng);
    const filtered = await searchGoogle(loc.lat, loc.lng, 15, { intent: 'explore' });

    const legacyIrrelevant = legacy.filter((p) => {
      return IRRELEVANT_CATEGORIES.has(p.category) ||
        (p.primaryType && IRRELEVANT_PRIMARY.has(p.primaryType));
    }).length;

    const newIrrelevant = countIrrelevantNew(filtered);
    const reduction = legacyIrrelevant > 0
      ? Math.round(((legacyIrrelevant - newIrrelevant) / legacyIrrelevant) * 100)
      : 100;

    results.push({
      location: loc.name,
      legacyCount: legacy.length,
      legacyIrrelevant,
      newCount: filtered.length,
      newIrrelevant,
      reductionPercent: reduction,
      filteredSample: filtered.slice(0, 5).map((p) => ({
        name: p.name,
        category: p.category,
        googlePrimaryType: p.googlePrimaryType,
        enrichmentStatus: p.enrichmentStatus,
      })),
      excludedLegacySample: legacy
        .filter((p) => IRRELEVANT_CATEGORIES.has(p.category) || IRRELEVANT_PRIMARY.has(p.primaryType))
        .slice(0, 5)
        .map((p) => ({ name: p.name, primaryType: p.primaryType, legacyCategory: p.category })),
    });
    console.log(`${legacyIrrelevant} → ${newIrrelevant} irrelevant (${reduction}% reduction)`);
  }

  const outPath = join(root, 'docs/audit-google-quality-results.json');
  writeFileSync(outPath, JSON.stringify({ auditedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote ${outPath}`);
  return results;
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
