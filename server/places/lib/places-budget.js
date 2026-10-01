/**
 * The single gate every billable Google Places request must pass through.
 *
 * Why this exists: September 2026 produced a £104.11 Google Places bill from a codebase that had
 * no kill switch, no caching and no attribution. Five modules called `fetch` against
 * `places.googleapis.com` directly, three of them from public unauthenticated endpoints, and
 * `Cache-Control: no-store` was set on every one of those responses. Nothing in the repository
 * could answer "who spent this, and on what".
 *
 * The rules this module enforces, in the order they are checked:
 *
 *  1. **Test runtimes can never spend.** Under vitest or NODE_ENV=test the answer is no, and no
 *     ordinary environment variable can change it. A developer who genuinely wants a live call
 *     from a test must set GOOGLE_PLACES_ALLOW_LIVE_TEST=true, which is deliberately not a flag
 *     anything in the repository sets for them.
 *  2. **Off unless production says otherwise.** The master switch defaults to enabled only when
 *     VERCEL_ENV === 'production'. Local development, `vercel dev`, and every Preview deployment
 *     are therefore off by default even though vercel.json sets PLACES_PROVIDER=google for all
 *     environments.
 *  3. **Per-scope switches.** Discovery (Nearby Search) is the expensive fan-out and can be turned
 *     off on its own while the app still serves stored venues.
 *  4. **A daily cap we enforce ourselves.** A Google Cloud budget alert is a notification, not a
 *     limit. This is the limit.
 *  5. **A rolling per-process window.** Catches a runaway loop inside one warm serverless instance
 *     before it reaches the daily cap.
 *
 * Failures are typed and loud. A blocked call throws `PlacesDisabledError` or
 * `PlacesBudgetExceededError`; it never returns empty data that a caller might mistake for "this
 * venue has no photos", and it never silently retries against a different billable endpoint.
 */

/** Scopes map one-to-one onto the Google SKU families this codebase can bill. */
const SCOPES = {
  /** places:searchNearby — the fan-out path. One London-wide search is nine of these. */
  discovery: { env: 'GOOGLE_PLACES_DISCOVERY_ENABLED', sku: 'nearby_search' },
  /** GET /v1/places/{id} — Place Details. */
  details: { env: 'GOOGLE_PLACES_DETAILS_ENABLED', sku: 'place_details' },
  /** GET /v1/{photo}/media — Place Photos. */
  photos: { env: 'GOOGLE_PLACES_PHOTOS_ENABLED', sku: 'place_photos' },
  /** Background refresh/enrichment, which buys Place Details on a schedule. */
  refresh: { env: 'GOOGLE_PLACES_REFRESH_ENABLED', sku: 'place_details' },
  /** The /api/places/status reachability probe, which used to bill a Nearby Search per GET. */
  probe: { env: 'GOOGLE_PLACES_PROBE_ENABLED', sku: 'nearby_search' },
  /**
   * Geocoding and Distance Matrix are different Google APIs, but the same billing account and the
   * same exposure: both are reached from public unauthenticated endpoints. One gate covers them so
   * a single switch really does stop all Google spend, rather than stopping most of it.
   */
  geocoding: { env: 'GOOGLE_GEOCODING_ENABLED', sku: 'geocoding' },
  journeys: { env: 'GOOGLE_JOURNEYS_ENABLED', sku: 'distance_matrix' },
};

const DEFAULT_MAX_CALLS_PER_DAY = 2000;
const DEFAULT_MAX_CALLS_PER_WINDOW = 60;
const WINDOW_MS = 60_000;

class PlacesDisabledError extends Error {
  constructor(scope, detail) {
    super(`Google Places is disabled for scope "${scope}": ${detail}`);
    this.name = 'PlacesDisabledError';
    this.code = 'PLACES_DISABLED';
    this.scope = scope;
    this.detail = detail;
  }
}

