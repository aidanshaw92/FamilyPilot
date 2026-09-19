import { describe, expect, test } from 'vitest';

import {
  ALEXANDRA_PARK,
  GooglePlacePayload,
  NEVER_OPEN_PLACE,
  STORED_TEXT_ONLY_ROW,
  TEXT_ONLY_PLACE,
  WHITECHAPEL_GALLERY,
} from './fixtures/provider-opening-hours';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { googlePlaceToRecord } = require('../../../server/places/lib/google-places');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decideOpeningHoursUpdate,
  resolveLimit,
  runOpeningHoursBackfill,
} = require('../../../server/enrichment/_lib/opening-hours-backfill');

/**
 * Refreshed schedules come through the real provider mapper, never hand-written. A test that fed
 * the backfill an idealised object would stay green if the mapper went back to dropping periods —
 * which is the exact failure this backfill exists to repair.
 */
function refreshedSchedule(payload: GooglePlacePayload) {
  const record = googlePlaceToRecord(payload, 'explore');
  expect(record, `${payload.displayName.text} should map to a record`).not.toBeNull();
  return record.openingHours;
}

interface BackfillRow {
  familypilotPlaceId: string;
  openingHours?: unknown;
}

interface FetchOutcome {
  record?: unknown;
  error?: Error & { status?: number };
}

interface HarnessResult {
  result: Record<string, unknown>;
  writes: { placeId: string; openingHours: unknown }[];
  fetchCalls: string[];
  sleeps: number[];
  listCalls: { limit: number; startAfter: string | null }[];
}

/**
 * A backfill run with the two I/O seams replaced: the row source and the provider fetch. The
 * comparison logic, the retry policy, the bucket accounting and the dry-run gate are all the
 * production ones.
 */
async function runHarness(
  options: Record<string, unknown>,
  rows: BackfillRow[],
  outcomes: Record<string, FetchOutcome | FetchOutcome[]>,
  overrides: { updateRow?: (placeId: string, openingHours: unknown) => Promise<void> } = {},
): Promise<HarnessResult> {
  const writes: { placeId: string; openingHours: unknown }[] = [];
  const fetchCalls: string[] = [];
  const sleeps: number[] = [];
  const listCalls: { limit: number; startAfter: string | null }[] = [];
  const attempts: Record<string, number> = {};

  const result = await runOpeningHoursBackfill(options, {
    listRows: async ({ limit, startAfter }: { limit: number; startAfter: string | null }) => {
      listCalls.push({ limit, startAfter });
      const after = startAfter ? rows.filter((row) => row.familypilotPlaceId > startAfter) : rows;
      return after.slice(0, limit);
    },
    fetchPlace: async (placeId: string) => {
      fetchCalls.push(placeId);
      const outcome = outcomes[placeId];
      const attempt = attempts[placeId] ?? 0;
      attempts[placeId] = attempt + 1;
      const step = Array.isArray(outcome)
        ? outcome[Math.min(attempt, outcome.length - 1)]
        : outcome;
      if (!step) return null;
      if (step.error) throw step.error;
      return step.record ?? null;
    },
    updateRow:
      overrides.updateRow ??
      (async (placeId: string, openingHours: unknown) => {
        writes.push({ placeId, openingHours });
      }),
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  });

  return { result, writes, fetchCalls, sleeps, listCalls };
}

function httpError(status: number, message = 'provider said no'): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

/** Every terminal bucket, summed. This must equal `scanned` on every single run. */
function terminalTotal(result: Record<string, unknown>): number {
  const changed = (result.updated ?? result.wouldUpdate ?? 0) as number;
  return (
    changed +
    (result.unchanged as number) +
    (result.stillUnknown as number) +
    (result.failed as number)
  );
}

