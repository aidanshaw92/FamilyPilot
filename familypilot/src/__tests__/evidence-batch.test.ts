import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The search endpoint's evidence overlay, batched.
 *
 * The real-device run took ~10-12 s to the first Home card. On the server, every place a London search returns (~160)
 * was overlaid with its consumer-safe evidence one place at a time: a metadata read, a claims read and a visit-report
 * read, chained, plus a households read where parents had reported. ~410 database round trips per request, up to 160 in
 * flight at once (scripts/bench-places-search.cjs measures it).
 *
 * `getConsumerMetadataBatch` reads the same rows with a handful of set-based queries. These tests pin two things:
 *   1. EQUIVALENCE: for every kind of venue (reviewed, AI draft, no metadata, expired claims, legacy auto-approved claims,
 *      a claim disputed by parent reports, partners who count as one household), the batch returns exactly what the
 *      per-place projection returns. Evidence quality is not traded for speed.
 *   2. COST: the batch's round trips do not grow with the number of places.
 *
 * Supabase is intercepted through `require.cache`, as in search-cache-cost.test.ts: the server modules are CommonJS and
 * reach for the client lazily.
 */
const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const ADMIN_PATH = resolve(root, 'server/enrichment/_lib/supabase-admin.js');
const { createCountingClient } = req(resolve(process.cwd(), 'scripts/fixtures/counting-supabase.cjs'));

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);

function claim(place: string, n: number, field: string, value: unknown, over: Record<string, unknown> = {}) {
  return {
    id: `${place}-${n}`, familypilot_place_id: place, field_key: field, value_json: value, confidence: 'high',
    source_url: `https://example.org/${place}`, evidence_excerpt: 'x', source_type: 'official', checked_at: date(-30),
    valid_until: date(90), approved_at: iso(-30), approved_by: 'editor', status: 'active',
    created_at: iso(-30 + n / 100), updated_at: iso(-30), ...over,
  };
}

function tables() {
  const metadata: any[] = [];
  const claims: any[] = [];
  const reports: any[] = [];
  const connections: any[] = [];
  const facilities = (p: string, from = 0) => [
    claim(p, from + 1, 'familyFacilities.toilets', 'yes'),
    claim(p, from + 2, 'familyFacilities.babyChanging', 'yes'),
    claim(p, from + 3, 'pushchairSuitability', 'good'),
    claim(p, from + 4, 'minRecommendedAge', 0),
    claim(p, from + 5, 'maxRecommendedAge', 12),
  ];
  // reviewed
  metadata.push({ familypilot_place_id: 'p-reviewed', enrichment_status: 'enriched', last_checked: date(-30), checked_by: 'editor' });
  claims.push(...facilities('p-reviewed'));
  // AI draft: never served, whatever its claims say
  metadata.push({ familypilot_place_id: 'p-draft', enrichment_status: 'ai_draft' });
  claims.push(...facilities('p-draft'));
  // claims but no metadata row
  claims.push(...facilities('p-no-metadata'));
  // every claim past its lifetime
  claims.push(...facilities('p-expired').map((c) => ({ ...c, valid_until: date(-1) })));
  // legacy automatic approvals are not trusted
  claims.push(...facilities('p-auto').map((c) => ({ ...c, approved_by: 'ai_auto_approved' })));
  // nothing at all
  metadata.push({ familypilot_place_id: 'p-bare', enrichment_status: 'provider_only' });
  // a newer claim superseding an older one for the same field: order must be kept
  claims.push(...facilities('p-two-versions'), claim('p-two-versions', 9, 'familyFacilities.toilets', 'no', { created_at: iso(-1) }));
  // disputed: the venue says toilets, recent visits say otherwise; two of the reporters are partners (one household)
  metadata.push({ familypilot_place_id: 'p-disputed', enrichment_status: 'verified', last_checked: date(-30), checked_by: 'editor' });
  claims.push(...facilities('p-disputed'));
  for (const [user, d] of [['u1', -3], ['u2', -2], ['u3', -1], ['u4', -5]] as const) {
    reports.push({ familypilot_place_id: 'p-disputed', user_id: user, visit_date: date(d), answers: { toilets: 'no', babyChanging: 'yes' }, status: 'active', created_at: iso(d) });
  }
  connections.push({ owner_id: 'u1', guest_id: 'u2', owner_snapshot: { relationship: 'partner' } });
  connections.push({ owner_id: 'u3', guest_id: 'u4', owner_snapshot: { relationship: 'friend' } });
  // a single report, too old to count
  claims.push(...facilities('p-old-report'));
  reports.push({ familypilot_place_id: 'p-old-report', user_id: 'u9', visit_date: date(-120), answers: { toilets: 'no' }, status: 'active', created_at: iso(-120) });
  return { venue_family_metadata: metadata, venue_claims: claims, venue_visit_reports: reports, planning_connections: connections };
}