class PlacesBudgetExceededError extends Error {
  constructor(scope, detail) {
    super(`Google Places budget exceeded for scope "${scope}": ${detail}`);
    this.name = 'PlacesBudgetExceededError';
    this.code = 'PLACES_BUDGET_EXCEEDED';
    this.scope = scope;
    this.detail = detail;
  }
}

function isTestRuntime() {
  return (
    process.env.VITEST === 'true' ||
    process.env.VITEST === '1' ||
    process.env.NODE_ENV === 'test' ||
    typeof globalThis.__vitest_worker__ !== 'undefined'
  );
}

/**
 * Tri-state on purpose. An unset flag must fall through to the layer below it rather than read as
 * `false`, otherwise setting the master switch on could not enable anything.
 */
function envFlag(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const normalised = String(raw).trim().toLowerCase();
  if (normalised === 'true' || normalised === '1' || normalised === 'yes') return true;
  if (normalised === 'false' || normalised === '0' || normalised === 'no') return false;
  // An unrecognised value is a configuration mistake. Fail closed: a typo must not spend money.
  return false;
}

function environmentName() {
  return process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
}

/**
 * Why production-only rather than "on unless told otherwise": the September bill was spent by
 * Preview deployments and local runs reaching a production API key. Defaulting to off makes the
 * dangerous configuration the one that has to be asked for.
 */
function masterEnabled() {
  const explicit = envFlag('GOOGLE_PLACES_ENABLED');
  if (explicit !== undefined) return explicit;
  return process.env.VERCEL_ENV === 'production';
}

/**
 * Why a scope is or is not permitted to spend, as a sentence, for logs and error bodies.
 *
 * @param {string} scope
 * @returns {{ allowed: boolean, reason: string }}
 */
function describeScope(scope) {
  const config = SCOPES[scope];
  if (!config) return { allowed: false, reason: `unknown scope "${scope}"` };

  if (isTestRuntime() && envFlag('GOOGLE_PLACES_ALLOW_LIVE_TEST') !== true) {
    return { allowed: false, reason: 'test runtime; set GOOGLE_PLACES_ALLOW_LIVE_TEST=true to override' };
  }

  if (!masterEnabled()) {
    return {
      allowed: false,
      reason: `GOOGLE_PLACES_ENABLED is not set and VERCEL_ENV is "${environmentName()}", not production`,
    };
  }

  const scoped = envFlag(config.env);
  if (scoped === false) return { allowed: false, reason: `${config.env}=false` };

  return { allowed: true, reason: scoped === true ? `${config.env}=true` : 'GOOGLE_PLACES_ENABLED' };
}

/**
 * @param {string} scope
 * @returns {boolean}
 */
function isPlacesEnabled(scope) {
  return describeScope(scope).allowed;
}

// --- counters -----------------------------------------------------------------------------------

/**
 * Per-process state. A Vercel instance is reused across warm invocations, so the rolling window
 * spans more than one request -- which is what makes it useful against a retry storm, and why the
 * limit is a rate rather than a per-request count.
 */
let windowStartedAt = Date.now();
let windowCalls = 0;
const dayCounts = new Map();

function numericEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayKey(scope) {
  return `${today()}:${scope}`;
}

function checkBudget(scope) {
  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    windowCalls = 0;
  }

  const maxWindow = numericEnv('GOOGLE_PLACES_MAX_CALLS_PER_WINDOW', DEFAULT_MAX_CALLS_PER_WINDOW);
  if (windowCalls >= maxWindow) {
    throw new PlacesBudgetExceededError(
      scope,
      `${windowCalls} calls already made in the last ${WINDOW_MS / 1000}s (limit ${maxWindow})`,
    );
  }

  const maxDay = numericEnv('GOOGLE_PLACES_MAX_CALLS_PER_DAY', DEFAULT_MAX_CALLS_PER_DAY);
  const used = dayCounts.get(dayKey(scope)) || 0;
  if (used >= maxDay) {
    throw new PlacesBudgetExceededError(
      scope,
      `${used} calls already made today for this scope in this process (limit ${maxDay})`,
    );
  }
}