describe('opening-hours backfill: per-row decision', () => {
  test('text-only stored hours plus refreshed periods is an update', () => {
    const decision = decideOpeningHoursUpdate(
      STORED_TEXT_ONLY_ROW,
      refreshedSchedule(WHITECHAPEL_GALLERY),
    );

    expect(decision.outcome).toBe('update');
    expect(decision.openingHours.periods).toHaveLength(6);
  });

  test('identical structured hours are unchanged', () => {
    const schedule = refreshedSchedule(WHITECHAPEL_GALLERY);

    expect(decideOpeningHoursUpdate(schedule, schedule).outcome).toBe('unchanged');
  });

  test('identical periods in a different order are unchanged', () => {
    const schedule = refreshedSchedule(WHITECHAPEL_GALLERY);
    const shuffled = { ...schedule, periods: [...schedule.periods].reverse() };

    expect(decideOpeningHoursUpdate(shuffled, schedule).outcome).toBe('unchanged');
    // The reordering is a comparison device only: a real update stores the provider's own order.
    const update = decideOpeningHoursUpdate(STORED_TEXT_ONLY_ROW, schedule);
    expect(update.openingHours.periods).toEqual(schedule.periods);
  });

  test('a refresh with no structured hours leaves the stored value untouched', () => {
    const stored = refreshedSchedule(WHITECHAPEL_GALLERY);
    const decision = decideOpeningHoursUpdate(stored, refreshedSchedule(TEXT_ONLY_PLACE));

    expect(decision.outcome).toBe('still-unknown');
    expect(decision.openingHours).toBeUndefined();
  });

  test('an empty period list is preserved as the provider’s structured "never open"', () => {
    const neverOpen = refreshedSchedule(NEVER_OPEN_PLACE);
    expect(neverOpen.periods).toEqual([]);

    const first = decideOpeningHoursUpdate(STORED_TEXT_ONLY_ROW, neverOpen);
    expect(first.outcome).toBe('update');
    expect(first.openingHours.periods).toEqual([]);

    // Once stored, it stays stored, and it never decays back into unknown.
    expect(decideOpeningHoursUpdate(first.openingHours, neverOpen).outcome).toBe('unchanged');
  });

  test('no stored hours and no refreshed periods is still unknown', () => {
    expect(decideOpeningHoursUpdate(undefined, undefined).outcome).toBe('still-unknown');
    expect(decideOpeningHoursUpdate(undefined, refreshedSchedule(TEXT_ONLY_PLACE)).outcome).toBe(
      'still-unknown',
    );
  });

  test('weekdayText is never parsed and never decides an update on its own', () => {
    // Prose that plainly states opening times, with no structured periods behind it.
    const textOnly = refreshedSchedule(TEXT_ONLY_PLACE);
    expect(textOnly.weekdayText?.[0]).toContain('11:00 AM');
    expect(decideOpeningHoursUpdate(undefined, textOnly).outcome).toBe('still-unknown');

    // Structured periods that contradict the display lines: the periods win, and a difference
    // confined to the prose is not a structured-hours backfill.
    const stored = refreshedSchedule(WHITECHAPEL_GALLERY);
    const textDiffers = {
      ...stored,
      weekdayText: ['Monday: Open 24 hours', 'Tuesday: Open 24 hours'],
    };
    expect(decideOpeningHoursUpdate(stored, textDiffers).outcome).toBe('unchanged');
  });

  test('an empty period list is not classified as unknown', () => {
    const neverOpen = refreshedSchedule(NEVER_OPEN_PLACE);
    const alwaysOpen = refreshedSchedule(ALEXANDRA_PARK);

    expect(decideOpeningHoursUpdate(undefined, neverOpen).outcome).toBe('update');
    // And it is a different schedule from "always open", not a synonym for it.
    expect(decideOpeningHoursUpdate(alwaysOpen, neverOpen).outcome).toBe('update');
  });
});

