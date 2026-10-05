import { describe, expect, it } from 'vitest';

const { summarizeReports, selectQuestions, validateReport, priorityOf } = require('../../../server/feedback/_lib/rules');

const NOW = Date.parse('2026-10-05T12:00:00Z');
const day = (offset: number) => new Date(NOW - offset * 86400000).toISOString().slice(0, 10);
const official = (value: string, checkedDaysAgo = 5, key = 'familyFacilities.babyChanging') => ({ fieldKey: key, valueJson: value, checkedAt: day(checkedDaysAgo), sourceUrl: 'https://venue.example/visit' });
const seen = (answer: string, user = 'u1', daysAgo = 2, key = 'babyChanging') => ({ user_id: user, visit_date: day(daysAgo), answers: { [key]: answer }, status: 'active', created_at: `${day(daysAgo)}T15:00:00Z` });
const bc = (claims: unknown[], reports: unknown[]) => summarizeReports(claims, reports, NOW).babyChanging;

describe('R1: which observations count', () => {
  it('ignores "did not check", inactive rows and anything older than 90 days, and counts an account once', () => {
    const rows = [seen('did_not_check', 'a'), { ...seen('yes', 'b'), status: 'removed' }, seen('yes', 'c', 120), seen('yes', 'd', 3), seen('no', 'd', 9)];
    const f = bc([], rows);
    expect(f.reportCount).toBe(1);
    expect(f.observations).toEqual(['yes']); // d's latest (3 days ago) stands over d's older 'no'
  });
});

describe('R2 and R3: official evidence is never rewritten, only questioned', () => {
  it('shows an agreeing report beside the official value without changing it', () => {
    const f = bc([official('yes')], [seen('yes')]);
    expect(f).toMatchObject({ status: 'source_checked', value: 'yes', reportCount: 1 });
  });
  it('a later contradiction puts the field in recheck and hides the value, but the claim object is untouched', () => {
    const claim = official('yes');
    const snapshot = JSON.stringify(claim);
    const f = bc([claim], [seen('no')]);
    expect(f).toMatchObject({ status: 'needs_recheck', value: 'unknown' });
    expect(JSON.stringify(claim)).toBe(snapshot);
  });
  it('an observation older than the source check cannot dismiss the source; a newer one can question it', () => {
    expect(bc([official('yes', 1)], [seen('no', 'u1', 4)]).status).toBe('source_checked');
    expect(bc([official('yes', 6)], [seen('no', 'u1', 4)]).status).toBe('needs_recheck');
  });
  it('a temporary closure ("unavailable") questions an official yes without becoming a permanent no', () => {
    const f = bc([official('yes')], [seen('unavailable')]);
    expect(f.status).toBe('needs_recheck');
    expect(f.observations).toEqual(['unavailable']);
  });
  it('many agreeing reports still never turn into a source check', () => {
    const f = bc([], [seen('yes', 'a'), seen('yes', 'b'), seen('yes', 'c')]);
    expect(f.status).toBe('parent_reported');
    expect(['source_checked', 'editor_checked']).not.toContain(f.status);
  });
});

describe('R4: parent observations with no official claim', () => {
  it('one account is a single report; the value stays unknown', () => {
    expect(bc([], [seen('yes')])).toMatchObject({ status: 'parent_reported', agreement: 'single', value: 'unknown', reportCount: 1 });
  });
  it('two or more accounts who agree are corroborated: stronger evidence, still not official', () => {
    expect(bc([], [seen('yes', 'a'), seen('yes', 'b')])).toMatchObject({ status: 'parent_reported', agreement: 'corroborated', value: 'unknown', reportCount: 2 });
  });
  it('accounts who disagree are contested and need a recheck', () => {
    expect(bc([], [seen('yes', 'a'), seen('no', 'b')])).toMatchObject({ status: 'needs_recheck', agreement: 'contested' });
  });
});

describe('R5: absence is not "no"', () => {
  it('no claim and no reports is unknown', () => {
    expect(bc([], [])).toMatchObject({ status: 'unknown', value: 'unknown', reportCount: 0, agreement: 'none' });
  });
});

describe('what to ask next', () => {
  const all = (over: Record<string, unknown[]> = {}, reports: unknown[] = []) => {
    const claims = Object.entries(over).flatMap(([, v]) => v);
    return summarizeReports(claims, reports, NOW);
  };
  it('asks disputed first, then unknown, then stale, then single reports, and never a fresh confirmed field', () => {
    const fields = all(
      { a: [official('yes', 5, 'familyFacilities.toilets')], b: [official('yes', 90, 'familyFacilities.parking')], c: [official('yes', 5, 'familyFacilities.cafe')] },
      [seen('no', 'u', 2, 'cafe'), seen('good', 'p', 2, 'pushchair')],
    );
    expect(fields.cafe.priority).toBe(0); // contradicted
    expect(fields.babyChanging.priority).toBe(1); // unknown
    expect(fields.parking.priority).toBe(2); // official, 90 days old: stale
    expect(fields.pushchair.priority).toBe(3); // a single parent report
    expect(fields.toilets.priority).toBe(9); // confirmed and fresh
    expect(selectQuestions(fields)).toEqual(['cafe', 'babyChanging', 'parking']); // the single-report buggy field (3) is fourth
  });
  it('asks at most three, and nothing at all when every field is confirmed and fresh', () => {
    const everything = summarizeReports(
      ['familyFacilities.babyChanging', 'pushchairSuitability', 'familyFacilities.toilets', 'familyFacilities.parking', 'familyFacilities.cafe'].map((k) => official(k === 'pushchairSuitability' ? 'good' : 'yes', 3, k)),
      [],
      NOW,
    );
    expect(selectQuestions(everything)).toEqual([]);
    expect(selectQuestions(summarizeReports([], [], NOW))).toHaveLength(3);
  });
  it('a corroborated report is worth asking about less than a single one', () => {
    expect(priorityOf({ status: 'parent_reported', agreement: 'single' })).toBeLessThan(priorityOf({ status: 'parent_reported', agreement: 'corroborated' }));
  });
});

describe('what may be reported', () => {
  const body = { venueId: 'fp-google-x', visitDate: day(1), attended: true, answers: { babyChanging: 'yes' } };
  it('requires first-hand attendance, a recent date, at most three real answers and one that is not "did not check"', () => {
    expect(validateReport(body, NOW).answers).toEqual({ babyChanging: 'yes' });
    expect(() => validateReport({ ...body, attended: false }, NOW)).toThrow();
    expect(() => validateReport({ ...body, answers: { babyChanging: 'did_not_check' } }, NOW)).toThrow();
    expect(() => validateReport({ ...body, answers: { babyChanging: 'yes', toilets: 'yes', parking: 'yes', cafe: 'yes' } }, NOW)).toThrow();
  });
  it('carries no identity beyond the account and nothing about the family', () => {
    expect(Object.keys(validateReport(body, NOW)).sort()).toEqual(['answers', 'venueId', 'visitDate']);
  });
});
