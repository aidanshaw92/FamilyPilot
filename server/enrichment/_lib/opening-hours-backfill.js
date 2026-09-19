/**
 * Backfill structured opening hours onto place_records that only ever stored display text.
 *
 * Every row in the catalogue was ingested before the provider mapper preserved
 * `regularOpeningHours.periods`, so each one carries seven lines of prose and nothing a planner
 * can evaluate. This walks those rows, re-fetches each place through the ordinary detail path, and
 * writes back the structured schedule — and only the structured schedule.
 *
 * Three rules shape the whole module:
 *
 * 1. There is exactly one interpretation of Google's opening-hours semantics, and it lives in
 *    `google-places.js`. Nothing here parses `weekdayText`, infers periods from prose, or decides
 *    what a missing `close` means. A refreshed schedule arrives already mapped.
 * 2. Absence is never written. A refresh that returns no structured periods leaves the stored row
 *    exactly as it was and is reported as still unknown, because "we could not learn this" and
 *    "this place has no hours" are different facts and only the provider may assert the second.
 * 3. Writing is opt-in. `dryRun` defaults to true, and only a literal `false` turns it off.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

/** One retry at 500ms, a second at 2000ms — three attempts in total for a retryable failure. */
const RETRY_DELAYS_MS = [500, 2000];

/**
 * Whether the provider actually supplied a structured weekly schedule.
 *
 * An empty array counts. Google uses `periods: []` to say a place is never open, which is a
 * positive structured claim and the one case where "nothing in the list" is an answer rather than
 * a gap. Treating it as unknown would throw away the only evidence a permanently shut venue has.
 */
function hasStructuredPeriods(schedule) {
  return Boolean(schedule) && Array.isArray(schedule.periods);
}

function pointKey(point) {
  if (!point) return '-';
  const hour = String(point.hour).padStart(2, '0');
  const minute = String(point.minute).padStart(2, '0');
  return `${point.day}:${hour}:${minute}`;
}

function periodKey(period) {
  return `${pointKey(period && period.open)}>${pointKey(period && period.close)}`;
}

/**
 * A canonical form of the parts of a schedule a planner evaluates: the periods, and the timezone
 * they are expressed in.
 *
 * Periods are sorted here and only here. Google does not guarantee an ordering — the same week can
 * come back starting on Tuesday one day and Sunday the next — so comparing the arrays as they
 * arrive would report a change that is not one. The sort exists purely to answer "is this the same
 * schedule?"; the payload that gets stored keeps the provider's own ordering untouched.
 *
 * `weekdayText` is deliberately excluded. The mapper prefers `currentOpeningHours` for display
 * lines, which reflect special hours and shift as the seven-day window rolls, so including them
 * would make a text-only difference look like a structured-hours backfill and would leave the
 * operation rewriting the same rows on every run.
 *
 * Returns null when the schedule carries no structured periods at all.
 */
function structuralFingerprint(schedule) {
  if (!hasStructuredPeriods(schedule)) return null;
  const periods = schedule.periods.map(periodKey).sort().join('|');
  const timezone = typeof schedule.timezone === 'string' ? schedule.timezone : '';
  const offset = Number.isInteger(schedule.utcOffsetMinutes) ? String(schedule.utcOffsetMinutes) : '';
  return `${periods}#${timezone}#${offset}`;
}

/**
 * The payload to store: the refreshed schedule as the provider ordered it, keeping any display
 * text the refresh did not supply.
 *
 * A detail response can carry periods without `weekdayDescriptions`; dropping the stored lines in
 * that case would trade prose a person can read for nothing.
 */
function scheduleToStore(stored, refreshed) {
  const next = { ...refreshed };
  const storedText = stored && stored.weekdayText;
  if (!next.weekdayText && Array.isArray(storedText) && storedText.length > 0) {
    next.weekdayText = storedText;
  }
  return next;
}

/**
 * What to do with one row, given what is stored and what came back.
 *
 * Pure, and the only place the classification is decided, so the counts in the result and the
 * writes to the database can never disagree about what happened to a row.
 */
function decideOpeningHoursUpdate(stored, refreshed) {
  const refreshedFingerprint = structuralFingerprint(refreshed);
  if (refreshedFingerprint === null) return { outcome: 'still-unknown' };

  if (structuralFingerprint(stored) === refreshedFingerprint) return { outcome: 'unchanged' };

  return { outcome: 'update', openingHours: scheduleToStore(stored, refreshed) };
}