const IDS = ['p-reviewed', 'p-draft', 'p-no-metadata', 'p-expired', 'p-auto', 'p-bare', 'p-two-versions', 'p-disputed', 'p-old-report', 'p-unknown'];

let fake: ReturnType<typeof createCountingClient>;
function load() {
  for (const key of Object.keys(req.cache)) if (key.startsWith(resolve(root, 'server'))) delete req.cache[key];
  req.cache[ADMIN_PATH] = {
    id: ADMIN_PATH, filename: ADMIN_PATH, loaded: true,
    exports: { getSupabaseAdmin: () => fake.client, isSupabaseConfigured: () => true },
  } as any;
  return req(resolve(root, 'server/enrichment/_lib/consumer-projection.js'));
}

beforeEach(() => {
  fake = createCountingClient({ tables: tables() });
});

describe('the batched evidence overlay is the per-place projection, exactly', () => {
  it('returns, for every kind of venue, what getConsumerMetadata returns for it', async () => {
    const projection = load();
    const batch: Map<string, unknown> = await projection.getConsumerMetadataBatch(IDS);
    // `updatedAt` is stamped with the clock when the projection is built, so two builds differ by a millisecond.
    const stable = (m: any) => (m ? { ...m, updatedAt: 'built' } : m);
    for (const id of IDS) {
      expect(stable(batch.get(id)), id).toEqual(stable(await projection.getConsumerMetadata(id)));
    }
  });

  it('exercises the cases that matter: drafts, expiry and auto-approvals withheld; a disputed field dropped; order kept', async () => {
    const projection = load();
    const batch: Map<string, any> = await projection.getConsumerMetadataBatch(IDS);
    expect(batch.get('p-draft')).toBeNull();
    expect(batch.get('p-expired')).toBeNull();
    expect(batch.get('p-auto')).toBeNull();
    expect(batch.get('p-bare')).toBeNull();
    expect(batch.get('p-unknown')).toBeNull();
    expect(batch.get('p-reviewed')?.familyFacilities?.toilets).toBe('yes');
    // Three households said no to toilets (the partners count once): the claim is disputed, so it is not served.
    expect(batch.get('p-disputed')?.familyFacilities?.toilets).toBeUndefined();
    expect(batch.get('p-disputed')?.familyFacilities?.babyChanging).toBe('yes');
    // The newer claim wins, as it does per place.
    expect(batch.get('p-two-versions')?.familyFacilities?.toilets).toBe((await projection.getConsumerMetadata('p-two-versions'))?.familyFacilities?.toilets);
  });

  it('a missing id, a duplicate id and an empty list are handled', async () => {
    const projection = load();
    expect((await projection.getConsumerMetadataBatch([])).size).toBe(0);
    const dupes: Map<string, unknown> = await projection.getConsumerMetadataBatch(['p-reviewed', 'p-reviewed', 'p-unknown']);
    expect([...dupes.keys()]).toEqual(['p-reviewed', 'p-unknown']);
  });
});

