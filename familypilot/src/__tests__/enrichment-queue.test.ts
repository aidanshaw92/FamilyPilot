/**
 * Regression tests: enrichment queue list/stats parity and beta-area filtering.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { getEnrichmentQueueEmptyMessage } from '@/src/utils/enrichment-queue-ui';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { listQueue, getStats } = require('../../../api/enrichment/_lib/enrichment-store.js');

const BETA = { betaLat: 51.643, betaLng: -0.36, betaRadiusKm: 15 };
const OUTSIDE_BETA = { lat: 52.05, lng: 0.2 }; // well outside Bushey 15 km
const INSIDE_BETA = { lat: 51.64, lng: -0.36 };

function makePlace(id: string, coords: { lat: number; lng: number }, category = 'museum') {
  return {
    familypilot_place_id: id,
    external_id: `google-${id}`,
    provider: 'google',
    name: `Venue ${id}`,
    category,
    lat: coords.lat,
    lng: coords.lng,
    address: 'Test address',
    fetched_at: '2026-08-08T12:00:00.000Z',
    field_provenance: {
      googlePrimaryType: 'museum',
      googleTypes: ['museum', 'point_of_interest'],
    },
  };
}

function makeMetadata(id: string, enrichmentStatus: string) {
  return {
    familypilot_place_id: id,
    enrichment_status: enrichmentStatus,
    updated_at: '2026-08-08T12:00:00.000Z',
  };
}

function writeFileStore(cwd: string, places: Record<string, unknown>, metadata: Record<string, unknown>) {
  const dir = path.join(cwd, '.data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'enrichment-store.json'),
    JSON.stringify({ places, metadata }, null, 2),
  );
}

describe('enrichment queue display regression', () => {
  let originalCwd: string;
  let tempDir: string;
  let savedSupabaseUrl: string | undefined;
  let savedSupabaseKey: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-queue-test-'));
    process.chdir(tempDir);

    savedSupabaseUrl = process.env.SUPABASE_URL;
    savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const places: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};

    for (let i = 1; i <= 15; i += 1) {
      const id = `fp-google-ai-${i}`;
      places[id] = makePlace(id, OUTSIDE_BETA);
      metadata[id] = makeMetadata(id, 'ai_draft');
    }

    writeFileStore(tempDir, places, metadata);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
    else delete process.env.SUPABASE_URL;
    if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('shows all 15 ai_draft venues with All filter despite being outside beta area', async () => {
    const items = await listQueue({ provider: 'google', ...BETA });
    expect(items).toHaveLength(15);
    expect(items.every((item: { enrichmentStatus: string }) => item.enrichmentStatus === 'ai_draft')).toBe(
      true,
    );
  });

  it('shows 15 ai_draft venues with ai_draft filter outside beta area', async () => {
    const items = await listQueue({ provider: 'google', status: 'ai_draft', ...BETA });
    expect(items).toHaveLength(15);
  });

  it('shows 0 provider_only venues when none exist in beta area', async () => {
    const items = await listQueue({ provider: 'google', status: 'provider_only', ...BETA });
    expect(items).toHaveLength(0);
  });

  it('shows 0 enriched and verified venues', async () => {
    const enriched = await listQueue({ provider: 'google', status: 'enriched', ...BETA });
    const verified = await listQueue({ provider: 'google', status: 'verified', ...BETA });
    expect(enriched).toHaveLength(0);
    expect(verified).toHaveLength(0);
  });

  it('stats match queue scope: 15 discovered, 15 ai draft, 0 provider only', async () => {
    const stats = await getStats({ provider: 'google', ...BETA });
    expect(stats).toEqual({
      discovered: 15,
      providerOnly: 0,
      aiDraft: 15,
      enriched: 0,
      verified: 0,
      awaitingReview: 15,
      byCategory: { museum: 15 },
    });
  });

  it('still geo-filters provider_only discovery candidates to beta area', async () => {
    const places: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};

    places['fp-google-outside'] = makePlace('fp-google-outside', OUTSIDE_BETA);
    metadata['fp-google-outside'] = makeMetadata('fp-google-outside', 'provider_only');

    places['fp-google-inside'] = makePlace('fp-google-inside', INSIDE_BETA);
    metadata['fp-google-inside'] = makeMetadata('fp-google-inside', 'provider_only');

    writeFileStore(tempDir, places, metadata);

    const all = await listQueue({ provider: 'google', ...BETA });
    expect(all).toHaveLength(1);
    expect(all[0].familypilotId).toBe('fp-google-inside');

    const providerOnly = await listQueue({ provider: 'google', status: 'provider_only', ...BETA });
    expect(providerOnly).toHaveLength(1);
    expect(providerOnly[0].familypilotId).toBe('fp-google-inside');
  });
});

describe('enrichment queue empty-state copy', () => {
  const productionStats = {
    discovered: 15,
    providerOnly: 0,
    aiDraft: 15,
    enriched: 0,
    verified: 0,
    awaitingReview: 15,
    byCategory: { museum: 15 },
  };

  it('does not suggest syncing Google when venues exist but provider_only filter is empty', () => {
    const message = getEnrichmentQueueEmptyMessage('provider_only', productionStats);
    expect(message).toBe('No provider-only venues in this beta area.');
    expect(message).not.toMatch(/Sync Google places/);
  });

  it('uses sync prompt only when the queue is genuinely empty', () => {
    expect(getEnrichmentQueueEmptyMessage('all', null)).toMatch(/Sync Google places/);
    expect(getEnrichmentQueueEmptyMessage('all', {
      discovered: 0,
      providerOnly: 0,
      aiDraft: 0,
      enriched: 0,
      verified: 0,
      awaitingReview: 0,
      byCategory: {},
    })).toMatch(/Sync Google places/);
  });
});