describe('opening-hours backfill: batch behaviour', () => {
  const gallery = () => refreshedSchedule(WHITECHAPEL_GALLERY);
  const park = () => refreshedSchedule(ALEXANDRA_PARK);
  const textOnly = () => refreshedSchedule(TEXT_ONLY_PLACE);

  test('one failing row does not stop the batch', async () => {
    const { result, writes } = await runHarness(
      { dryRun: false },
      [
        { familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW },
        { familypilotPlaceId: 'fp-google-b', openingHours: STORED_TEXT_ONLY_ROW },
        { familypilotPlaceId: 'fp-google-c', openingHours: STORED_TEXT_ONLY_ROW },
      ],
      {
        'fp-google-a': { record: { openingHours: gallery() } },
        'fp-google-b': { error: httpError(403, 'forbidden') },
        'fp-google-c': { record: { openingHours: park() } },
      },
    );

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(1);
    expect(writes.map((write) => write.placeId)).toEqual(['fp-google-a', 'fp-google-c']);
    expect(result.failures).toEqual([
      { placeId: 'fp-google-b', reason: 'provider-error', status: 403 },
    ]);
  });

  test('a rerun after repair produces zero updates', async () => {
    const rows: BackfillRow[] = [
      { familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW },
      { familypilotPlaceId: 'fp-google-b', openingHours: STORED_TEXT_ONLY_ROW },
    ];
    const outcomes = {
      'fp-google-a': { record: { openingHours: gallery() } },
      'fp-google-b': { record: { openingHours: park() } },
    };

    const first = await runHarness({ dryRun: false }, rows, outcomes);
    expect(first.result.updated).toBe(2);

    // Feed the written schedules back as the stored state, exactly as a second run would read them.
    const repaired: BackfillRow[] = first.writes.map((write) => ({
      familypilotPlaceId: write.placeId,
      openingHours: write.openingHours,
    }));
    const second = await runHarness({ dryRun: false }, repaired, outcomes);

    expect(second.result.updated).toBe(0);
    expect(second.result.unchanged).toBe(2);
    expect(second.writes).toEqual([]);
  });

  test('the cursor and limit cover every row exactly once', async () => {
    const rows: BackfillRow[] = ['a', 'b', 'c', 'd', 'e'].map((suffix) => ({
      familypilotPlaceId: `fp-google-${suffix}`,
      openingHours: STORED_TEXT_ONLY_ROW,
    }));
    const outcomes = Object.fromEntries(
      rows.map((row) => [row.familypilotPlaceId, { record: { openingHours: gallery() } }]),
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    let done = false;
    let pages = 0;

    while (!done && pages < 10) {
      const page: HarnessResult = await runHarness(
        { dryRun: false, limit: 2, startAfter: cursor ?? undefined },
        rows,
        outcomes,
      );
      seen.push(...page.fetchCalls);
      cursor = page.result.nextCursor as string | null;
      done = page.result.done as boolean;
      pages += 1;
    }

    expect(done).toBe(true);
    expect(seen).toEqual(rows.map((row) => row.familypilotPlaceId));
    expect(new Set(seen).size).toBe(seen.length);
    expect(cursor).toBeNull();
  });

  test('a 429 is retried twice and then succeeds', async () => {
    const { result, sleeps, fetchCalls } = await runHarness(
      { dryRun: false },
      [{ familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW }],
      {
        'fp-google-a': [
          { error: httpError(429, 'rate limited') },
          { error: httpError(429, 'rate limited') },
          { record: { openingHours: gallery() } },
        ],
      },
    );

    expect(fetchCalls).toHaveLength(3);
    expect(sleeps).toEqual([500, 2000]);
    expect(result.updated).toBe(1);
  });

  test('a 5xx is retried twice and then reported', async () => {
    const { result, sleeps, fetchCalls } = await runHarness(
      { dryRun: false },
      [{ familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW }],
      { 'fp-google-a': { error: httpError(503, 'unavailable') } },
    );

    expect(fetchCalls).toHaveLength(3);
    expect(sleeps).toEqual([500, 2000]);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      { placeId: 'fp-google-a', reason: 'provider-error', status: 503 },
    ]);
  });

  test('a non-429 4xx is not retried', async () => {
    const { sleeps, fetchCalls, result } = await runHarness(
      { dryRun: false },
      [{ familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW }],
      { 'fp-google-a': { error: httpError(400, 'bad request') } },
    );

    expect(fetchCalls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(result.failures).toEqual([
      { placeId: 'fp-google-a', reason: 'provider-error', status: 400 },
    ]);
  });

  test('a place the provider does not return becomes not-returned, without a retry', async () => {
    const { result, fetchCalls, sleeps } = await runHarness(
      { dryRun: false },
      [{ familypilotPlaceId: 'fp-google-gone', openingHours: STORED_TEXT_ONLY_ROW }],
      { 'fp-google-gone': { record: null } },
    );

    expect(fetchCalls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(result.failures).toEqual([{ placeId: 'fp-google-gone', reason: 'not-returned' }]);
  });

  test('the terminal buckets reconcile exactly to scanned', async () => {
    const rows: BackfillRow[] = [
      { familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW },
      { familypilotPlaceId: 'fp-google-b', openingHours: gallery() },
      { familypilotPlaceId: 'fp-google-c', openingHours: STORED_TEXT_ONLY_ROW },
      { familypilotPlaceId: 'fp-google-d', openingHours: STORED_TEXT_ONLY_ROW },
    ];
    const outcomes = {
      'fp-google-a': { record: { openingHours: gallery() } },
      'fp-google-b': { record: { openingHours: gallery() } },
      'fp-google-c': { record: { openingHours: textOnly() } },
      'fp-google-d': { error: httpError(400, 'bad request') },
    };

    const applied = await runHarness({ dryRun: false }, rows, outcomes);
    expect(applied.result.scanned).toBe(4);
    expect(applied.result).toMatchObject({ updated: 1, unchanged: 1, stillUnknown: 1, failed: 1 });
    expect(terminalTotal(applied.result)).toBe(applied.result.scanned);

    const dry = await runHarness({}, rows, outcomes);
    expect(dry.result).toMatchObject({ wouldUpdate: 1, unchanged: 1, stillUnknown: 1, failed: 1 });
    expect(terminalTotal(dry.result)).toBe(dry.result.scanned);
  });

  test('failure output carries no secrets, even when the provider error does', async () => {
    const leaky = httpError(403, 'API key AIzaSyFAKE-not-a-real-key-0000 is not authorized');
    const { result } = await runHarness(
      { dryRun: false },
      [{ familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW }],
      { 'fp-google-a': { error: leaky } },
    );

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('AIzaSy');
    expect(serialised).not.toContain('not authorized');
    expect(result.failures).toEqual([
      { placeId: 'fp-google-a', reason: 'provider-error', status: 403 },
    ]);
  });
});

describe('opening-hours backfill: dry-run gate', () => {
  const rows: BackfillRow[] = [
    { familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW },
    { familypilotPlaceId: 'fp-google-b', openingHours: undefined },
  ];

  function outcomes() {
    return {
      'fp-google-a': { record: { openingHours: refreshedSchedule(WHITECHAPEL_GALLERY) } },
      'fp-google-b': { record: { openingHours: refreshedSchedule(TEXT_ONLY_PLACE) } },
    };
  }

  test('an omitted dryRun flag performs zero writes', async () => {
    const { result, writes, fetchCalls } = await runHarness({}, rows, outcomes());

    expect(result.dryRun).toBe(true);
    expect(writes).toEqual([]);
    // Dry run still does the real work: it enumerates and fetches every row.
    expect(fetchCalls).toEqual(['fp-google-a', 'fp-google-b']);
    expect(result.wouldUpdate).toBe(1);
    expect(result.wouldUpdatePlaceIds).toEqual(['fp-google-a']);
    expect(result.updated).toBeUndefined();
  });

  test('an explicit dryRun: true performs zero writes', async () => {
    const { result, writes } = await runHarness({ dryRun: true }, rows, outcomes());

    expect(result.dryRun).toBe(true);
    expect(writes).toEqual([]);
    expect(result.wouldUpdate).toBe(1);
  });

  test('dryRun: false writes only the rows classified for update', async () => {
    const { result, writes } = await runHarness({ dryRun: false }, rows, outcomes());

    expect(result.dryRun).toBe(false);
    expect(result.updated).toBe(1);
    expect(result.wouldUpdate).toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(writes[0].placeId).toBe('fp-google-a');
    // The still-unknown row is never written, so its stored text survives.
    expect(writes.some((write) => write.placeId === 'fp-google-b')).toBe(false);
  });

  test('a display-text-only refresh stays still-unknown rather than being written', async () => {
    const { result, writes } = await runHarness(
      { dryRun: false },
      [{ familypilotPlaceId: 'fp-google-b', openingHours: STORED_TEXT_ONLY_ROW }],
      { 'fp-google-b': { record: { openingHours: refreshedSchedule(TEXT_ONLY_PLACE) } } },
    );

    expect(result.stillUnknown).toBe(1);
    expect(result.stillUnknownPlaceIds).toEqual(['fp-google-b']);
    expect(writes).toEqual([]);
  });

  test('a rejected write fails its own row and leaves the rest of the batch alone', async () => {
    const { result, fetchCalls } = await runHarness(
      { dryRun: false },
      [
        { familypilotPlaceId: 'fp-google-a', openingHours: STORED_TEXT_ONLY_ROW },
        { familypilotPlaceId: 'fp-google-c', openingHours: STORED_TEXT_ONLY_ROW },
      ],
      {
        'fp-google-a': { record: { openingHours: refreshedSchedule(WHITECHAPEL_GALLERY) } },
        'fp-google-c': { record: { openingHours: refreshedSchedule(ALEXANDRA_PARK) } },
      },
      {
        updateRow: async (placeId: string) => {
          if (placeId === 'fp-google-a') throw new Error('row-level security');
        },
      },
    );

    expect(fetchCalls).toHaveLength(2);
    expect(result.updated).toBe(1);
    expect(result.failures).toEqual([{ placeId: 'fp-google-a', reason: 'write-failed' }]);
    expect(terminalTotal(result)).toBe(result.scanned);
  });
});

describe('opening-hours backfill: paging limits', () => {
  test('the limit defaults to 25 and is capped at 50', () => {
    expect(resolveLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(resolveLimit(0)).toBe(DEFAULT_LIMIT);
    expect(resolveLimit(-5)).toBe(DEFAULT_LIMIT);
    expect(resolveLimit('not a number')).toBe(DEFAULT_LIMIT);
    expect(resolveLimit(10)).toBe(10);
    expect(resolveLimit(500)).toBe(MAX_LIMIT);
  });

  test('the resolved limit is what reaches the row source', async () => {
    const { listCalls } = await runHarness({ limit: 500 }, [], {});

    expect(listCalls).toEqual([{ limit: MAX_LIMIT, startAfter: null }]);
  });
});
