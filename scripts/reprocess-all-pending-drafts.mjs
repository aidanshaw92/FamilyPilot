#!/usr/bin/env node
/**
 * Regenerate every pending AI draft through the current evidence-backed pipeline.
 * Does not approve or publish any claims.
 *
 * Usage:
 *   ENRICHMENT_ADMIN_TOKEN=... node scripts/reprocess-all-pending-drafts.mjs
 *   ENRICHMENT_ADMIN_TOKEN=... node scripts/reprocess-all-pending-drafts.mjs --include-legacy
 *   ENRICHMENT_ADMIN_TOKEN=... node scripts/reprocess-all-pending-drafts.mjs --dry-run
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { enrichmentFetch, getConfig } from './enrichment-api-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const includeLegacy = args.has('--include-legacy');
const concurrency = Math.max(1, Math.min(Number(process.env.REPROCESS_CONCURRENCY ?? 1), 2));
const delayMs = Math.max(0, Number(process.env.REPROCESS_DELAY_MS ?? 1500));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listPendingAiDraftVenues() {
  const { items } = await enrichmentFetch('queue', {
    query: { status: 'ai_draft', sort: 'alphabetical' },
  });
  return (items ?? []).filter((item) => item.hasAiDraft !== false);
}

async function listLegacyPendingDrafts() {
  const { items } = await enrichmentFetch('legacy-drafts', {
    query: { batchSize: 100 },
  });
  return items ?? [];
}

async function regenerateVenue(item) {
  const started = Date.now();
  const result = await enrichmentFetch('generate-draft', {
    method: 'POST',
    body: { id: item.familypilotId, regenerate: true },
  });
  return {
    familypilotPlaceId: item.familypilotId,
    name: item.name,
    ok: true,
    draftId: result.draft?.id ?? null,
    evidenceStatus: result.draft?.evidenceStatus ?? result.evidenceStatus ?? null,
    durationMs: Date.now() - started,
    estimatedCostUsd: result.estimatedCostUsd ?? 0,
  };
}

async function runPool(candidates) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < candidates.length) {
      const currentIndex = index;
      index += 1;
      const item = candidates[currentIndex];
      process.stdout.write(`[${currentIndex + 1}/${candidates.length}] ${item.name} ... `);
      try {
        const result = await regenerateVenue(item);
        results.push(result);
        process.stdout.write(`ok (${result.evidenceStatus ?? 'unknown'})\n`);
      } catch (error) {
        results.push({
          familypilotPlaceId: item.familypilotId,
          name: item.name,
          ok: false,
          error: error instanceof Error ? error.message : 'Regeneration failed',
        });
        process.stdout.write(`failed\n`);
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  const config = await getConfig();
  console.log('Enrichment config:', config);

  const aiDraftVenues = await listPendingAiDraftVenues();
  const legacyVenues = includeLegacy ? await listLegacyPendingDrafts() : [];

  const byId = new Map();
  for (const item of [...aiDraftVenues, ...legacyVenues]) {
    byId.set(item.familypilotId, item);
  }
  const candidates = [...byId.values()];

  console.log(`Pending AI drafts: ${aiDraftVenues.length}`);
  if (includeLegacy) console.log(`Legacy pending drafts: ${legacyVenues.length}`);
  console.log(`Unique venues to regenerate: ${candidates.length}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'} · concurrency=${concurrency}`);

  if (dryRun) {
    for (const item of candidates) {
      console.log(`- ${item.name} (${item.familypilotId})`);
    }
    return;
  }

  const startedAt = new Date().toISOString();
  const results = await runPool(candidates);
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    estimatedCostUsd: results.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0),
    results,
  };

  const outPath = join(root, 'docs/audit-enrichment-reprocess-results.json');
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary: ${summary.succeeded}/${summary.processed} succeeded · ${summary.failed} failed`);
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
