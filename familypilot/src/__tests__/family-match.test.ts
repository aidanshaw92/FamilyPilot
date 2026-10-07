import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch, matchBadgeText } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

// A Tuesday at 11:00 on the device (routines are the parent's own clock); a London venue is open 10:00 to 17:00 then.
const NOW = new Date(2026, 9, 6, 11, 0, 0);

const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra,
});
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };

function profile(over: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    id: 'f', parentName: 'Alex', members: [parent, child('c1', 'Sloane', 7), child('c2', 'Theo', 2, { mobility: ['buggy'] })],
    homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [], ...over,
  } as FamilyProfile;
}

const unknownFacts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'park', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};

function venue(over: Partial<Venue> = {}, facts: Partial<MatchableVenueFacts> = {}): Venue {
  return {
    id: 'fp-x', name: 'Test Place', category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
    structuredOpeningHours: OPEN_DAILY, trustedFacts: unknownFacts(facts), facilities: [], ...over,
  } as Venue;
}

const run = (v: Venue, p = profile(), score = 80) => evaluateFamilyMatch({ venue: v, profile: p, score, now: NOW });

describe('Family Match: the honest verdict', () => {
  it('says Good for the named child when confirmed facts are about that child', () => {
    const r = run(venue({}, { minRecommendedAge: 1, maxRecommendedAge: 10, toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes' }));
    expect(r.verdict).toBe('good');
    expect(r.headline).toBe('Good for Sloane and Theo');
    expect(r.forNames).toEqual(['Sloane', 'Theo']);
    expect(r.reasons.map((l) => l.text)).toContain('Suits Sloane and Theo (recommended for ages 1–10)');
    expect(r.reasons.map((l) => l.text)).toContain('Good buggy access for Theo’s buggy');
    expect(r.reasons.map((l) => l.text)).toContain('Open until 5pm');
  });

  it('does not call a place a good fit when it is over the family’s drive limit', () => {
    const r = run(venue({ driveMinutes: 34 }, { toilets: 'yes', pushchairSuitability: 'good', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile(), 90);
    expect(r.verdict).toBe('possible');
    expect(r.cautions.map((l) => l.text)).toContain('34 min away, 4 min over the 30 min drive we’re using');
    expect(r.headline).toMatch(/^Possible for /);
  });

  it('caps the verdict at Possible when buggy access is unknown for a family with a buggy', () => {
    const r = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile(), 92);
    expect(r.verdict).toBe('possible');
    expect(r.toCheck.map((l) => l.text)).toContain('Buggy access still to be checked for Theo’s buggy');
  });

  it('does not ask a family without a buggy about buggies', () => {
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { toilets: 'yes', minRecommendedAge: 5, maxRecommendedAge: 12 }), p);
    expect(r.toCheck.some((l) => /uggy/.test(l.text))).toBe(false);
    expect(r.verdict).toBe('good');
  });

  it('treats a must-have confirmed absent as a breach, and an unchecked must-have as still to be checked', () => {
    const p = profile({ mustHaveFacilities: ['parking'], members: [parent, child('c1', 'Sloane', 7)] });
    const absent = run(venue({}, { parking: 'no', toilets: 'yes' }), p);
    expect(absent.verdict).toBe('poor');
    expect(absent.cautions.map((l) => l.text)).toContain('No parking here, and you said you need it');
    const unchecked = run(venue({}, { toilets: 'yes', minRecommendedAge: 5, maxRecommendedAge: 12 }), p);
    expect(unchecked.verdict).toBe('possible');
    expect(unchecked.toCheck.map((l) => l.text)).toContain('Parking, which you said you need, still to be checked');
  });

  it('names the child outside the recommended ages and keeps the child inside', () => {
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes' }));
    expect(r.verdict).toBe('possible');
    expect(r.forNames).toEqual(expect.arrayContaining(['Sloane']));
    expect(r.cautions.map((l) => l.text).join('|')).toMatch(/Theo is younger/);
  });

  it('says closed today when a place is shut all day, without calling it a poor fit (suitability and today are separate)', () => {
    // Was: closed today made the verdict "poor". Being shut today says nothing about whether the place suits the family,
    // and a parent may well plan it for tomorrow; what it must never do is claim today. See closed-today.test.ts.
    const monday = new Date(2026, 9, 5, 11, 0, 0);
    const hours: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [0, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 16, minute: 30 } })) };
    const r = evaluateFamilyMatch({ venue: venue({ structuredOpeningHours: hours }, { toilets: 'yes' }), profile: profile(), score: 90, now: monday });
    expect(r.verdict).not.toBe('poor');
    expect(r.availableToday).toBe(false);
    expect(r.today.state).toBe('closed_today');
    expect(r.cautions[0].text).toBe('Closed today · opens tomorrow 10am');
    expect(r.headline).toMatch(/, but not today$/);
  });

  it('keeps a place FamilyPilot has not reviewed as Not yet reviewed, still saying what is known', () => {
    const r = run(venue({ enrichmentStatus: 'provider_only' }), profile(), 99);
    expect(r.verdict).toBe('not_reviewed');
    expect(r.headline).toBe('Family suitability not yet reviewed');
    expect(r.reasons.map((l) => l.text)).toEqual(expect.arrayContaining(['Open until 5pm', '20 min away']));
  });

  it('REGRESSION: a high blended score with nothing confirmed is Possible, never Good', () => {
    const r = run(venue({}, {}), profile({ members: [parent, child('c1', 'Sloane', 7)] }), 96);
    // Only logistics are known (open, close): two positives, nothing about the family. That is "good" for a family
    // with no needs, so add a need that is unknown and it must fall back.
    const withNeed = run(venue({}, {}), profile({ members: [parent, child('c1', 'Sloane', 7)], mustHaveFacilities: ['toilets'] }), 96);
    expect(withNeed.verdict).toBe('possible');
    expect(r.verdict).not.toBe('excellent');
  });

  it('reserves Excellent for several confirmed facts about the venue and nothing left to check', () => {
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes', parking: 'yes' }), p, 92);
    expect(r.verdict).toBe('excellent');
    expect(r.headline).toBe('Excellent for Sloane');
  });

  it('uses "your family" when no confirmed fact is about a particular child, and does not say "Good for" it', () => {
    // Toilets are about the place and the visit, not about whether the activity suits the family: it is promising, not "good for".
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { toilets: 'yes' }), p);
    expect(r.headline).toBe('Looks promising for your family');
    expect(r.headline).not.toMatch(/^(Good|Excellent) for/);
  });

  it('never prints a name it does not have', () => {
    const p = profile({ members: [parent, child('c1', '', 7)] });
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes' }), p);
    expect(r.headline).not.toMatch(/undefined|  /);
    expect(r.forNames).toEqual([]);
  });

  it('treats rain on an outdoor place as a caution, not a reason', () => {
    const r = evaluateFamilyMatch({
      venue: venue({}, { environment: 'outdoor', toilets: 'yes' }), profile: profile({ members: [parent, child('c1', 'Sloane', 7)] }), score: 80, now: NOW,
      weather: { condition: 'rainy', temperature: 11, description: 'Rain' },
    });
    expect(r.reasons.some((l) => /weather/i.test(l.text))).toBe(false);
    expect(r.cautions.map((l) => l.text)).toContain('Outdoors, and rain is forecast');
    expect(r.verdict).toBe('possible');
  });

  it('leaves out the journey when it has not been worked out', () => {
    const r = run(venue({ driveMinutes: Number.NaN }, { toilets: 'yes' }), profile({ members: [parent, child('c1', 'Sloane', 7)] }));
    expect(r.reasons.some((l) => /min away/.test(l.text))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/NaN/);
  });

  it('flags baby changing for an under-three, as unknown when unchecked and as a reason when confirmed', () => {
    const base = profile({ members: [parent, child('c2', 'Theo', 2)] });
    expect(run(venue({}, {}), base).toCheck.map((l) => l.text)).toContain('Baby changing still to be checked for Theo');
    expect(run(venue({}, { babyChanging: 'yes' }), base).reasons.map((l) => l.text)).toContain('Baby changing confirmed, handy for Theo');
  });

  it('never reads the routines: a nap about to start is the planner’s business, not a reason or a caution about the place', () => {
    const p = profile({ routines: [{ id: 'r1', kind: 'nap', time: '11:20', durationMinutes: 90, atHome: true, childId: 'c2', label: '' }] as never });
    const withRoutine = run(venue({ driveMinutes: 25 }, { toilets: 'yes' }), p);
    const without = run(venue({ driveMinutes: 25 }, { toilets: 'yes' }), profile({}));
    const said = [...withRoutine.reasons, ...withRoutine.cautions, ...withRoutine.toCheck].map((l) => l.text).join('|');
    expect(said).not.toMatch(/nap|feed|leave by|routine/i);
    expect(withRoutine.verdict).toBe(without.verdict);
    expect(withRoutine.headline).toBe(without.headline);
  });

  it('gives the card the one line that changes a decision', () => {
    const r = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }));
    expect(r.cardNote).toBe('Open until 5pm · Buggy access still to be checked for Theo’s buggy');
  });

  it('says "Closing soon" once on the card, though it is both today\'s state and a caution', () => {
    const late = new Date(Date.UTC(2026, 9, 6, 15, 40, 0)) // 16:40 in London (BST);
    const r = evaluateFamilyMatch({ venue: venue({}, { toilets: 'yes', babyChanging: 'yes', pushchairSuitability: 'good', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile: profile(), score: 85, now: late });
    expect(r.cardNote).toBeTruthy();
    const closing = (r.cardNote ?? '').match(/closing soon/gi) ?? [];
    expect(closing.length).toBeLessThanOrEqual(1);
  });
});

