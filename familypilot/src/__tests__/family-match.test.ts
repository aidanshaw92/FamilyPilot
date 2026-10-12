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
  it('says Excellent for the named children when the venue’s own ages cover both and nothing is against or still needed', () => {
    const r = run(venue({}, { minRecommendedAge: 1, maxRecommendedAge: 10, toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes' }));
    // Parking and a café are unknown: secondary details, which never hold a strong match down (docs/FAMILY_FIT_GRADING.md).
    expect(r.verdict).toBe('excellent');
    expect(r.headline).toBe('Excellent for Sloane and Theo');
    expect(r.forNames).toEqual(['Sloane', 'Theo']);
    expect(r.reasons.map((l) => l.text)).toContain('Suits Sloane and Theo (recommended for ages 1–10)');
    expect(r.reasons.map((l) => l.text)).toContain('Good buggy access for Theo’s buggy');
    // Opening state is a fact about the day, not a reason the place suits them.
    expect(r.reasons.map((l) => l.text)).not.toContain('Open until 5pm');
  });

  it('does not call a place a good fit when it is over the family’s drive limit', () => {
    const r = run(venue({ driveMinutes: 34 }, { toilets: 'yes', pushchairSuitability: 'good', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile(), 90);
    expect(r.verdict).toBe('possible');
    expect(r.cautions.map((l) => l.text)).toContain('34 min away, 4 min over the 30 min drive we’re using');
    expect(r.headline).toMatch(/^Possible for /);
  });

  it('unknown buggy access for a family with a buggy keeps a strong match at Good, never Excellent, and says what to check', () => {
    const r = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile(), 92);
    expect(r.verdict).toBe('good');
    expect(r.toCheck.map((l) => l.text)).toContain('Buggy access still to be checked for Theo’s buggy');
    // Stated as a must-have, it is a requirement nobody has checked: Possible.
    const stated = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile({ mustHaveFacilities: ['pushchair_friendly'] }), 92);
    expect(stated.verdict).toBe('possible');
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
    expect(r.today.label).toBe('Closed today · opens tomorrow 10am');
    expect(r.cautions.map((l) => l.text)).not.toContain('Closed today · opens tomorrow 10am');
    expect(r.headline).not.toMatch(/today/i);
  });

  it('keeps a place FamilyPilot has not reviewed as Not yet reviewed, still saying what is known', () => {
    const r = run(venue({ enrichmentStatus: 'provider_only' }), profile(), 99);
    expect(r.verdict).toBe('not_reviewed');
    expect(r.headline).toBe('Family suitability not yet reviewed');
    expect(r.reasons.map((l) => l.text)).toEqual(['20 min away']);
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

  it('a park with toilets and no playground on record is likely good for a 7-year-old, said as an inference and never as a confirmed fit', () => {
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { toilets: 'yes' }), p);
    expect(r.verdict).toBe('good');
    expect(r.headline).toBe('Likely good for Sloane');
    expect(r.headline).not.toMatch(/^(Good|Excellent) for/);
    const line = r.reasons.find((l) => l.key === 'suits-c1');
    expect(line?.inferred).toBe(true);
    expect(line?.text).toBe('A park usually gives a 7-year-old like Sloane space to run around; nothing child-specific is confirmed here yet');
    expect(r.children[0].basis).toBe('likely');
    expect(matchBadgeText(r)).toBe('Likely good for Sloane');
  });

  it('never prints a name it does not have', () => {
    const p = profile({ members: [parent, child('c1', '', 7)] });
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes' }), p);
    expect(r.headline).not.toMatch(/undefined|  /);
    expect(r.forNames).toEqual([]);
  });

  it('weather is not an input: rain and sun on an indoor or outdoor place change nothing about the fit', () => {
    const outdoor = venue({}, { environment: 'outdoor', toilets: 'yes' });
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const base = run(outdoor, p);
    for (const condition of ['rainy', 'sunny', 'cloudy', 'partly_cloudy'] as const) {
      const r = evaluateFamilyMatch({
        venue: outdoor, profile: p, score: 80, now: NOW,
        // @ts-expect-error weather is deliberately not an input to Family Fit
        weather: { condition, temperature: 11, description: 'x' },
      });
      expect(r).toEqual(base);
    }
    expect(base.reasons.some((l) => /weather|rain/i.test(l.text))).toBe(false);
    expect(base.cautions.some((l) => /weather|rain/i.test(l.text))).toBe(false);
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

  it('gives the card the one line that changes a decision, and leads with the venue’s own fact when nothing does', () => {
    // Buggy access unknown is a secondary detail now: it is on the venue page, and the card leads with what is confirmed.
    const r = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }));
    expect(r.cardNote).toBe('Suits Sloane and Theo (recommended for ages 1–10)');
    // A requirement the household stated and nobody has checked still leads the card.
    const stated = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile({ mustHaveFacilities: ['parking'] }));
    expect(stated.cardNote).toBe('Parking, which you said you need, still to be checked');
  });

  it('closing soon is a fact about the day: it does not lower the verdict or appear in what is said about the fit', () => {
    const late = new Date(Date.UTC(2026, 9, 6, 15, 40, 0)); // 16:40 in London (BST), closing at 17:00
    const facts = { toilets: 'yes', babyChanging: 'yes', pushchairSuitability: 'good', minRecommendedAge: 1, maxRecommendedAge: 10 } as const;
    const closing = evaluateFamilyMatch({ venue: venue({}, facts), profile: profile(), score: 85, now: late });
    const morning = evaluateFamilyMatch({ venue: venue({}, facts), profile: profile(), score: 85, now: NOW });
    expect(closing.today.state).toBe('closing_soon');
    expect(closing.verdict).toBe(morning.verdict);
    expect(closing.cardNote).toBe(morning.cardNote);
    expect(JSON.stringify([closing.reasons, closing.cautions, closing.toCheck, closing.headline])).not.toMatch(/closing|until|today/i);
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
    expect(r.verdict).toBe('good');
    expect(r.headline).toBe('Good for Sloane, but check buggy access for Ozzie');
  });

  it('names only the child a breach is about', () => {
    const r = run(venue({}, { ...base, pushchairSuitability: 'difficult' }), two(), 90);
    expect(r.verdict).toBe('poor');
    expect(r.headline).toBe('Not recommended for Ozzie');
  });

  it('claims nothing confirmed for a child nobody has a fact about: a park with nothing checked is Possible, said as an inference', () => {
    const only = profile({ members: [parent, child('c3', 'Mia', 8)] });
    const r = run(venue({}, {}), only, 90);
    expect(r.verdict).toBe('possible');
    expect(r.headline).not.toMatch(/^(Good|Excellent) for/);
    expect(r.reasons.filter((l) => !l.inferred && l.key !== 'drive-ok')).toEqual([]);
    expect(r.evidenceCompleteness.known).toBe(0);
  });
});