function countCall(scope) {
  windowCalls += 1;
  const key = dayKey(scope);
  dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
}

// --- the daily cap across instances ---------------------------------------------------------------

/**
 * The counters above are per-process, and a Vercel deployment runs many processes. On their own they
 * bound a runaway loop inside one warm instance -- which is worth having -- but they are NOT a daily
 * spending cap, because ten instances each counting to 2000 spend 20000.
 *
 * So the real daily figure lives in Postgres (`public.google_places_usage`), and this module works
 * with it in two directions:
 *
 *  - `primePlacesBudget()` reads today's totals into the in-process map. Handlers and jobs call it
 *    once at entry, so the synchronous check at each call site is made against a number that
 *    includes what every other instance has already spent.
 *  - each billable call increments the stored figure fire-and-forget, so counting never adds a
 *    database round trip to the request path and a counter failure can never fail a request.
 *
 * The cap therefore lags by at most one priming interval. That is stated rather than hidden: it is a
 * bound on overshoot, not a guarantee of the exact figure, and it is the honest thing a serverless
 * runtime can offer without a synchronous read per call.
 */
const PRIME_TTL_MS = 60_000;
let primedAt = 0;
let primedDay = '';

function usageRecorder() {
  try {
    // Required lazily: this module must stay loadable, and the gate must stay enforceable, in a
    // process with no Supabase configuration at all -- a script, a test, a local dev server.
    const { getSupabaseAdmin } = require('../../enrichment/_lib/supabase-admin');
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Loads today's billable totals from the shared store into this process's counters. Safe to call on
 * every request: it re-reads at most once a minute, and a failure leaves the per-process counters in
 * place rather than opening the gate.
 *
 * @param {{ client?: unknown }} [options] - `client` overrides the Supabase client, for callers that
 *   already hold one and for tests.
 * @returns {Promise<boolean>} whether the figures now reflect the shared store.
 */
async function primePlacesBudget(options = {}) {
  const day = today();
  if (day === primedDay && Date.now() - primedAt < PRIME_TTL_MS) return true;

  // `client` is injected the same way `createOpeningHoursBackfillDeps` injects its store: it lets the
  // priming logic be exercised without a database, rather than being taken on trust.
  const supabase = options.client ?? usageRecorder();
  if (!supabase) return false;

  try {
    const { data, error } = await supabase
      .from('google_places_usage')
      .select('scope, calls')
      .eq('usage_day', day)
      .eq('environment', environmentName());
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const key = `${day}:${row.scope}`;
      // Max, not assignment: this process may already have counted calls the store has not caught
      // up with, and the higher figure is the safer one to enforce against.
      dayCounts.set(key, Math.max(dayCounts.get(key) || 0, Number(row.calls) || 0));
    }
    primedDay = day;
    primedAt = Date.now();
    return true;
  } catch (error) {
    console.warn(
      JSON.stringify({
        tag: 'google_places_budget_prime_failed',
        message: error instanceof Error ? error.message : 'prime failed',
      }),
    );
    return false;
  }
}

/** Fire-and-forget. Never awaited on a request path, and never allowed to reject. */
function persistCall(scope, sku) {
  const supabase = usageRecorder();
  if (!supabase) return;
  try {
    const result = supabase.rpc('record_google_places_usage', {
      p_sku: sku,
      p_scope: scope,
      p_environment: environmentName(),
      p_calls: 1,
    });
    if (result && typeof result.then === 'function') {
      result.then(
        () => undefined,
        () => undefined,
      );
    }
  } catch {
    // A counter is observability, not correctness. It must never break the request it counts.
  }
}

// --- attribution --------------------------------------------------------------------------------

/**
 * One structured line per billable request, so a future bill can be traced to a caller without
 * guessing. Deliberately never carries the API key, a full request URL (which would carry the key
 * for some Google endpoints) or any header.
 */
function logBillableCall(entry) {
  const line = {
    tag: 'google_places_billable',
    sku: entry.sku,
    scope: entry.scope,
    reason: entry.reason,
    subject: entry.subject || null,
    cache: entry.cache || 'miss',
    environment: environmentName(),
    executionId: process.env.VERCEL_REQUEST_ID || process.env.AWS_LAMBDA_LOG_STREAM_NAME || null,
    jobId: entry.jobId || null,
    dayCount: dayCounts.get(dayKey(entry.scope)) || 0,
    windowCount: windowCalls,
  };
  console.log(JSON.stringify(line));
}

/** A blocked call is logged too: silence here is how the September bill went unnoticed. */
function logBlockedCall(scope, reason, detail) {
  console.warn(
    JSON.stringify({
      tag: 'google_places_blocked',
      scope,
      sku: SCOPES[scope]?.sku || null,
      reason,
      detail,
      environment: environmentName(),
    }),
  );
}

/**
 * Call this immediately before a billable request. It either returns, having counted and logged
 * the call, or throws.
 *
 * @param {{
 *   scope: string,
 *   reason: string,
 *   subject?: string | null,
 *   jobId?: string | null,
 * }} request - `scope` names the switch and SKU family this bills against; `reason` is why, for the
 *   attribution log; `subject` is the venue or search it is for. An unknown scope is refused.
 * @returns {void}
 */
function assertPlacesAllowed({ scope, reason, subject, jobId }) {
  const verdict = describeScope(scope);
  if (!verdict.allowed) {
    logBlockedCall(scope, reason, verdict.reason);
    throw new PlacesDisabledError(scope, verdict.reason);
  }

  try {
    checkBudget(scope);
  } catch (error) {
    logBlockedCall(scope, reason, error.detail || error.message);
    throw error;
  }

  countCall(scope);
  logBillableCall({ scope, sku: SCOPES[scope].sku, reason, subject, jobId });
  persistCall(scope, SCOPES[scope].sku);
}

// --- in-flight coalescing -----------------------------------------------------------------------

/**
 * Two concurrent renders of the same venue must not buy the same lookup twice. Scoped to one
 * process, so it closes the window within a single serverless invocation and between the parallel
 * requests of one page load -- not across instances, which is what the stored data layer is for.
 */
const inFlight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
function dedupe(key, fn) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = (async () => fn())().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/** Test seam. Production never calls this. */
function resetPlacesBudget() {
  windowStartedAt = Date.now();
  windowCalls = 0;
  dayCounts.clear();
  inFlight.clear();
  primedAt = 0;
  primedDay = '';
}

function placesBudgetSnapshot() {
  return {
    environment: environmentName(),
    masterEnabled: masterEnabled(),
    testRuntime: isTestRuntime(),
    scopes: Object.fromEntries(
      Object.keys(SCOPES).map((scope) => [scope, describeScope(scope)]),
    ),
    windowCalls,
    maxCallsPerWindow: numericEnv('GOOGLE_PLACES_MAX_CALLS_PER_WINDOW', DEFAULT_MAX_CALLS_PER_WINDOW),
    maxCallsPerDay: numericEnv('GOOGLE_PLACES_MAX_CALLS_PER_DAY', DEFAULT_MAX_CALLS_PER_DAY),
    today: Object.fromEntries([...dayCounts.entries()].filter(([key]) => key.startsWith(today()))),
  };
}

module.exports = {
  SCOPES,
  PlacesDisabledError,
  PlacesBudgetExceededError,
  assertPlacesAllowed,
  primePlacesBudget,
  isPlacesEnabled,
  describeScope,
  dedupe,
  resetPlacesBudget,
  placesBudgetSnapshot,
  isTestRuntime,
};