describe('Family Fit talks about each child', () => {
  const two = () => profile({ members: [parent, child('c1', 'Sloane', 7), child('c2', 'Ozzie', 0, { mobility: ['buggy'] })] });
  const base = { minRecommendedAge: 0, maxRecommendedAge: 10, toilets: 'yes', babyChanging: 'yes', parking: 'yes' } as const;

  it('says who it is good for, naming both children when the evidence is about both', () => {
    const r = run(venue({}, { ...base, pushchairSuitability: 'good' }), two(), 90);
    expect(r.children.map((c) => [c.name, c.state])).toEqual([['Sloane', 'works'], ['Ozzie', 'works']]);
    expect(r.headline).toMatch(/for Sloane and Ozzie$/);
  });

  it('keeps the children apart: could work for one, check something for the other', () => {
    const r = run(venue({}, { ...base, pushchairSuitability: 'unknown' }), two(), 90);
    expect(r.children.find((c) => c.name === 'Ozzie')?.state).toBe('check');
    expect(r.children.find((c) => c.name === 'Sloane')?.state).toBe('works');
    expect(r.headline).toBe('Could work for Sloane, but check buggy access for Ozzie');
  });

  it('names only the child a breach is about', () => {
    const r = run(venue({}, { ...base, pushchairSuitability: 'difficult' }), two(), 90);
    expect(r.verdict).toBe('poor');
    expect(r.headline).toBe('Probably not for Ozzie');
  });

  it('claims nothing for a child nobody has a fact about', () => {
    const only = profile({ members: [parent, child('c3', 'Mia', 8)] });
    const r = run(venue({}, {}), only, 90);
    expect(r.children[0].state).toBe('unknown');
    expect(r.headline).not.toMatch(/Mia/);
  });
});