describe('Family Fit never says "good for the family" from a subset of the children', () => {
  const two = () => profile({ members: [parent, child('c1', 'Sloane', 7), child('c2', 'Ozzie', 0, { mobility: ['buggy'] })] });
  const sevenAndNine = () => profile({ members: [parent, child('c1', 'Sloane', 7), child('c2', 'Maya', 9)] });
  const practical = { toilets: 'yes', parking: 'yes' } as const;

  it('a practical fact about one child is "easy to visit with" them, never "Good for" them, while the other is unknown', () => {
    // Baby changing and buggy access are confirmed, which makes the VISIT easy with Ozzie. Nothing at all is known about whether
    // the place suits Sloane, and nothing about Ozzie says it suits him as an activity either.
    const museum = venue({ category: 'museum' } as Partial<Venue>, { ...practical, category: 'museum', babyChanging: 'yes', pushchairSuitability: 'good' });
    const r = run(museum, two(), 85);
    expect(r.children.map((c) => [c.name, c.state, c.basis])).toEqual([['Sloane', 'unknown', null], ['Ozzie', 'works', 'logistics']]);
    expect(r.verdict).toBe('possible');
    expect(r.headline).toBe('Easy to visit with Ozzie, but we haven’t yet confirmed whether the exhibits suit Sloane');
    expect(r.headline).not.toMatch(/Good for/);
    expect(r.forNames).toEqual([]);
    expect(r.gapNames).toEqual(['Sloane']);
    // At a park the same facts read differently: a park is for running around, said as an inference, and the grade is Good.
    const park = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
    expect(park.verdict).toBe('good');
    expect(park.headline).toBe('Likely good for Sloane, and easy to visit with Ozzie');
    expect(park.children.map((c) => [c.name, c.state, c.basis])).toEqual([['Sloane', 'works', 'likely'], ['Ozzie', 'works', 'logistics']]);
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

  it('nothing confirmed for any child at a museum: the practical facts are good, and that is all the headline claims, at Possible', () => {
    const r = run(venue({ category: 'museum' } as Partial<Venue>, { ...practical, category: 'museum' }), sevenAndNine(), 80);
    expect(r.children.every((c) => c.state === 'unknown')).toBe(true);
    expect(r.verdict).toBe('possible');
    expect(r.practicalOnly).toBe(true);
    expect(r.headline).toBe('Looks practical, but we haven’t yet confirmed whether the exhibits suit Sloane and Maya');
    expect(r.headline).not.toMatch(/your family/);
  });

  it('lists the child nothing is confirmed for among the things to check', () => {
    const r = run(venue({ category: 'museum' } as Partial<Venue>, { ...practical, category: 'museum', babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
    expect(r.toCheck.map((line) => line.text)).toContain('We haven’t yet confirmed whether the exhibits suit Sloane');
  });

  it('cannot be excellent while a child is left over: excellent means nothing is left to check', () => {
    const r = run(venue({ facilities: ['cafe'], category: 'museum' } as Partial<Venue>, { ...practical, category: 'museum', babyChanging: 'yes', pushchairSuitability: 'good', environment: 'indoor' }), two(), 95);
    expect(r.gapNames).toEqual(['Sloane']);
    expect(r.verdict).not.toBe('excellent');
  });

  it('says who is covered only when every child is: both named, no gap', () => {
    const r = run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 78);
    expect(r.gapNames).toEqual([]);
    expect(r.headline).toBe('Excellent for Sloane and Ozzie');
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
    const noAges = run(venue({ category: 'museum' } as Partial<Venue>, { ...practical, category: 'museum', babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
    expect(noAges.headline).toContain('we haven’t yet confirmed whether the exhibits suit Sloane');
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
    it('says Possible fit, never "Good for Ozzie", when the baby is easy and nothing says the museum suits Sloane', () => {
      // Ozzie's confirmed facts are practical ones (changing, buggy): the visit is easy for him, the exhibits were never
      // judged for anyone, and nothing is known for Sloane. The grade is Possible and the badge says the grade.
      const r = run(venue({ category: 'museum' } as Partial<Venue>, { ...practical, category: 'museum', babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
      expect(matchBadgeText(r)).toBe('Possible fit');
      expect(matchBadgeText(r)).not.toMatch(/good/i);
      // The same household at a park: the park is likely good for Sloane, and the badge keeps the hedge.
      const park = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
      expect(matchBadgeText(park)).toBe('Likely good for Sloane');
    });

    it('says "Good for" only the child the recommended ages cover, with the other still to check', () => {
      const r = { verdict: 'good' as const, forNames: ['Ozzie'], gapNames: ['Sloane'], suitedNames: ['Ozzie'], easyNames: [] };
      expect(matchBadgeText(r, 40)).toBe('Good for Ozzie · check Sloane');
      expect(matchBadgeText(r, 8)).toBe('Good for some · check kids');
    });

    it('reports which children the venue’s words cover, which an inference covers, and which only the practical facts do', () => {
      const r = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
      expect(r.suitedNames).toEqual([]);
      expect(r.likelyNames).toEqual(['Sloane']);
      expect(r.easyNames).toEqual(['Ozzie']);
    });

    it('falls back to a short form when the names will not fit, never to a name alone', () => {
      const r = run(venue({}, { ...practical, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 85);
      expect(matchBadgeText(r, 4)).toBe('Likely a good fit');
    });

    it('still names both children when both are confirmed', () => {
      const r = run(venue({}, { ...practical, minRecommendedAge: 0, maxRecommendedAge: 10, babyChanging: 'yes', pushchairSuitability: 'good' }), two(), 78);
      expect(matchBadgeText(r, 40)).toBe('Excellent for Sloane and Ozzie');
    });
  });
});
