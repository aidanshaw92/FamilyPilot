import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { clearVenueDetailSeeds, seedVenueDetail, venueDetailPlaceholder } from '@/src/services/venue-detail-seed';
import type { Venue } from '@/src/types';

/**
 * The card a parent taps stands in for the venue screen while its full detail loads. It is presentation data and nothing
 * more: never cached, never fresh, replaced wholesale, never invented, and never a record of a card nobody scored.
 */
const venue = (over: Partial<Venue> = {}): Venue =>
  ({
    id: 'fp-seed', name: 'Seed Farm', category: 'farm', latitude: 51.6, longitude: -0.2, driveMinutes: 18,
    imageUrl: 'https://img.example/farm.jpg', familyScore: { score: 82, factors: {} as never, explanation: [] },
    familyMatch: { verdict: 'good', headline: 'Looks promising for your family' } as never, enrichmentStatus: 'enriched',
    ...over,
  }) as Venue;

beforeEach(() => clearVenueDetailSeeds());

describe('the seed is the card, labelled partial', () => {
  it('has nothing for a place that was not opened from a card (a deep link, a reload)', () => {
    expect(venueDetailPlaceholder('fp-seed')).toBeUndefined();
  });

  it('carries what the card knew and the empty value, never a guess, for what only the full detail knows', () => {
    seedVenueDetail(venue());
    const p = venueDetailPlaceholder('fp-seed')!;
    expect(p).toMatchObject({ id: 'fp-seed', name: 'Seed Farm', driveMinutes: 18, photos: ['https://img.example/farm.jpg'], description: '', openingHours: '', facilities: [] });
    expect(p.website).toBeUndefined();
    expect(p.phone).toBeUndefined();
    expect(p.communityTips).toBeUndefined();
    expect(p.visitDurationMinutes).toBeUndefined();
  });

  it('has no photograph rather than a made-up one when the card had none', () => {
    seedVenueDetail(venue({ imageUrl: '' }));
    expect(venueDetailPlaceholder('fp-seed')!.photos).toEqual([]);
  });

  it('is not what a card nobody scored would be: a saved place with no match or travel time is never seeded', () => {
    seedVenueDetail(venue({ familyMatch: undefined }));
    expect(venueDetailPlaceholder('fp-seed')).toBeUndefined();
    seedVenueDetail(venue({ driveMinutes: Number.NaN }));
    expect(venueDetailPlaceholder('fp-seed')).toBeUndefined();
    seedVenueDetail(venue({ familyScore: { score: Number.NaN, factors: {} as never, explanation: [] } }));
    expect(venueDetailPlaceholder('fp-seed')).toBeUndefined();
  });

  it('expires: a card from several minutes ago is not what the parent just saw', () => {
    const t0 = 1_000_000;
    seedVenueDetail(venue(), t0);
    expect(venueDetailPlaceholder('fp-seed', t0 + 4 * 60_000)).toBeDefined();
    expect(venueDetailPlaceholder('fp-seed', t0 + 6 * 60_000)).toBeUndefined();
    expect(venueDetailPlaceholder('fp-seed', t0 + 4 * 60_000)).toBeUndefined();
  });

  it('is bounded, dropping the oldest first', () => {
    for (let i = 0; i < 40; i += 1) seedVenueDetail(venue({ id: `fp-${i}` }));
    expect(venueDetailPlaceholder('fp-0')).toBeUndefined();
    expect(venueDetailPlaceholder('fp-39')).toBeDefined();
  });

  it('the newest card for a place wins', () => {
    seedVenueDetail(venue({ driveMinutes: 18 }));
    seedVenueDetail(venue({ driveMinutes: 25 }));
    expect(venueDetailPlaceholder('fp-seed')!.driveMinutes).toBe(25);
  });
});