describe('Family Fit never says "good for the family" from a subset of the children', () => {
  const two = () => profile({ members: [parent, child('c1', 'Sloane', 7), child('c2', 'Ozzie', 0, { mobility: ['buggy'] })] });
  const sevenAndNine = () => profile({ members: [parent, child('c1', 'Sloane', 7), child('c2', 'Maya', 9)] });
  const practical = { toilets: 'yes', parking: 'yes' } as const;

  it('a practical fact about one child is "easy to visit with" them, never "Good for" them, while the other is unknown', () => {
    // Baby changing and buggy access are confirmed, which makes the VISIT easy with Ozzie. Nothing at all is known about whether
    // the place suits Sloane, and nothing about Ozzie says it suits him as an activity either.
    const r = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
    expect(r.children.map((c) => [c.name, c.state, c.basis])).toEqual([['Sloane', 'unknown', null], ['Ozzie', 'works', 'logistics']]);
    expect(r.headline).toBe('Easy to visit with Ozzie, but we haven’t yet confirmed whether this activity suits Sloane');
    expect(r.headline).not.toMatch(/Good for/);
    expect(r.forNames).toEqual([]);
    expect(r.gapNames).toEqual(['Sloane']);
  });

  it('a child with a check still open is said beside the good one, even when the verdict is good', () => {
    // Both children are inside the age range; Ozzie is a baby and baby changing has not been confirmed.
    const r = run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'unknown', pushchairSuitability: 'good' }), two(), 80);
    expect(r.verdict).toBe('good');
    expect(r.children.find((c) => c.name === 'Ozzie')?.state).toBe('check');
    expect(r.headline).toBe('Good for Sloane, but check baby changing for Ozzie');
    expect(r.headline).not.toMatch(/Sloane and Ozzie/);
    expect(r.gapNames).toEqual(['Ozzie']);
  });

  it('nothing confirmed for any child: the practical facts are good, and that is all the headline claims', () => {
    const r = run(venue({}, practical), sevenAndNine(), 80);
    expect(r.children.every((c) => c.state === 'unknown')).toBe(true);
    expect(r.verdict).toBe('good');
    expect(r.headline).toBe('Looks practical, but we haven’t yet confirmed whether this activity suits Sloane and Maya');
    expect(r.headline).not.toMatch(/your family/);
  });

  it('lists the child nothing is confirmed for among the things to check', () => {
    const r = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
    expect(r.toCheck.map((line) => line.text)).toContain('We haven’t yet confirmed whether this activity suits Sloane');
  });

  it('cannot be excellent while a child is left over: excellent means nothing is left to check', () => {
    const r = run(venue({ facilities: ['cafe'] }, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good', environment: 'indoor' }), two(), 95);
    expect(r.gapNames).toEqual(['Sloane']);
    expect(r.verdict).not.toBe('excellent');
  });

  it('says who is covered only when every child is: both named, no gap', () => {
    const r = run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 78);
    expect(r.gapNames).toEqual([]);
    expect(r.headline).toBe('Good for Sloane and Ozzie');
  });

  it('leaves a one-child household as it was: no gap is invented for a single child', () => {
    const one = profile({ members: [parent, child('c3', 'Mia', 2, { mobility: ['walks'] })] });
    const r = run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'unknown' }), one, 80);
    expect(r.gapNames).toEqual([]);
    expect(r.headline).toBe('Looks promising for your family');
  });

  it('speaks like a parent: no database phrasing anywhere a headline or a check line is shown', () => {
    const cases = [
      run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85),
      run(venue({}, practical), sevenAndNine(), 80),
      run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'unknown', pushchairSuitability: 'good' }), two(), 80),
    ];
    for (const r of cases) {
      const words = [r.headline, ...r.toCheck.map((l) => l.text)].join(' ');
      expect(words).not.toMatch(/nothing is confirmed|not confirmed|unconfirmed|unknown|null|undefined/i);
    }
  });

  it('says it the same natural way whether or not ages are on record, and never blames the venue for not publishing one', () => {
    const noAges = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
    expect(noAges.headline).toContain('we haven’t yet confirmed whether this activity suits Sloane');
    // Ages are on record, but nothing in them speaks for Sloane: the same sentence, with no database talk in either case.
    const withAges = run(venue({}, { ...practical, minRecommendedAge: 9, maxRecommendedAge: 12, babyChanging: 'yes', pushchairSuitability: 'good' }), sevenAndNine(), 80);
    // (With ages on record the venue HAS stated a range, so "check age range for Sloane" is the true and specific thing.)
    for (const r of [noAges, withAges]) {
      const words = [r.headline, ...r.toCheck.map((l) => l.text)].join(' ');
      expect(words).not.toMatch(/recorded|published|for this place yet|less certain/i);
    }
    expect([noAges.headline, ...noAges.toCheck.map((l) => l.text)].join(' ')).not.toMatch(/age range/i);
  });

  describe('the badge', () => {
    it('says the gap rather than "Good for Ozzie" alone', () => {
      const r = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
      expect(matchBadgeText(r)).toBe('Good fit · check Sloane');
      expect(matchBadgeText(r)).not.toBe('Good for Ozzie');
    });

    it('falls back to a short form when the names will not fit, never to a name alone', () => {
      const r = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
      expect(matchBadgeText(r, 8)).toBe('Good fit · check kids');
    });

    it('still names both children when both are confirmed', () => {
      const r = run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 78);
      expect(matchBadgeText(r, 40)).toBe('Good for Sloane and Ozzie');
    });
  });
});
