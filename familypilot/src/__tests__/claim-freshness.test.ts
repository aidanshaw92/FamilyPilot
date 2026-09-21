import { describe, expect, test } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  GRACE_DAYS,
  addDays,
  classifyClaim,
  graceUntil,
  isGraceEligible,
  toStaleFact,
  validUntil,
} = require('../../../server/enrichment/_lib/claim-freshness');
const {
  NOT_ATTEMPTED,
  PERMANENT,
  REFRESHED,
  TRANSIENT,
  classifySourceOutcome,
  latestRecordForSource,
} = require('../../../server/enrichment/_lib/source-refresh-outcome');
const { FIELD_MAP, expiryDate } = require('../../../server/enrichment/_lib/trusted-evidence');
/* eslint-enable @typescript-eslint/no-require-imports */

const FAMILY_PAGE = 'https://example.org/family-visits';
const ACCESSIBILITY_PAGE = 'https://example.org/accessibility';

interface ClaimLike {
  fieldKey: string;
  valueJson: unknown;
  checkedAt: string;
  validUntil?: string | null;
  sourceUrl?: string | null;
  approvedBy?: string;
  status?: string;
}

function claim(overrides: Partial<ClaimLike> = {}): ClaimLike {
  return {
    fieldKey: 'familyFacilities.babyChanging',
    valueJson: 'yes',
    checkedAt: '2026-09-01',
    validUntil: '2026-10-01',
    sourceUrl: FAMILY_PAGE,
    approvedBy: 'source_evidence_auto_v2',
    status: 'active',
    ...overrides,
  };
}

function record(fetchStatus: string, retrievedAt: string, httpStatus: number | null = null) {
  return { fetchStatus, retrievedAt: `${retrievedAt}T12:00:00.000Z`, httpStatus };
}

describe('source refresh outcome classification', () => {
  test('a page that was read counts as refreshed, truncated or not', () => {
    expect(classifySourceOutcome(record('ok', '2026-10-02'))).toBe(REFRESHED);
    expect(classifySourceOutcome(record('fetched_truncated', '2026-10-02'))).toBe(REFRESHED);
  });

  test('timeouts and bot-mitigation blocks are transient', () => {
    expect(classifySourceOutcome(record('timeout', '2026-10-02'))).toBe(TRANSIENT);
    expect(classifySourceOutcome(record('blocked', '2026-10-02'))).toBe(TRANSIENT);
  });

  test('HTTP status decides an error, and it is read as a number not a string', () => {
    expect(classifySourceOutcome(record('error', '2026-10-02', 503))).toBe(TRANSIENT);
    expect(classifySourceOutcome(record('error', '2026-10-02', 429))).toBe(TRANSIENT);
    expect(classifySourceOutcome(record('error', '2026-10-02', 404))).toBe(PERMANENT);
    expect(classifySourceOutcome(record('error', '2026-10-02', 410))).toBe(PERMANENT);
    expect(classifySourceOutcome(record('error', '2026-10-02', 403))).toBe(PERMANENT);
    // No response at all — DNS, reset, abort.
    expect(classifySourceOutcome(record('error', '2026-10-02', null))).toBe(TRANSIENT);
  });

  test('page-shaped failures are permanent, including the legacy spelling', () => {
    expect(classifySourceOutcome(record('non_html', '2026-10-02'))).toBe(PERMANENT);
    expect(classifySourceOutcome(record('too_large_unusable', '2026-10-02'))).toBe(PERMANENT);
    expect(classifySourceOutcome(record('too_large', '2026-10-02'))).toBe(PERMANENT);
  });

  test('a cache hit is not an attempt, and an unknown status is treated the same way', () => {
    expect(classifySourceOutcome(record('cached', '2026-10-02'))).toBe(NOT_ATTEMPTED);
    expect(classifySourceOutcome(record('something_new', '2026-10-02'))).toBe(NOT_ATTEMPTED);
    expect(classifySourceOutcome(null)).toBe(NOT_ATTEMPTED);
  });

  test('the newest attempt wins, whichever way round it happened', () => {
    const success = record('ok', '2026-10-05');
    const failure = record('timeout', '2026-10-02');
    expect(latestRecordForSource([failure, success])).toBe(success);
    expect(latestRecordForSource([success, failure])).toBe(success);
    expect(latestRecordForSource([record('ok', '2026-09-20'), record('timeout', '2026-10-06')]).fetchStatus)
      .toBe('timeout');
  });
});

