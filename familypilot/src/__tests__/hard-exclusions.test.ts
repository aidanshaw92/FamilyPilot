import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { HARD_RULE_MAX_AGE_DAYS, closureToday, evaluateVenueRules } from '@/src/services/matching/venue-rules';
import { PlanningFamily, familyRequest } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { JourneyMatrix, StopRequest } from '@/src/types/day-sequence';
import type { VenueRule } from '@/src/types/venue-rules';

/**
 * A hard exclusion is the most expensive thing the app can get wrong: a family is told a place is shut and never sees it.
 * So every refusal has to survive five questions, and these tests ask each of them at the boundary:
 *   1. Is it the whole venue, on that date, and no other date?   (dates, inclusive ends, year end, clock change, time zone)
 *   2. Was the page read recently enough to be believed?           (90 days, and a reading date at all)
 *   3. Does anything else the venue says contradict it?            (then it warns)
 *   4. Does the venue itself soften it?                            (then it says so)
 *   5. Do Home, Explore, Venue Detail and the planner all agree?   (one definition, four surfaces)
 * Anything that fails 2 to 4 is not dropped: it becomes a prominent warning that names its reading date.
 */

const TODAY = '2026-10-08';
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`)); });
afterAll(() => { vi.useRealTimers(); });

const closure = (over: Partial<VenueRule> = {}): VenueRule => ({
  id: 'closed', kind: 'closure', scope: 'venue', from: '2026-10-09', until: '2026-10-09', checkedAt: TODAY,
  text: 'Our South Kensington site will be closed on Friday 9 October 2026, as we’re hosting a charity gala.', ...over,
});
const visit = (date: string, today = TODAY) => ({ date, today, usesPushchair: false, requiresPushchair: false, needsStepFree: false });
const blocked = (rules: VenueRule[], date: string, today = TODAY) => evaluateVenueRules(rules, visit(date, today)).closedAllDay !== null;

describe('1. whole venue, that date, no other', () => {
  it('a single closed day is refused that day only', () => {
    const rules = [closure()];
    expect(blocked(rules, '2026-10-08')).toBe(false);
    expect(blocked(rules, '2026-10-09')).toBe(true);
    expect(blocked(rules, '2026-10-10')).toBe(false);
  });

  it('a range is inclusive at both ends and nothing else', () => {
    const xmas = [closure({ id: 'xmas', from: '2026-12-24', until: '2026-12-26', text: 'Closed 24, 25 and 26 December.' })];
    expect(['2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27'].map((d) => blocked(xmas, d))).toEqual([false, true, true, true, false]);
  });

  it('crosses the year end without a gap or an overreach', () => {
    const ny = [closure({ id: 'ny', from: '2026-12-31', until: '2027-01-01', text: 'Closed 31 December and 1 January.' })];
    expect(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'].map((d) => blocked(ny, d))).toEqual([false, true, true, false]);
  });

  it('a weekly closure with no dates refuses that weekday and no other', () => {
    const mondays = [closure({ id: 'mon', from: null, until: null, weekdays: [1], text: 'Closed on Mondays.' })];
    expect(blocked(mondays, '2026-10-12')).toBe(true); // Monday
    expect(blocked(mondays, '2026-10-13')).toBe(false);
    expect(blocked(mondays, '2026-10-11')).toBe(false);
  });

  it('a date that cannot be read refuses nothing (it warns instead)', () => {
    const verdict = evaluateVenueRules([closure()], visit('tomorrow'));
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.notes.map((n) => n.ruleId)).toContain('closed');
  });

  it('an area closure never refuses the venue, however it is dated', () => {
    const area = closure({ id: 'gallery', scope: 'area', area: 'Nature Gallery', from: null, until: '2027-02-05', text: 'The Nature Gallery is closed until 5 February 2027.' });
    expect(blocked([area], '2026-11-01')).toBe(false);
    expect(evaluateVenueRules([area], visit('2026-11-01')).notes[0]).toMatchObject({ ruleId: 'gallery' });
  });

  it('an unbounded "closed" is a warning and never rules the venue out for ever', () => {
    const open = closure({ id: 'undated', from: null, until: null, weekdays: null, text: 'Temporarily closed.' });
    const verdict = evaluateVenueRules([open], visit('2026-10-09'));
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.notes[0]).toMatchObject({ severity: 'important', ruleId: 'undated' });
  });

  describe('the venue-local day, across the clock change', () => {
    const single = (date: string) => [closure({ from: date, until: date, checkedAt: date })];
    const at = (rules: VenueRule[], iso: string) => closureToday(rules, new Date(iso), 'Europe/London') !== null;

    it('BST: 22:59 UTC on the 8th is still the 8th in London; 23:00 UTC is the 9th', () => {
      const r = single('2026-10-09');
      expect(at(r, '2026-10-08T22:59:00Z')).toBe(false);
      expect(at(r, '2026-10-08T23:00:00Z')).toBe(true);
      expect(at(r, '2026-10-09T22:59:00Z')).toBe(true);
      expect(at(r, '2026-10-09T23:00:00Z')).toBe(false);
    });

    it('the night the clocks go back (25 October 2026): the 25th is 25 hours long and every hour of it is closed', () => {
      const r = single('2026-10-25');
      expect(at(r, '2026-10-24T22:59:00Z')).toBe(false);
      expect(at(r, '2026-10-24T23:00:00Z')).toBe(true); // 00:00 BST
      expect(at(r, '2026-10-25T23:59:00Z')).toBe(true); // 23:59 GMT
      expect(at(r, '2026-10-26T00:00:00Z')).toBe(false);
    });

    it('GMT in winter: UTC and London days agree', () => {
      const r = single('2026-12-24');
      expect(at(r, '2026-12-23T23:59:00Z')).toBe(false);
      expect(at(r, '2026-12-24T00:00:00Z')).toBe(true);
      expect(at(r, '2026-12-24T23:59:00Z')).toBe(true);
      expect(at(r, '2026-12-25T00:00:00Z')).toBe(false);
    });
  });
});

describe('2. the reading must be recent, and dated', () => {
  const rulesRead = (checkedAt: string | null) => [closure({ checkedAt })];

  it(`a reading ${HARD_RULE_MAX_AGE_DAYS} days old still refuses; one day older only warns`, () => {
    expect(blocked(rulesRead('2026-07-10'), '2026-10-09')).toBe(true); // 90 days
    expect(blocked(rulesRead('2026-07-09'), '2026-10-09')).toBe(false); // 91 days
  });

  it('a stale reading still shows, as a prominent warning that names the day it was read', () => {
    const verdict = evaluateVenueRules(rulesRead('2026-06-01'), visit('2026-10-09'));
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.downgraded).toEqual([{ ruleId: 'closed', reason: 'stale' }]);
    expect(verdict.notes[0]).toMatchObject({ severity: 'important' });
    expect(verdict.notes[0].text).toContain('as of 1 June 2026');
    expect(verdict.notes[0].text).toContain('Check before you go');
  });

  it('age is measured to the day the decision is made, not the day of the visit: a notice read today about Christmas is fresh', () => {
    const xmas = [closure({ id: 'xmas', from: '2026-12-24', until: '2026-12-26', checkedAt: TODAY })];
    expect(blocked(xmas, '2026-12-25', TODAY)).toBe(true);
    // The same notice, judged three months later without being read again, is no longer enough to refuse.
    expect(blocked(xmas, '2026-12-25', '2027-01-10')).toBe(false);
  });

  it('no reading date, or one in the future, cannot refuse', () => {
    expect(evaluateVenueRules(rulesRead(null), visit('2026-10-09')).downgraded).toEqual([{ ruleId: 'closed', reason: 'undated' }]);
    expect(evaluateVenueRules(rulesRead('2026-10-20'), visit('2026-10-09')).downgraded).toEqual([{ ruleId: 'closed', reason: 'undated' }]);
    expect(evaluateVenueRules(rulesRead('not a date'), visit('2026-10-09')).closedAllDay).toBeNull();
  });

  it('a pushchair or step-free refusal is held to the same standard', () => {
    const noBuggies: VenueRule = { id: 'nb', kind: 'pushchair', scope: 'area', coversCoreVisit: true, checkedAt: '2026-01-01', text: 'No pushchairs in the play areas.' };
    const v = { ...visit('2026-10-09'), usesPushchair: true, requiresPushchair: true };
    expect(evaluateVenueRules([noBuggies], v).blocksHousehold).toBeNull();
    expect(evaluateVenueRules([noBuggies], v).notes[0].text).toContain('No pushchairs in the play areas.');
    expect(evaluateVenueRules([{ ...noBuggies, checkedAt: TODAY }], v).blocksHousehold?.id).toBe('nb');
  });
});

describe('3. a contradicting reading turns a refusal into a warning', () => {
  const contradicted = closure({ contradiction: 'the homepage says “Open every day”' });

  it('never blocks, and says what disagrees', () => {
    const verdict = evaluateVenueRules([contradicted], visit('2026-10-09'));
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.downgraded).toEqual([{ ruleId: 'closed', reason: 'contradicted' }]);
    expect(verdict.notes[0].text).toContain('Another page says otherwise: the homepage says “Open every day”');
  });

  it('an uncontradicted rule on the same date still refuses', () => {
    expect(blocked([closure()], '2026-10-09')).toBe(true);
  });
});

describe('4. the venue’s own exception travels with the closure', () => {
  const exception: VenueRule = { id: 'gardens-open', kind: 'caution', scope: 'area', area: 'Gardens', exceptionOf: 'closed', from: '2026-10-09', until: '2026-10-09', checkedAt: TODAY, text: 'The gardens stay open.' };

  it('a closure with an applicable exception warns with the exception instead of refusing', () => {
    const verdict = evaluateVenueRules([closure(), exception], visit('2026-10-09'));
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.downgraded).toEqual([{ ruleId: 'closed', reason: 'excepted' }]);
    expect(verdict.notes[0].text).toContain('The gardens stay open.');
  });

  it('an exception for another date does not rescue this date', () => {
    expect(blocked([closure(), { ...exception, from: '2026-10-10', until: '2026-10-10' }], '2026-10-09')).toBe(true);
  });
});

describe('5. Home, Explore, Venue Detail and the planner apply one definition', () => {
  const facts = (rules: VenueRule[]): MatchableVenueFacts => ({
    placeId: 'fp-v', name: 'Natural History Museum', category: 'museum', driveMinutes: 20, enrichmentStatus: 'verified',
    minRecommendedAge: 0, maxRecommendedAge: 12, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'unknown',
    pushchairSuitability: 'good', environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: 120, estimatedSpend: null,
    goodToKnow: [], warnings: [], openingStatus: 'unknown', rules,
  });
  const family: PlanningFamily = { id: 'a', label: 'Family A', area: 'Town', latitude: 51.5, longitude: -0.1, ages: [4], maxDriveMinutes: 45, pushchair: false, required: [], routines: [] };
  const request = (rules: VenueRule[]): StopRequest => ({ placeId: 'fp-v', name: 'Natural History Museum', role: 'activity', anchor: true, dwellMinutes: 90, facts: facts(rules) });
  const matrix: JourneyMatrix = { legs: {
    [homeKey('a')]: { [stopKey('fp-v')]: { minutes: 20, source: 'estimated' } },
    [stopKey('fp-v')]: { [homeKey('a')]: { minutes: 20, source: 'estimated' } },
  } };
  const options = (date: string): SequenceOptions => ({ date, leaveAt: '09:00', arriveAt: '10:30', returnBy: '', bufferMinutes: 15, environment: 'either' } as SequenceOptions);
  const now = new Date(`${TODAY}T08:00:00`);

  const surfaces = (rules: VenueRule[], date: string) => ({
    card: closureToday(rules, new Date(`${date}T10:00:00Z`)) !== null,
    shared: evaluateVenueRules(rules, visit(date)).closedAllDay !== null,
    matcher: matchVenueToDayRequest(facts(rules), familyRequest(family, 'either', date)).eligible === false,
    planner: !sequenceDay([request(rules)], [family], matrix, options(date), now).ok,
  });

  const cases: Array<[string, VenueRule[], string, boolean]> = [
    ['the closed day', [closure()], '2026-10-09', true],
    ['the day before', [closure()], '2026-10-08', false],
    ['the day after', [closure()], '2026-10-10', false],
    ['a stale reading', [closure({ checkedAt: '2026-05-01' })], '2026-10-09', false],
    ['a contradicted reading', [closure({ contradiction: 'the homepage says “Open every day”' })], '2026-10-09', false],
    ['an excepted closure', [closure(), { id: 'x', kind: 'caution', scope: 'area', exceptionOf: 'closed', checkedAt: TODAY, text: 'Gardens open.' } as VenueRule], '2026-10-09', false],
    ['an area closure', [closure({ scope: 'area', area: 'Gallery' })], '2026-10-09', false],
    ['no rules at all', [], '2026-10-09', false],
  ];

  it.each(cases)('%s: every surface gives the same answer', (_name, rules, date, expected) => {
    const s = surfaces(rules, date);
    expect(s).toEqual({ card: expected, shared: expected, matcher: expected, planner: expected });
  });
});