describe('past the database page: PostgREST returns at most 1000 rows and says nothing', () => {
  // The fake client caps every read at 1000 rows, as Supabase does. A chunk of 100 venues can easily pass that in claims
  // or visit reports, where no single venue ever came near it, so the batch must page or it silently loses evidence.
  const FIELDS = ['familyFacilities.toilets', 'familyFacilities.babyChanging', 'pushchairSuitability', 'minRecommendedAge', 'maxRecommendedAge'];
  const busy = Array.from({ length: 100 }, (_, i) => `p-busy-${String(i).padStart(3, '0')}`);
  function crowd() {
    for (const id of busy) {
      // 15 active claims each (three generations of five fields): 1,500 in one chunk.
      for (let n = 0; n < 15; n++) fake.client.tables.venue_claims.push(claim(id, n, FIELDS[n % 5], n % 5 >= 3 ? n : n < 5 ? 'no' : 'yes'));
    }
    for (const id of busy.slice(0, 40)) {
      // 30 recent reports each, from 30 people: 1,200 in one chunk. Some venues' newest say "no" to toilets.
      for (let k = 0; k < 30; k++) {
        fake.client.tables.venue_visit_reports.push({
          id: `${id}-r${k}`, familypilot_place_id: id, user_id: `${id}-u${k}`, visit_date: date(-1 - k), status: 'active', created_at: iso(-1 - k),
          answers: { toilets: Number(id.slice(-3)) % 2 === 0 && k < 6 ? 'no' : 'yes' },
        });
      }
    }
  }

  it('every active claim of every venue arrives, in the same order as per venue', async () => {
    load();
    crowd();
    expect(fake.client.tables.venue_claims.filter((c: any) => busy.includes(c.familypilot_place_id)).length).toBeGreaterThan(1000);
    const claimsStore = req(resolve(root, 'server/enrichment/_lib/claims-store.js'));
    const batch: Map<string, any[]> = await claimsStore.getActiveClaimsBatch(busy);
    for (const id of busy) {
      const one = await claimsStore.getActiveClaims(id);
      expect(batch.get(id)!.map((c) => c.id), id).toEqual(one.map((c: any) => c.id));
      expect(one).toHaveLength(15);
    }
  });

  it('every venue’s visit reports arrive, so disputes are the same as per venue', async () => {
    load();
    crowd();
    const feedback = req(resolve(root, 'server/feedback/_lib/store.js'));
    const claimsStore = req(resolve(root, 'server/enrichment/_lib/claims-store.js'));
    const claimsById = await claimsStore.getActiveClaimsBatch(busy);
    const batch: Map<string, unknown> = await feedback.venueFeedbackBatch(claimsById);
    for (const id of busy) expect(batch.get(id), id).toEqual(await feedback.venueFeedback(id, claimsById.get(id)));
  });

  it('and the whole projection still equals the per-place one', async () => {
    const projection = load();
    crowd();
    const batch: Map<string, unknown> = await projection.getConsumerMetadataBatch(busy);
    const stable = (m: any) => (m ? { ...m, updatedAt: 'built' } : m);
    for (const id of busy) expect(stable(batch.get(id)), id).toEqual(stable(await projection.getConsumerMetadata(id)));
    expect([...batch.values()].filter(Boolean)).toHaveLength(100);
  });
});

describe('cost: round trips do not grow with the number of places', () => {
  it('the per-place path makes several round trips per place; the batch makes a handful for all of them', async () => {
    const projection = load();
    const many = Array.from({ length: 160 }, (_, i) => IDS[i % IDS.length] + (i < IDS.length ? '' : `-x${i}`));
    for (const id of many.filter((id) => id.includes('-x'))) {
      fake.client.tables.venue_claims.push(claim(id, 1, 'familyFacilities.toilets', 'yes'));
    }

    fake.stats.queries = 0;
    await Promise.all(many.map((id) => projection.getConsumerMetadata(id)));
    const perPlace = fake.stats.queries;

    fake.stats.queries = 0;
    await projection.getConsumerMetadataBatch(many);
    const batched = fake.stats.queries;

    expect(perPlace).toBeGreaterThanOrEqual(300);
    // metadata + claims (two chunks of 100 each), reports, connections.
    expect(batched).toBeLessThanOrEqual(8);
  });
});

describe('the search endpoint uses the batch, and says where its time went', () => {
  const read = (path: string) => req('node:fs').readFileSync(resolve(root, path), 'utf8') as string;
  const search = read('api/places/search.js');

  it('overlays evidence with one batched projection, never one call per place', () => {
    expect(search).toContain('getConsumerMetadataBatch(places.map((place) => place.familypilotId))');
    expect(search).not.toMatch(/places\.map\(async \(place\) => \{\s*const metadata = await getConsumerMetadata/);
  });

  it('Meet halfway’s catalogue search does too', () => {
    const between = read('server/places/lib/between-endpoint.js');
    expect(between).toContain('getConsumerMetadataBatch');
    expect(between).not.toMatch(/await getConsumerMetadata\(place\.familypilotId\)/);
  });

  it('keeps discovering on every production Explore search (cache hits included), alongside the reads, not before them', () => {
    expect(search).toContain("if (!(process.env.VERCEL_ENV === 'production' && intent === 'explore')) return;");
    expect(search).not.toMatch(/intent === 'explore' && cacheState === 'miss'/);
    expect(search).toContain('await Promise.all([evidence, food, discovery])');
  });

  it('reports per-stage timing and its region on every successful response', () => {
    expect(search).toContain("res.setHeader('Server-Timing', header)");
    expect(search).toContain("res.setHeader('X-FamilyPilot-Region'");
    for (const stage of ['budget', 'cache', 'provider', 'catalogue', 'evidence']) expect(search).toContain(`timing.mark('${stage}')`);
  });

  it('still primes the budget before anything can spend (unchanged)', () => {
    expect(search.indexOf('await primePlacesBudget()')).toBeGreaterThan(-1);
    expect(search.indexOf('await primePlacesBudget()')).toBeLessThan(search.indexOf('? await searchLondonGrid(configuredProvider'));
  });
});
