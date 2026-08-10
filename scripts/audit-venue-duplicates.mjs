#!/usr/bin/env node
/**
 * Detect potential duplicate venues from stored place records and canonical links.
 *
 * Usage:
 *   ENRICHMENT_ADMIN_TOKEN=... node scripts/audit-venue-duplicates.mjs
 *   node scripts/audit-venue-duplicates.mjs --heuristic-only
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { enrichmentFetch } from './enrichment-api-client.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { findVenueAliasPairs } = require(join(root, 'api/places/lib/venue-alias-detection.js'));
const { listDuplicateGroups } = require(join(root, 'api/places/lib/canonical-venues.js'));

async function loadPlaceRecordsFromQueue() {
  const { items } = await enrichmentFetch('queue', { query: { sort: 'alphabetical' } });
  return (items ?? []).map((item) => ({
    familypilotId: item.familypilotId,
    name: item.name,
    latitude: item.latitude ?? item.lat,
    longitude: item.longitude ?? item.lng,
    provider: item.provider ?? 'google',
    externalId: item.externalId ?? null,
  }));
}

async function main() {
  const heuristicOnly = process.argv.includes('--heuristic-only');
  let heuristicPairs = [];
  let storedGroups = [];

  if (!heuristicOnly) {
    try {
      const places = await loadPlaceRecordsFromQueue();
      const { pairs } = findVenueAliasPairs(places);
      heuristicPairs = pairs.map((pair) => ({
        primaryId: pair.primary.familypilotId,
        primaryName: pair.primary.name,
        aliasId: pair.alias.familypilotId,
        aliasName: pair.alias.name,
        distanceKm: pair.distanceKm,
        matchConfidence: pair.matchConfidence,
        matchMethod: pair.matchMethod,
        linkedInDatabase: false,
      }));
    } catch (error) {
      console.warn('Queue heuristic scan skipped:', error.message ?? error);
    }
  }

  try {
    storedGroups = await listDuplicateGroups();
  } catch (error) {
    console.warn('Canonical group load skipped:', error.message ?? error);
  }

  for (const pair of heuristicPairs) {
    const linked = storedGroups.some((group) =>
      group.members.some(
        (member) =>
          member.familypilotPlaceId === pair.primaryId || member.familypilotPlaceId === pair.aliasId,
      ),
    );
    pair.linkedInDatabase = linked;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    heuristicPairCount: heuristicPairs.length,
    storedGroupCount: storedGroups.length,
    unlinkedHeuristicPairs: heuristicPairs.filter((pair) => !pair.linkedInDatabase),
    heuristicPairs,
    storedGroups,
  };

  const outJson = join(root, 'docs/audit-venue-duplicates.json');
  const outMd = join(root, 'docs/audit-venue-duplicates.md');

  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const lines = [
    '# Venue duplicate audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Stored canonical groups',
    '',
    '| Display name | Primary ID | Review status | Members |',
    '| --- | --- | --- | --- |',
    ...storedGroups.map(
      (group) =>
        `| ${group.displayName} | ${group.primaryFamilypilotPlaceId} | ${group.reviewStatus} | ${group.members.map((m) => `${m.linkType}:${m.familypilotPlaceId}`).join('; ')} |`,
    ),
    '',
    '## Heuristic pairs',
    '',
    '| Primary | Alias | Distance km | Linked |',
    '| --- | --- | --- | --- |',
    ...heuristicPairs.map(
      (pair) =>
        `| ${pair.primaryName} | ${pair.aliasName} | ${pair.distanceKm.toFixed(3)} | ${pair.linkedInDatabase ? 'yes' : 'no'} |`,
    ),
    '',
  ];

  writeFileSync(outMd, lines.join('\n'));
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Stored groups: ${storedGroups.length}`);
  console.log(`Heuristic pairs: ${heuristicPairs.length}`);
  console.log(`Unlinked heuristic pairs: ${report.unlinkedHeuristicPairs.length}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