describe('claim lifetimes', () => {
  test('a missing validUntil is derived, and agrees with the evidence pipeline for every field', () => {
    // FIELD_MAP covers the keys the evidence pipeline writes. Age policy is NOT one of them -- it
    // has its own producer -- so it has to be named here explicitly, or the two mirrored lifetime
    // rules can drift apart for the one fact that removes a venue and no test would notice.
    const { agePolicyFieldKey } = require('../../../server/enrichment/_lib/age-policy');
    const keys = [...(Object.values(FIELD_MAP) as string[]), agePolicyFieldKey('https://venue.example/visit')];

    for (const fieldKey of keys) {
      const derived = validUntil(claim({ fieldKey, validUntil: null, checkedAt: '2026-09-01' }));
      expect(derived, fieldKey).toBe(expiryDate(fieldKey, '2026-09-01T00:00:00.000Z'));
    }
  });

  test('age policy gets the short lifetime on BOTH sides of the mirror', () => {
    const { agePolicyFieldKey } = require('../../../server/enrichment/_lib/age-policy');
    const fieldKey = agePolicyFieldKey('https://venue.example/visit');
    expect(validUntil(claim({ fieldKey, validUntil: null, checkedAt: '2026-09-01' }))).toBe('2026-10-01');
    expect(expiryDate(fieldKey, '2026-09-01T00:00:00.000Z')).toBe('2026-10-01');
  });

  test('grace runs exactly 14 days past expiry', () => {
    expect(GRACE_DAYS).toBe(14);
    expect(graceUntil(claim({ validUntil: '2026-10-01' }))).toBe('2026-10-15');
  });
});

describe('freshness states', () => {
  const transientToday = [record('timeout', '2026-09-28')];

  test('fresh well before expiry, refresh_due inside the 7-day lead', () => {
    expect(classifyClaim(claim(), null, '2026-09-20')).toBe('fresh');
    expect(classifyClaim(claim(), null, '2026-09-23')).toBe('fresh');
    expect(classifyClaim(claim(), null, '2026-09-24')).toBe('refresh_due');
    expect(classifyClaim(claim(), null, '2026-10-01')).toBe('refresh_due');
  });

  test('a transient failure on the claim’s own source earns grace', () => {
    expect(classifyClaim(claim(), transientToday, '2026-10-02')).toBe('stale');
  });

  test('the 14-day boundary is exact', () => {
    expect(classifyClaim(claim(), transientToday, '2026-10-15')).toBe('stale');
    expect(classifyClaim(claim(), transientToday, '2026-10-16')).toBe('expired');
  });

  test('no grace without an attempt', () => {
    expect(classifyClaim(claim(), null, '2026-10-02')).toBe('expired');
    expect(classifyClaim(claim(), [], '2026-10-02')).toBe('expired');
  });

  test('no grace for a permanent failure', () => {
    expect(classifyClaim(claim(), [record('error', '2026-09-28', 404)], '2026-10-02')).toBe('expired');
    expect(classifyClaim(claim(), [record('non_html', '2026-09-28')], '2026-10-02')).toBe('expired');
  });

  test('no grace when the source was successfully re-read', () => {
    // The evidence pipeline has already judged the refreshed content; grace is not its business.
    expect(classifyClaim(claim(), [record('ok', '2026-09-28')], '2026-10-02')).toBe('expired');
  });

  test('no grace for an attempt that predates the refresh window', () => {
    expect(classifyClaim(claim(), [record('timeout', '2026-09-10')], '2026-10-02')).toBe('expired');
    // The boundary itself is validUntil - 7 days.
    expect(classifyClaim(claim(), [record('timeout', '2026-09-24')], '2026-10-02')).toBe('stale');
    expect(classifyClaim(claim(), [record('timeout', '2026-09-23')], '2026-10-02')).toBe('expired');
  });

  test('a claim with no source page never earns grace', () => {
    const editorial = claim({ sourceUrl: null, approvedBy: 'enrichment-editor' });
    expect(classifyClaim(editorial, transientToday, '2026-10-02')).toBe('expired');
    expect(isGraceEligible(editorial, transientToday, '2026-10-02')).toBe(false);
  });

  test('a stale fact carries display data only, with no tri-state to mistake for a facility', () => {
    const fact = toStaleFact(claim());
    expect(fact).toEqual({
      fieldKey: 'familyFacilities.babyChanging',
      value: 'yes',
      lastConfirmed: '2026-09-01',
      graceUntil: '2026-10-15',
      recheckPending: true,
    });
    expect(Object.keys(fact)).not.toContain('familyFacilities');
  });
});

