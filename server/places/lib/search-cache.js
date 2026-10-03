/**
 * A server-side cache for provider discovery searches, kept in Postgres rather than in memory.
 *
 * The reason it is not a `Map`: these handlers run as Vercel serverless functions. Module state
 * lives only as long as one warm instance and is not shared between concurrent instances, so an
 * in-process cache would pass a test and do almost nothing in production. That is exactly the trap
 * worth naming here, because `/api/places/search` already looked cached -- it has a client-side
 * AsyncStorage cache in `familypilot/src/services/places/places-cache.ts` -- and still billed nine
 * Nearby Search requests on every fresh browser context, which is what a CI run and a first-time
 * visitor both are.
 *
 * Retention: `cached_until` is always inside what Google's Maps Platform terms permit for cached
 * Places content, and a row past MAX_STALE_HOURS is not served at all. The table is server-only
 * (RLS on with no policy, privileges revoked from anon and authenticated). See
 * docs/GOOGLE_PLACES_COST_CONTROL.md.
 */

/**
 * Supabase is reached lazily, the same way places-budget.js reaches it, and for the same reason: this
 * module must stay LOADABLE in a process that has no Supabase client at all -- a script, a test, a
 * local dev server, a CI job that installed only the app's dependencies.
 *
 * It was required eagerly, and the canary found it: `node scripts/canary-nearby-food.mjs --plan`, which
 * makes no request and only prints what it intends to do, could not even start, because requiring
 * nearby-food pulled in this file which pulled in a client from the root package. A cache being
 * unavailable should degrade to "every read is a miss", not to "the module will not load".
 */
function supabase() {
  try {
    const { getSupabaseAdmin } = require('../../enrichment/_lib/supabase-admin');
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/** Hours a discovery search may be reused. Short enough to stay well inside Google's cache window. */
const DEFAULT_TTL_HOURS = 6;
/**
 * The hard ceiling on reuse when discovery is switched off. A stored search older than this is not
 * served at all -- the kill switch must not quietly turn into an indefinite Google content store.
 */
const MAX_STALE_HOURS = 24 * 30;

function ttlHours() {
  const raw = Number(process.env.PLACES_SEARCH_CACHE_TTL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_HOURS;
  return Math.min(raw, MAX_STALE_HOURS);
}

/**
 * Coordinates are rounded to four decimals (~11m) so that two requests for the same place do not
 * miss each other on floating-point noise, while remaining far finer than any search radius.
 */
function buildSearchCacheKey({ scope, intent, lat, lng, radiusKm, categories }) {
  const parts = [
    scope || 'nearby',
    intent || 'explore',
    Number(lat).toFixed(4),
    Number(lng).toFixed(4),
    String(Math.round(Number(radiusKm) || 0)),
    (categories || []).slice().sort().join('+') || 'all',
  ];
  return parts.join('|');
}

/**
 * Returns `{ payload, ageHours, fresh }`, or null when nothing usable is stored.
 *
 * `fresh` is the caller's licence to skip the provider entirely. A non-fresh row is still returned,
 * because when the kill switch is on it is the difference between showing a parent London and
 * showing them an error -- but only up to MAX_STALE_HOURS.
 */
async function readSearchCache(cacheKey) {
  const client = supabase();
  if (!client) return null;

  const { data, error } = await client
    .from('place_search_cache')
    .select('payload, provider, fetched_at, cached_until')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !data) return null;

  const fetchedAt = Date.parse(data.fetched_at || '');
  if (!Number.isFinite(fetchedAt)) return null;
  const ageHours = (Date.now() - fetchedAt) / 3_600_000;
  if (ageHours > MAX_STALE_HOURS) return null;

  const cachedUntil = Date.parse(data.cached_until || '');
  const fresh = Number.isFinite(cachedUntil) && Date.now() < cachedUntil;

  return { payload: data.payload, provider: data.provider, ageHours, fresh };
}

/**
 * Best-effort: a cache write that fails must not fail the request it was meant to make cheaper.
 *
 * `billableCalls` RECORDS WHAT THE ROW COST, AND ZERO IS A REAL ANSWER. This used to store
 * `Math.max(1, Number(billableCalls) || 1)`, which made zero unreachable: an OpenStreetMap row that
 * cost nothing was written down as one billable call. The defect was not theoretical --
 * `docs/canary/reconcile.sql` asserts "nearby-food rows recording a billable call (must be 0)", and
 * with this floor in place that check could never pass on a single row. A cost-reconciliation query
 * that cannot pass is worse than no query, because the first reader dismisses it as noise and the
 * second stops running it.
 *
 * So an explicit 0 is stored as 0. A missing or unparseable value still defaults to 1, because
 * "nobody said" must not read as "free".
 */
async function writeSearchCache(cacheKey, payload, { provider, billableCalls }) {
  const billed = Number.isFinite(Number(billableCalls)) ? Math.max(0, Math.round(Number(billableCalls))) : 1;
  const client = supabase();
  if (!client) return false;

  const now = new Date();
  const cachedUntil = new Date(now.getTime() + ttlHours() * 3_600_000);

  const { error } = await client
    .from('place_search_cache')
    .upsert(
      {
        cache_key: cacheKey,
        payload,
        provider,
        billable_calls: billed,
        fetched_at: now.toISOString(),
        cached_until: cachedUntil.toISOString(),
      },
      { onConflict: 'cache_key' },
    );

  if (error) {
    console.warn(JSON.stringify({ tag: 'places_search_cache_write_failed', code: error.code || null }));
    return false;
  }
  return true;
}

module.exports = {
  buildSearchCacheKey,
  readSearchCache,
  writeSearchCache,
  ttlHours,
  MAX_STALE_HOURS,
  DEFAULT_TTL_HOURS,
};
