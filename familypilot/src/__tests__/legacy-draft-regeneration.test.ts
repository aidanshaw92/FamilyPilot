/**
 * Regression tests: legacy → evidence-backed draft regeneration.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { isLegacyDraft } from '@/src/utils/legacy-draft';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const draftStore = require('../../../api/enrichment/_lib/draft-store.js');

function writeEnrichmentStore(cwd: string, places: Record<string, unknown>, metadata: Record<string, unknown>) {
  const dir = path.join(cwd, '.data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'enrichment-store.json'), JSON.stringify({ places, metadata }, null, 2));
}

function writeDraftStore(cwd: string, drafts: unknown[]) {
  const dir = path.join(cwd, '.data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'enrichment-drafts.json'), JSON.stringify({ drafts }, null, 2));
}

function makePlace(id: string) {
  return {
    familypilot_place_id: id,
    external_id: `ext-${id}`,
    provider: 'google',
    name: `Venue ${id}`,
    category: 'museum',
    lat: 51.64,
    lng: -0.36,
    fetched_at: '2026-08-08T12:00:00.000Z',
    field_provenance: { googlePrimaryType: 'museum', googleTypes: ['museum'] },
  };
}

function makeLegacyDraft(id: string, draftId: string) {
  return {
    id: draftId,
    familypilot_place_id: id,
    external_id: `ext-${id}`,
    draft_json: {
      overallDraftConfidence: 'low',
      familyFacilities: {},
      pushchairSuitability: { value: 'unknown', confidence: 'unknown' },
    },
    model: 'legacy-model',
    generated_at: '2026-01-01T12:00:00.000Z',
    source_context: {},
    confidence_json: {},
    evidence_status: 'legacy_no_sources',
    status: 'pending_review',
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
  };
}

describe('legacy draft identification', () => {
  it('isLegacyDraft detects legacy_no_sources pending drafts', () => {
    expect(isLegacyDraft({
      id: 'd1',
      familypilotPlaceId: 'fp-google-1',
      status: 'pending_review',
      evidenceStatus: 'legacy_no_sources',
    } as never)).toBe(true);
  });

  it('isLegacyDraft rejects evidence-backed pending drafts', () => {
    expect(isLegacyDraft({
      id: 'd1',
      familypilotPlaceId: 'fp-google-1',
      status: 'pending_review',
      evidenceStatus: 'evidence_backed',
    } as never)).toBe(false);
  });
});

describe('listLegacyPendingDrafts', () => {
  let originalCwd: string;
  let tempDir: string;
  let savedSupabaseUrl: string | undefined;
  let savedSupabaseKey: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-legacy-draft-'));
    process.chdir(tempDir);

    savedSupabaseUrl = process.env.SUPABASE_URL;
    savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const places: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};
    const drafts: unknown[] = [];

    for (let i = 1; i <= 3; i += 1) {
      const id = `fp-google-legacy-${i}`;
      places[id] = makePlace(id);
      metadata[id] = {
        familypilot_place_id: id,
        enrichment_status: 'ai_draft',
        updated_at: '2026-08-08T12:00:00.000Z',
      };
      drafts.push(makeLegacyDraft(id, `draft-${i}`));
    }

    places['fp-google-enriched'] = makePlace('fp-google-enriched');
    metadata['fp-google-enriched'] = {
      familypilot_place_id: 'fp-google-enriched',
      enrichment_status: 'enriched',
      updated_at: '2026-08-08T12:00:00.000Z',
    };
    drafts.push(makeLegacyDraft('fp-google-enriched', 'draft-enriched'));

    places['fp-google-evidence'] = makePlace('fp-google-evidence');
    metadata['fp-google-evidence'] = {
      familypilot_place_id: 'fp-google-evidence',
      enrichment_status: 'ai_draft',
      updated_at: '2026-08-08T12:00:00.000Z',
    };
    drafts.push({
      ...makeLegacyDraft('fp-google-evidence', 'draft-evidence'),
      evidence_status: 'evidence_backed',
    });

    writeEnrichmentStore(tempDir, places, metadata);
    writeDraftStore(tempDir, drafts);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
    else delete process.env.SUPABASE_URL;
    if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('lists only legacy pending drafts for ai_draft venues', async () => {
    const items = await draftStore.listLegacyPendingDrafts({ provider: 'google', batchSize: 25 });
    expect(items).toHaveLength(3);
    expect(items.every((item: { evidenceStatus: string }) => item.evidenceStatus === 'legacy_no_sources')).toBe(true);
  });

  it('excludes enriched and verified venues even when a stale legacy draft exists', async () => {
    const items = await draftStore.listLegacyPendingDrafts({ provider: 'google', batchSize: 25 });
    expect(items.some((item: { familypilotPlaceId: string }) => item.familypilotPlaceId === 'fp-google-enriched')).toBe(false);
  });

  it('excludes already evidence-backed pending drafts', async () => {
    const items = await draftStore.listLegacyPendingDrafts({ provider: 'google', batchSize: 25 });
    expect(items.some((item: { familypilotPlaceId: string }) => item.familypilotPlaceId === 'fp-google-evidence')).toBe(false);
  });
});

describe('legacy draft superseding and protection', () => {
  let originalCwd: string;
  let tempDir: string;
  let savedSupabaseUrl: string | undefined;
  let savedSupabaseKey: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-legacy-regen-'));
    process.chdir(tempDir);

    savedSupabaseUrl = process.env.SUPABASE_URL;
    savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const id = 'fp-google-legacy-1';
    writeEnrichmentStore(tempDir, {
      [id]: makePlace(id),
      'fp-google-verified': makePlace('fp-google-verified'),
      'fp-google-enriched': makePlace('fp-google-enriched'),
    }, {
      [id]: { familypilot_place_id: id, enrichment_status: 'ai_draft' },
      'fp-google-verified': { familypilot_place_id: 'fp-google-verified', enrichment_status: 'verified' },
      'fp-google-enriched': { familypilot_place_id: 'fp-google-enriched', enrichment_status: 'enriched' },
    });
    writeDraftStore(tempDir, [makeLegacyDraft(id, 'draft-old')]);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
    else delete process.env.SUPABASE_URL;
    if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('supersedes legacy pending draft so only one pending row remains after replacement', async () => {
    await draftStore.supersedePendingDrafts('fp-google-legacy-1');
    expect(await draftStore.getPendingDraft('fp-google-legacy-1')).toBeNull();

    const store = JSON.parse(fs.readFileSync(path.join(tempDir, '.data', 'enrichment-drafts.json'), 'utf8'));
    expect(store.drafts.filter((d: { status: string }) => d.status === 'superseded')).toHaveLength(1);
    expect(store.drafts.find((d: { id: string }) => d.id === 'draft-old')?.status).toBe('superseded');
  });

  it('generateDraftForVenue rejects enriched venues without regenerate flag', async () => {
    await expect(draftStore.generateDraftForVenue('fp-google-enriched')).rejects.toThrow(
      /enriched or verified venue/i,
    );
  });

  it('generateDraftForVenue rejects verified venues without regenerate flag', async () => {
    await expect(draftStore.generateDraftForVenue('fp-google-verified')).rejects.toThrow(
      /enriched or verified venue/i,
    );
  });

  it('does not mutate enriched or verified metadata when generation is blocked', async () => {
    await expect(draftStore.generateDraftForVenue('fp-google-verified')).rejects.toThrow();
    const metaStore = JSON.parse(fs.readFileSync(path.join(tempDir, '.data', 'enrichment-store.json'), 'utf8'));
    expect(metaStore.metadata['fp-google-verified'].enrichment_status).toBe('verified');
    expect(metaStore.metadata['fp-google-enriched'].enrichment_status).toBe('enriched');
  });
});

describe('client legacy batch regeneration', () => {
  it('processes legacy drafts with limited concurrency', async () => {
    const { enrichmentApi } = await import('@/src/services/enrichment/enrichment-api-client');
    const originalGetLegacy = enrichmentApi.getLegacyDrafts;
    const originalRegenerate = enrichmentApi.regenerateDraftWithEvidence;

    let concurrent = 0;
    let maxConcurrent = 0;

    enrichmentApi.getLegacyDrafts = vi.fn().mockResolvedValue({
      items: [
        { familypilotPlaceId: 'a', name: 'Venue A' },
        { familypilotPlaceId: 'b', name: 'Venue B' },
        { familypilotPlaceId: 'c', name: 'Venue C' },
      ],
      count: 3,
    });

    enrichmentApi.regenerateDraftWithEvidence = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent -= 1;
      return {
        draft: { id: 'd-new', evidenceStatus: 'evidence_backed' },
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        estimatedCostUsd: 0.001,
      };
    });

    const result = await enrichmentApi.regenerateLegacyDraftBatch({ batchSize: 3, concurrency: 2 });

    expect(result.succeeded).toBe(3);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(enrichmentApi.regenerateDraftWithEvidence).toHaveBeenCalledTimes(3);

    enrichmentApi.getLegacyDrafts = originalGetLegacy;
    enrichmentApi.regenerateDraftWithEvidence = originalRegenerate;
  });
});
