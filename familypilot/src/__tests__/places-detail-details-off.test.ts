import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * What a venue page does when the Place Details scope is switched OFF (GOOGLE_PLACES_DETAILS_ENABLED=false, which is also the
 * default under a test runtime) and the stored copy of the venue is of different ages. Every case installs a fetch tripwire:
 * the assertion is that Google is never asked, not merely that an error was thrown.
 */
const req = createRequire(import.meta.url);
const root = '../../../';
let handler: (rq: unknown, rs: unknown) => Promise<unknown>;
let stored: { fetchedAt: string; familypilotId: string; name: string; provider: string } | null = null;

function stub(path: string, exports: unknown) {
  const resolved = req.resolve(root + path);
  req.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports, children: [], paths: [], path: '' } as never;
}
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

beforeAll(() => {
  process.env.PLACES_PROVIDER = 'google';
  stub('server/enrichment/_lib/enrichment-store.js', { getPlaceRecord: async () => stored });
  stub('server/places/lib/canonical-venues.js', { getCanonicalIdentity: async () => null, resolvePrimaryPlaceId: async (id: string) => id });
  stub('server/enrichment/_lib/consumer-projection.js', { getConsumerMetadata: async () => null, getVenueStaleFacts: async () => [] });
  stub('server/feedback/_lib/store.js', { venueHasRecentReports: async () => null });
  handler = req(root + 'api/places/detail.js');
});
afterEach(() => vi.unstubAllGlobals());

async function open(ageDays: number | null) {
  stored = ageDays === null ? null : { fetchedAt: daysAgo(ageDays), familypilotId: 'fp-google-ChIJtest', name: 'Test venue', provider: 'google' };
  const tripwire = vi.fn(async () => { throw new Error('Google must not be asked'); });
  vi.stubGlobal('fetch', tripwire);
  const out: { status: number; json: Record<string, unknown> } = { status: 200, json: {} };
  const res = { setHeader() {}, status(c: number) { out.status = c; return res; }, json(j: Record<string, unknown>) { out.json = j; return res; } };
  await handler({ method: 'GET', query: { id: 'fp-google-ChIJtest' }, headers: {} }, res);
  return { ...out, googleCalls: tripwire.mock.calls.length };
}

describe('Place Details off: a venue page from a stored copy of each age', () => {
  it('under 7 days: served from the store, no refresh attempted', async () => {
    const r = await open(1);
    expect(r.status).toBe(200);
    expect(r.json.cached).toBe(true);
    expect(r.json.fallbackUsed).toBe(false);
    expect(r.googleCalls).toBe(0);
  });

  it('7 to 30 days: still served from the store, and the response says it was not refreshed', async () => {
    for (const age of [10, 27.9, 29.9]) {
      const r = await open(age);
      expect(r.status, `age ${age}`).toBe(200);
      expect(r.json.cached).toBe(true);
      expect(r.json.fallbackUsed).toBe(true);
      expect(String(r.json.fallbackReason)).toMatch(/served from store/);
      expect(r.googleCalls).toBe(0);
    }
  });

  it('over 30 days (the limit Google lets us cache for): refused visibly with a 503, never served, never refreshed', async () => {
    for (const age of [30.1, 45]) {
      const r = await open(age);
      expect(r.status, `age ${age}`).toBe(503);
      expect(r.json.error).toBe('Live venue details are unavailable');
      expect(r.googleCalls).toBe(0);
    }
  });

  it('no stored copy at all: a visible 503, no Google call', async () => {
    const r = await open(null);
    expect(r.status).toBe(503);
    expect(r.googleCalls).toBe(0);
  });
});