describe('grace is per source, not per venue', () => {
  const babyChanging = claim({
    fieldKey: 'familyFacilities.babyChanging',
    sourceUrl: FAMILY_PAGE,
  });
  const parking = claim({
    fieldKey: 'familyFacilities.parking',
    valueJson: 'yes',
    sourceUrl: ACCESSIBILITY_PAGE,
  });

  test('source A succeeds and source B times out: only B’s claim may receive grace', () => {
    const byUrl = new Map([
      [ACCESSIBILITY_PAGE, [record('ok', '2026-09-28')]],
      [FAMILY_PAGE, [record('timeout', '2026-09-28')]],
    ]);

    expect(classifyClaim(babyChanging, byUrl.get(FAMILY_PAGE), '2026-10-02')).toBe('stale');
    expect(classifyClaim(parking, byUrl.get(ACCESSIBILITY_PAGE), '2026-10-02')).toBe('expired');
  });

  test('the reverse: A times out and B succeeds, and neither inherits the other', () => {
    const byUrl = new Map([
      [FAMILY_PAGE, [record('ok', '2026-09-28')]],
      [ACCESSIBILITY_PAGE, [record('timeout', '2026-09-28')]],
    ]);

    expect(classifyClaim(babyChanging, byUrl.get(FAMILY_PAGE), '2026-10-02')).toBe('expired');
    expect(classifyClaim(parking, byUrl.get(ACCESSIBILITY_PAGE), '2026-10-02')).toBe('stale');
  });

  test('an overall-successful venue run with one failed source still protects that source’s claim', () => {
    // This is the case a venue-level "job completed" signal gets wrong: the worker reports success
    // because the bundle was usable, while one page was never actually re-read.
    const byUrl = new Map([
      [ACCESSIBILITY_PAGE, [record('ok', '2026-09-28')]],
      [FAMILY_PAGE, [record('blocked', '2026-09-28')]],
    ]);

    expect(classifyClaim(babyChanging, byUrl.get(FAMILY_PAGE), '2026-10-02')).toBe('stale');
    expect(classifyClaim(parking, byUrl.get(ACCESSIBILITY_PAGE), '2026-10-02')).toBe('expired');
  });

  test('a run that died before fetching anything grants nothing', () => {
    // No evidence rows were written for any source, so no claim was attempted.
    expect(classifyClaim(babyChanging, undefined, '2026-10-02')).toBe('expired');
    expect(classifyClaim(parking, undefined, '2026-10-02')).toBe('expired');
  });
});

describe('addDays', () => {
  test('handles month and year boundaries', () => {
    expect(addDays('2026-10-01', 14)).toBe('2026-10-15');
    expect(addDays('2026-12-28', 14)).toBe('2027-01-11');
    expect(addDays('2026-10-01', -7)).toBe('2026-09-24');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
