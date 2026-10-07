import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Two execution paths that must spend nothing and change nothing they should not:
 *
 *   - Google disabled: `ensurePlaceDetails` / `gatherEvidenceForVenue` with `googleAccess: 'disabled'` never build a
 *     Place Details request, however stale or websiteless the stored row. Proven against a control that shows the same
 *     row WOULD have asked Google on the ordinary path, so the assertion is about the switch and not about the fixture.
 *   - Stored re-extraction (`evidenceMode: 'stored'`): the latest stored reading of each page goes through the current
 *     extractor and the ordinary approval pipeline with no network at all, and every claim it yields is dated from the
 *     reading, not from today. Running it twice over the same text writes no second claim.
 *
 * The server modules are plain CommonJS, so the network is replaced where it enters (the cached module's export), and
 * the stores fall back to `.data` because the Supabase variables are unset. Everything else -- extraction, scope,
 * reconciliation, approval, claim writing -- is the production code.
 */
const GOOGLE = require.resolve('../../../server/places/lib/google-places.js');
const FETCHER = require.resolve('../../../server/enrichment/_lib/source-fetcher.js');
const PIPELINE = require.resolve('../../../server/enrichment/_lib/evidence-pipeline.js');
const DRAFTS = require.resolve('../../../server/enrichment/_lib/draft-store.js');

const VENUE = 'fp-google-ChIJreprocessTestVenue0000000';
const WEBSITE = 'https://reprocess.example/';
const PAGE = 'https://reprocess.example/visit';
const PAGE_TEXT =
  'Plan your visit. Toilets, including baby changing facilities, are available on site. ' +
  'Our café serves hot drinks and sandwiches. Dogs on leads are welcome.';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let env: NodeJS.ProcessEnv;
let googleCalls: string[];
let fetchCalls: string[];
let realGetGooglePlace: unknown;
let realFetchOfficialPage: unknown;
let realFetch: typeof fetch;

function seedStores(evidence: Array<Record<string, unknown>>) {
  fs.mkdirSync('.data', { recursive: true });
  fs.writeFileSync(path.join('.data', 'venue-source-evidence.json'), JSON.stringify({ records: evidence }));
  fs.writeFileSync(path.join('.data', 'venue-claims.json'), JSON.stringify({ claims: [] }));
  fs.writeFileSync(path.join('.data', 'enrichment-drafts.json'), JSON.stringify({ drafts: [] }));
  fs.writeFileSync(
    path.join('.data', 'enrichment-store.json'),
    JSON.stringify({
      places: {
        [VENUE]: {
          familypilot_place_id: VENUE,
          external_id: 'google:reprocess',
          provider: 'google',
          name: 'Reprocess Test Venue',
          category: 'museum',
          lat: 51.6,
          lng: -0.24,
          address: '1 Test Row',
          website: WEBSITE,
          fetched_at: daysAgo(100),
        },
      },
      metadata: {
        [VENUE]: { familypilot_place_id: VENUE, enrichment_status: 'enriched' },
      },
    }),
  );
}

const evidenceRow = (retrievedAt: string, text = PAGE_TEXT) => ({
  id: `evidence-${retrievedAt}`,
  familypilot_place_id: VENUE,
  source_url: PAGE,
  source_type: 'official_website',
  page_title: 'Plan your visit | Reprocess Test Venue',
  retrieved_at: retrievedAt,
  content_hash: `hash-${retrievedAt}`,
  extracted_text: text,
  extracted_evidence: [],
  fetch_status: 'ok',
  http_status: 200,
  subject_scope: 'venue_own_subtree',
  subject_scope_reason: 'under_own_website',
  created_at: retrievedAt,
});

beforeEach(() => {
  env = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.ENRICHMENT_AUTO_APPROVE = 'true';
  googleCalls = [];
  fetchCalls = [];
  realGetGooglePlace = require(GOOGLE).getGooglePlace;
  realFetchOfficialPage = require(FETCHER).fetchOfficialPage;
  realFetch = globalThis.fetch;
  // The two places the network enters, replaced by recorders. Any call is a failure of the path under test.
  require(GOOGLE).getGooglePlace = async (id: string) => { googleCalls.push(id); return null; };
  require(FETCHER).fetchOfficialPage = async (url: string) => {
    fetchCalls.push(url);
    return { ok: false, fetchStatus: 'error', error: 'network disabled in test', url, html: null };
  };
  globalThis.fetch = (async (input: unknown) => {
    throw new Error(`unexpected network call: ${String(input)}`);
  }) as typeof fetch;
  delete require.cache[PIPELINE];
  delete require.cache[DRAFTS];
});

afterEach(() => {
  process.env = env;
  require(GOOGLE).getGooglePlace = realGetGooglePlace;
  require(FETCHER).fetchOfficialPage = realFetchOfficialPage;
  globalThis.fetch = realFetch;
  delete require.cache[PIPELINE];
  delete require.cache[DRAFTS];
});

describe('Google-disabled execution path', () => {
  const staleRow = { familypilot_place_id: VENUE, name: 'Stale', website: null, fetched_at: daysAgo(100) };

  it('control: the ordinary path asks Google for a stale row with no website', async () => {
    const { ensurePlaceDetails } = require(PIPELINE);
    await ensurePlaceDetails(VENUE, staleRow);
    expect(googleCalls).toEqual([VENUE]);
  });

  it('never builds the request when access is disabled, whatever the row looks like', async () => {
    const { ensurePlaceDetails, GOOGLE_ACCESS_DISABLED } = require(PIPELINE);
    const back = await ensurePlaceDetails(VENUE, staleRow, { googleAccess: GOOGLE_ACCESS_DISABLED });
    expect(back).toBe(staleRow);
    expect(googleCalls).toEqual([]);
  });

  it('a whole gather with Google disabled and no known website reads nothing and spends nothing', async () => {
    seedStores([]);
    const { gatherEvidenceForVenue, GOOGLE_ACCESS_DISABLED } = require(PIPELINE);
    const bundle = await gatherEvidenceForVenue(VENUE, staleRow, {
      googleAccess: GOOGLE_ACCESS_DISABLED,
      catalogue: [],
    });
    expect(bundle.sourceStatus).toBe('no_official_source');
    expect(googleCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  it('with Google disabled the known website is still crawled, and that is the only network used', async () => {
    seedStores([]);
    const { gatherEvidenceForVenue, GOOGLE_ACCESS_DISABLED } = require(PIPELINE);
    await gatherEvidenceForVenue(VENUE, { ...staleRow, website: WEBSITE }, {
      googleAccess: GOOGLE_ACCESS_DISABLED,
      catalogue: [{ familypilotPlaceId: VENUE, name: 'Stale', website: WEBSITE }],
    });
    expect(googleCalls).toEqual([]);
    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls.every((u) => u.startsWith(WEBSITE))).toBe(true);
  });
});

describe('stored re-extraction through the ordinary approval pipeline', () => {
  async function reprocess() {
    const { generateDraftForVenue } = require(DRAFTS);
    const { tryAutoApproveDraft } = require('../../../server/enrichment/_lib/auto-approve');
    const generation = await generateDraftForVenue(VENUE, {
      regenerate: true, sourceOnly: true, evidenceMode: 'stored', jobId: 'job-test',
    });
    const approval = await tryAutoApproveDraft(VENUE, { draft: generation.draft });
    return { generation, approval };
  }
  const claims = () => JSON.parse(fs.readFileSync(path.join('.data', 'venue-claims.json'), 'utf8')).claims;

  it('publishes from stored text, dated from the reading and not from today, with no network at all', async () => {
    const readAt = daysAgo(3);
    seedStores([evidenceRow(readAt)]);
    const { EXTRACTOR_VERSION } = require('../../../server/enrichment/_lib/evidence-extractor');

    const { generation, approval } = await reprocess();

    expect(googleCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
    expect(generation.draft.model).toBe(EXTRACTOR_VERSION);
    expect(generation.draft.sourceContext.evidenceMode).toBe('stored');
    expect(generation.draft.sourceContext.jobId).toBe('job-test');
    expect(approval.approved).toBe(true);

    const active = claims().filter((c: { status: string }) => c.status === 'active');
    const byField = Object.fromEntries(active.map((c: { field_key: string }) => [c.field_key, c]));
    expect(Object.keys(byField).sort()).toEqual([
      'familyFacilities.babyChanging', 'familyFacilities.cafe', 'familyFacilities.toilets',
    ]);
    for (const claim of active) {
      // Provenance is the stored row's, untouched: the reading date, its expiry, its URL.
      expect(claim.checked_at).toBe(readAt.slice(0, 10));
      expect(claim.valid_until).toBe(plusDays(readAt, 30));
      expect(claim.source_url).toBe(PAGE);
      expect(claim.approved_from_draft_id).toBe(generation.draft.id);
    }
    expect(byField['familyFacilities.toilets'].evidence_excerpt).toContain('Toilets, including baby changing');
  });

  it('is idempotent: the same stored text a second time writes no new claim rows', async () => {
    seedStores([evidenceRow(daysAgo(3))]);
    await reprocess();
    const before = claims();
    await reprocess();
    const after = claims();
    expect(after.length).toBe(before.length);
    expect(after.filter((c: { status: string }) => c.status === 'superseded')).toHaveLength(0);
    expect(after.map((c: { id: string }) => c.id).sort()).toEqual(before.map((c: { id: string }) => c.id).sort());
  });

  it('a reading older than the approval window yields nothing, exactly as a crawl that never happened', async () => {
    seedStores([evidenceRow(daysAgo(20))]);
    const { approval } = await reprocess();
    expect(approval.approved).toBe(false);
    expect(approval.reason).toBe('no_recent_source_supported_fields');
    expect(claims()).toHaveLength(0);
  });

  it('a newer reading of the same page that no longer states the fact withdraws it', async () => {
    const first = daysAgo(5);
    seedStores([evidenceRow(first)]);
    await reprocess();
    expect(claims().filter((c: { status: string }) => c.status === 'active')).toHaveLength(3);

    // The page is read again two days later and the café has gone from it; the toilets and changing stay.
    const later = daysAgo(3);
    const store = JSON.parse(fs.readFileSync(path.join('.data', 'venue-source-evidence.json'), 'utf8'));
    store.records.push(evidenceRow(later, 'Toilets, including baby changing facilities, are available on site.'));
    fs.writeFileSync(path.join('.data', 'venue-source-evidence.json'), JSON.stringify(store));

    await reprocess();
    const byField: Record<string, { status: string; checked_at: string }[]> = {};
    for (const c of claims()) (byField[c.field_key] ??= []).push(c);
    expect(byField['familyFacilities.cafe'].map((c) => c.status)).toEqual(['disputed']);
    const toilets = byField['familyFacilities.toilets'].filter((c) => c.status === 'active');
    expect(toilets).toHaveLength(1);
    expect(toilets[0].checked_at).toBe(later.slice(0, 10));
    expect(fetchCalls).toEqual([]);
    expect(googleCalls).toEqual([]);
  });
});