function isRetryableStatus(status) {
  if (!Number.isInteger(status)) return false;
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * A provider failure reduced to a fixed vocabulary plus the HTTP status.
 *
 * The provider's own message is discarded rather than relayed. It is text we do not control,
 * returned by a service we authenticate to with a secret, and a backfill report is read and pasted
 * around; a closed vocabulary cannot leak what it never carries.
 */
function classifyFailure(error) {
  const status = error && typeof error.status === 'number' ? error.status : undefined;
  if (status === undefined) return { reason: 'network-error' };
  if (status === 429) return { reason: 'rate-limited', status };
  return { reason: 'provider-error', status };
}

async function defaultSleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one place, retrying only what is worth retrying.
 *
 * Retries are driven by `error.status`, which `googleRequest` sets from the response, rather than
 * by matching on message text — a message is a moving target and a substring match would happily
 * retry a permanent 403 that merely mentions a number.
 *
 * A null return is not a failure to reach Google; it means Google answered and the place was not
 * there (404) or no longer maps to a category we serve. Retrying that would burn quota to be told
 * the same thing again.
 */
async function fetchWithRetry(placeId, deps) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const record = await deps.fetchPlace(placeId);
      if (!record) return { ok: false, failure: { reason: 'not-returned' } };
      return { ok: true, record };
    } catch (error) {
      const status = error && typeof error.status === 'number' ? error.status : undefined;
      if (isRetryableStatus(status) && attempt < RETRY_DELAYS_MS.length) {
        await deps.sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return { ok: false, failure: classifyFailure(error) };
    }
  }
}

function resolveLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  const floored = Math.floor(parsed);
  if (floored < 1) return DEFAULT_LIMIT;
  return Math.min(floored, MAX_LIMIT);
}

/**
 * Walk one page of Google-backed rows and report exactly what happened to each.
 *
 * Runs one place at a time. The work is quota-bound rather than latency-bound, a page is small
 * enough to finish inside the function's 60s budget, and serial execution means a rate limit is
 * hit once and backed off from rather than hit by every in-flight request at once.
 *
 * Nothing about a partial run needs repair: each row is written on its own, the cursor is a place
 * id rather than an offset, and re-running over rows that were already repaired classifies them as
 * unchanged. A run that dies halfway is resumed by asking for the next page, not by starting over.
 */
async function runOpeningHoursBackfill(options = {}, deps) {
  const limit = resolveLimit(options.limit);
  // Anything other than a literal `false` is a dry run. A missing flag, a typo, a string "false"
  // from a query string: none of them may write production rows.
  const dryRun = options.dryRun !== false;
  const startAfter = typeof options.startAfter === 'string' && options.startAfter ? options.startAfter : null;
  const sleep = deps.sleep || defaultSleep;

  const rows = await deps.listRows({ limit, startAfter });

  let changed = 0;
  let unchanged = 0;
  let stillUnknown = 0;
  const changedPlaceIds = [];
  const stillUnknownPlaceIds = [];
  const failures = [];

  for (const row of rows) {
    const placeId = row.familypilotPlaceId;

    const fetched = await fetchWithRetry(placeId, { ...deps, sleep });
    if (!fetched.ok) {
      failures.push({ placeId, ...fetched.failure });
      continue;
    }

    const decision = decideOpeningHoursUpdate(row.openingHours, fetched.record.openingHours);

    if (decision.outcome === 'still-unknown') {
      stillUnknown += 1;
      stillUnknownPlaceIds.push(placeId);
      continue;
    }

    if (decision.outcome === 'unchanged') {
      unchanged += 1;
      continue;
    }

    if (!dryRun) {
      try {
        await deps.updateRow(placeId, decision.openingHours);
      } catch {
        // The provider gave us good data and the database refused it. That is a failure of this
        // row, not of the batch, and the same row will be picked up cleanly on a later run.
        failures.push({ placeId, reason: 'write-failed' });
        continue;
      }
    }

    changed += 1;
    changedPlaceIds.push(placeId);
  }

  const done = rows.length < limit;
  const nextCursor = done || rows.length === 0 ? null : rows[rows.length - 1].familypilotPlaceId;

  const result = {
    dryRun,
    limit,
    scanned: rows.length,
    unchanged,
    stillUnknown,
    failed: failures.length,
    stillUnknownPlaceIds,
    failures,
    nextCursor,
    done,
  };

  // The bucket a row landed in is named differently depending on whether the write happened, so a
  // report can never be read as claiming a change that was only simulated.
  if (dryRun) {
    return { ...result, wouldUpdate: changed, wouldUpdatePlaceIds: changedPlaceIds };
  }
  return { ...result, updated: changed, updatedPlaceIds: changedPlaceIds };
}

/**
 * Production wiring: the real store and the real detail fetch.
 *
 * Required lazily so the pure decision logic can be loaded and tested without Supabase or a Google
 * key present.
 */
function createOpeningHoursBackfillDeps() {
  const {
    listPlaceRecordsForOpeningHours,
    updatePlaceRecordOpeningHours,
  } = require('./enrichment-store');
  const { getGooglePlace } = require('../../places/lib/google-places');

  return {
    listRows: listPlaceRecordsForOpeningHours,
    fetchPlace: getGooglePlace,
    updateRow: updatePlaceRecordOpeningHours,
    sleep: defaultSleep,
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  RETRY_DELAYS_MS,
  createOpeningHoursBackfillDeps,
  decideOpeningHoursUpdate,
  hasStructuredPeriods,
  resolveLimit,
  runOpeningHoursBackfill,
  structuralFingerprint,
};
