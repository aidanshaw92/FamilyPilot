import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const storePath = path.join(process.cwd(), '.data/canonical-venues.json');

let savedSupabaseUrl: string | undefined;
let savedSupabaseKey: string | undefined;

describe('canonical venue identity', () => {
  beforeEach(() => {
    savedSupabaseUrl = process.env.SUPABASE_URL;
    savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
  });

  afterEach(() => {
    if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
    else delete process.env.SUPABASE_URL;
    if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
  });

  it('suppresses alias place ids while keeping the primary record', async () => {
    const {
      upsertHeuristicLink,
      filterPlacesToCanonicalPrimaries,
      invalidateCanonicalCache,
    } = await import('../../../api/places/lib/canonical-venues.js');

    await upsertHeuristicLink({
      primary: {
        familypilotId: 'fp-google-warner',
        name: 'Warner Bros. Studio Tour London',
        provider: 'google',
        externalId: 'google:warner',
      },
      alias: {
        familypilotId: 'fp-google-hp',
        name: 'Harry Potter Studio',
        provider: 'google',
        externalId: 'google:hp',
      },
      reviewStatus: 'confirmed',
      matchMethod: 'manual:test',
      matchConfidence: 0.95,
    });
    invalidateCanonicalCache();

    const places = [
      {
        familypilotId: 'fp-google-warner',
        name: 'Warner Bros. Studio Tour London',
        latitude: 51.692,
        longitude: -0.418,
      },
      {
        familypilotId: 'fp-google-hp',
        name: 'Harry Potter Studio',
        latitude: 51.693,
        longitude: -0.417,
      },
    ];

    const filtered = await filterPlacesToCanonicalPrimaries(places);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].familypilotId).toBe('fp-google-warner');
    expect(filtered[0].canonicalPlaceId).toBe('fp-google-warner');
  });

  it('resolves alias ids to the primary place id', async () => {
    const { upsertHeuristicLink, resolvePrimaryPlaceId, invalidateCanonicalCache } = await import(
      '../../../api/places/lib/canonical-venues.js'
    );

    await upsertHeuristicLink({
      primary: {
        familypilotId: 'fp-google-warner',
        name: 'Warner Bros. Studio Tour London',
      },
      alias: {
        familypilotId: 'fp-google-hp',
        name: 'Harry Potter Studio',
      },
      reviewStatus: 'confirmed',
    });
    invalidateCanonicalCache();

    await expect(resolvePrimaryPlaceId('fp-google-hp')).resolves.toBe('fp-google-warner');
    await expect(resolvePrimaryPlaceId('fp-google-warner')).resolves.toBe('fp-google-warner');
  });

  it('does not auto-merge rejected canonical groups', async () => {
    const {
      upsertHeuristicLink,
      filterPlacesToCanonicalPrimaries,
      invalidateCanonicalCache,
      loadCanonicalStore,
    } = await import('../../../api/places/lib/canonical-venues.js');

    await upsertHeuristicLink({
      primary: { familypilotId: 'fp-google-a', name: 'Venue A' },
      alias: { familypilotId: 'fp-google-b', name: 'Venue B Alias' },
      reviewStatus: 'rejected',
    });

    const store = await loadCanonicalStore(true);
    const canonical = Object.values(store.canonicalVenues)[0];
    store.canonicalVenues[canonical.id].reviewStatus = 'rejected';
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    invalidateCanonicalCache();

    const filtered = await filterPlacesToCanonicalPrimaries([
      { familypilotId: 'fp-google-a', name: 'Venue A', latitude: 51.6, longitude: -0.3 },
      { familypilotId: 'fp-google-b', name: 'Venue B Alias', latitude: 51.601, longitude: -0.301 },
    ]);

    expect(filtered).toHaveLength(2);
  });
});

describe('venue alias detection', () => {
  it('finds Warner Bros / Harry Potter as alias pairs', async () => {
    const { findVenueAliasPairs } = await import('../../../api/places/lib/venue-alias-detection.js');
    const { places, pairs } = findVenueAliasPairs([
      {
        familypilotId: 'fp-google-warner',
        name: 'Warner Bros. Studio Tour London',
        latitude: 51.692,
        longitude: -0.418,
      },
      {
        familypilotId: 'fp-google-hp',
        name: 'Harry Potter Studio',
        latitude: 51.693,
        longitude: -0.417,
      },
    ]);

    expect(places).toHaveLength(1);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].primary.familypilotId).toBe('fp-google-warner');
    expect(pairs[0].alias.familypilotId).toBe('fp-google-hp');
  });
});