describe('through React Query: placeholder, never cache', () => {
  const detail = { ...venue(), photos: ['a', 'b'], description: 'The full description', openingHours: 'Daily 9 to 5', facilities: ['cafe'] } as never;

  it('is shown while the request is out, is never written to the cache, and is replaced wholesale by the real detail', async () => {
    seedVenueDetail(venue());
    const client = new QueryClient();
    const key = ['venues', 'fp-seed', 1];
    let resolve!: (v: unknown) => void;
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: () => new Promise((r) => { resolve = r; }),
      placeholderData: (() => venueDetailPlaceholder('fp-seed')) as never,
    });
    const seen: Array<{ placeholder: boolean; description: string | undefined }> = [];
    const stop = observer.subscribe((r) => seen.push({ placeholder: r.isPlaceholderData, description: (r.data as unknown as { description?: string } | undefined)?.description }));

    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    expect(observer.getCurrentResult().isLoading).toBe(false);
    expect((observer.getCurrentResult().data as { name: string }).name).toBe('Seed Farm');
    // The cache holds nothing: the placeholder is not data.
    expect(client.getQueryData(key)).toBeUndefined();

    resolve(detail);
    await new Promise((r) => setTimeout(r, 10));
    const final = observer.getCurrentResult();
    expect(final.isPlaceholderData).toBe(false);
    expect((final.data as { description: string }).description).toBe('The full description');
    expect((final.data as { photos: string[] }).photos).toEqual(['a', 'b']);
    expect(client.getQueryData(key)).toBe(detail);
    stop();
  });

  it('a failed request shows an error, not the card pretending to be the place', async () => {
    seedVenueDetail(venue());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(client, {
      queryKey: ['venues', 'fp-seed', 2],
      queryFn: async () => { throw new Error('network'); },
      placeholderData: (() => venueDetailPlaceholder('fp-seed')) as never,
    });
    const stop = observer.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 20));
    const r = observer.getCurrentResult();
    expect(r.isError).toBe(true);
    expect(r.isPlaceholderData).toBe(false);
    expect(r.data).toBeUndefined();
    stop();
  });

  it('the detail already in the cache is never replaced by the card', async () => {
    seedVenueDetail(venue());
    const client = new QueryClient();
    const key = ['venues', 'fp-seed', 3];
    client.setQueryData(key, detail);
    const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => detail, placeholderData: (() => venueDetailPlaceholder('fp-seed')) as never });
    expect(observer.getCurrentResult().isPlaceholderData).toBe(false);
    expect((observer.getCurrentResult().data as unknown as { description: string }).description).toBe('The full description');
  });
});

describe('wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('useVenue takes the card as placeholderData, and only as placeholderData', () => {
    const hooks = read('src/hooks/use-queries.ts');
    expect(hooks).toMatch(/placeholderData: options\.showCardWhileLoading \? \(\) => venueDetailPlaceholder\(id\) : undefined/);
    expect(hooks).not.toMatch(/initialData: .*venueDetailPlaceholder/);
    expect(hooks).not.toMatch(/setQueryData\([^)]*venueDetailPlaceholder/);
  });

  it('only the venue screen opts in: planning and the restaurant page never receive the card as if it were the place', () => {
    expect(read('app/venue/[id].tsx')).toMatch(/useVenue\(id \?\? '', \{ showCardWhileLoading: true \}\)/);
    for (const file of ['app/plan.tsx', 'app/restaurant/[id].tsx']) {
      const source = read(file);
      expect(source, file).toMatch(/useVenue\(/);
      expect(source, file).not.toMatch(/showCardWhileLoading/);
    }
  });

  it('every card that opens a place hands it over first; a saved row, which may be unscored, does not', () => {
    expect(read('src/components/shared/DecisionCard.tsx')).toMatch(/seedVenueDetail\(venue\);\s*if \(onViewDetails\)/);
    expect(read('app/(tabs)/index.tsx')).toMatch(/seedVenueDetail\(venue\);\s*router\.push/);
    expect(read('app/(tabs)/halfway.tsx')).toMatch(/seedVenueDetail\(option\.venue\)/);
    expect(read('src/components/shared/SavedPlaceRow.tsx')).not.toMatch(/seedVenueDetail/);
  });

  it('the venue screen draws the evidence-backed sections only once the detail is real', () => {
    const screen = read('app/venue/[id].tsx');
    expect(screen).toMatch(/isPlaceholderData/);
    const pendingAt = screen.indexOf('{pending ? null : (');
    expect(pendingAt).toBeGreaterThan(0);
    // Everything evidence-backed or actionable sits after the pending gate.
    for (const marker of ['<FamilyMatchCard', '<TodayCard', 'testID="venue-create-plan"', '<FamilyEssentials', 'testID="venue-more-toggle"', '<EvidenceSection']) {
      expect(screen.indexOf(marker), marker).toBeGreaterThan(pendingAt);
    }
    // The identity the card showed is drawn before it.
    for (const marker of ['testID="venue-name"', '<FamilyMatch\n']) expect(screen.indexOf(marker), marker).toBeLessThan(pendingAt);
  });
});
