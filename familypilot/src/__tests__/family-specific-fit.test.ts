import { describe, expect, it } from 'vitest';

import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { scoreTrustedAccessibility } from '@/src/services/scoring/trusted-family-score';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { childAgeVerdicts, outsideRangeCautions, suitsChildrenLine } from '@/src/utils/child-fit';
import { familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';
import {
  createFeed,
  createNap,
  expandFeedInterval,
  resolveRoutines,
  routineLabel,
} from '@/src/utils/routine-schedule';
import { getProfileSuggestion, computeCompletionPercent } from '@/src/utils/profile-completion';
import { profileReceipt } from '@/src/utils/profile-receipt';
import { ChildMobility, FamilyMember, FamilyProfile, Venue, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * The six families the personalisation brief names, built from the same helper so each differs only in
 * who the children are. Ages are fixed in months through `ageMonths`/`age` (derivation has its own
 * tests); what matters here is what each family's answers do to a venue.
 */
function child(
  id: string,
  name: string,
  age: number,
  mobility: ChildMobility[] = [],
  ageMonths: number | null = null,
): FamilyMember {
  return { id, name, role: 'child', dateOfBirth: '2020-01-01', dobKnown: true, age, ageMonths, mobility };
}

function family(members: FamilyMember[], extra: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    id: 'f',
    parentName: 'Sam',
    members,
    homeLocation: 'Bushey',
    budgetTier: 'moderate',
    maxDriveMinutes: 30,
    completionPercent: 0,
    routines: [],
    ...extra,
  };
}

const BABY = child('c-baby', 'Poppy', 0, ['carrier', 'buggy'], 8);
const TODDLER = child('c-tod', 'Theo', 2, ['buggy']);
const OLDER = child('c-old', 'Mia', 8, ['walks']);
const WHEELCHAIR_KID = child('c-aid', 'Ada', 6, ['mobility-aid']);

const FAMILIES = {
  baby: family([BABY]),
  toddler: family([TODDLER]),
  older: family([OLDER]),
  babyAndToddler: family([BABY, TODDLER]),
  toddlerAndOlder: family([TODDLER, OLDER]),
  mixed: family([BABY, OLDER, WHEELCHAIR_KID]),
};

const FACTS: MatchableVenueFacts = {
  placeId: 'fp-1',
  name: 'Ridge Farm',
  category: 'farm',
  driveMinutes: 12,
  enrichmentStatus: 'enriched',
  minRecommendedAge: 5,
  maxRecommendedAge: 12,
  venueAgePolicy: null,
  toilets: 'yes',
  babyChanging: 'unknown',
  parking: 'yes',
  freeParking: 'unknown',
  pushchairSuitability: 'difficult',
  environment: 'outdoor',
  energyLevel: 'moderate',
  visitDurationMinutes: null,
  estimatedSpend: null,
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
};

function detail(facts: MatchableVenueFacts): VenueDetail {
  return {
    id: facts.placeId,
    name: facts.name,
    category: 'farm',
    latitude: 51.6,
    longitude: -0.3,
    driveMinutes: facts.driveMinutes,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: ['toilets', 'parking'],
    openingHours: '9-5',
    terrain: 'flat',
    bestAges: '5 – 12 years',
    description: 'A farm',
    enrichmentStatus: 'enriched',
    trustedFacts: facts,
  } as VenueDetail;
}

describe('familyUsesBuggy / familyNeedsStepFree', () => {
  it('reads the children, not a product name', () => {
    expect(familyUsesBuggy(FAMILIES.toddler)).toBe(true);
    expect(familyUsesBuggy(FAMILIES.baby)).toBe(true);
    expect(familyUsesBuggy(FAMILIES.older)).toBe(false);
    expect(familyUsesBuggy(FAMILIES.mixed)).toBe(true);
  });

  it('still honours a legacy pushchair name, so a profile saved before the question keeps working', () => {
    const legacy = family([{ ...OLDER, mobility: undefined }], { pushchair: 'Bugaboo Fox' });
    expect(familyUsesBuggy(legacy)).toBe(true);
    expect(familyUsesBuggy(family([OLDER], { pushchair: '   ' }))).toBe(false);
    expect(familyUsesBuggy(family([OLDER], { pushchair: null }))).toBe(false);
  });

  it('a carrier is not a buggy, and a mobility aid is neither a buggy nor implied by one', () => {
    expect(familyUsesBuggy(family([child('a', 'A', 0, ['carrier'], 3)]))).toBe(false);
    expect(familyUsesBuggy(family([WHEELCHAIR_KID]))).toBe(false);
    expect(familyNeedsStepFree(FAMILIES.toddler)).toBe(false);
    expect(familyNeedsStepFree(FAMILIES.mixed)).toBe(true);
  });

  it('ignores a parent whose member record carries stray mobility', () => {
    const parent: FamilyMember = { id: 'p', name: 'Sam', role: 'parent', dateOfBirth: '1990-01-01', age: 30, mobility: ['buggy'] };
    expect(familyUsesBuggy(family([parent, OLDER]))).toBe(false);
  });

  it('tolerates a missing profile or members', () => {
    expect(familyUsesBuggy(null)).toBe(false);
    expect(familyNeedsStepFree(undefined)).toBe(false);
    expect(familyUsesBuggy({ members: undefined as never, pushchair: null })).toBe(false);
  });
});

describe('per-child age verdicts', () => {
  it('judges each child separately against the published range', () => {
    const verdicts = childAgeVerdicts(FACTS, FAMILIES.toddlerAndOlder.members);
    expect(verdicts.map((v) => [v.name, v.side])).toEqual([
      ['Theo', 'below'],
      ['Mia', 'inside'],
    ]);
  });

  it('puts a baby below, an 8-year-old inside and a 14-year-old above a 5 to 12 range', () => {
    const teen = child('t', 'Jo', 14);
    const sides = childAgeVerdicts(FACTS, [BABY, OLDER, teen]).map((v) => v.side);
    expect(sides).toEqual(['below', 'inside', 'above']);
  });

  it('uses the same boundary as the ranking: 12 is inside "up to 12", 13 is not', () => {
    expect(childAgeVerdicts(FACTS, [child('a', 'A', 12)])[0].side).toBe('inside');
    expect(childAgeVerdicts(FACTS, [child('a', 'A', 13)])[0].side).toBe('above');
    expect(childAgeVerdicts(FACTS, [child('a', 'A', 5)])[0].side).toBe('inside');
    expect(childAgeVerdicts(FACTS, [child('a', 'A', 4)])[0].side).toBe('below');
  });

  it('produces nothing when the venue publishes no range', () => {
    expect(
      childAgeVerdicts({ minRecommendedAge: null, maxRecommendedAge: null }, FAMILIES.mixed.members),
    ).toEqual([]);
  });

  it('names who the range suits, and only them', () => {
    const verdicts = childAgeVerdicts(FACTS, FAMILIES.toddlerAndOlder.members);
    expect(suitsChildrenLine(FACTS, verdicts)).toBe('Good for Mia’s age (recommended for ages 5–12)');
    expect(suitsChildrenLine(FACTS, childAgeVerdicts(FACTS, FAMILIES.toddler.members))).toBeNull();
  });

  it('says "Suits Mia and Ada" when everyone is inside, and "Good for" when only some are', () => {
    const two = [OLDER, WHEELCHAIR_KID];
    expect(suitsChildrenLine(FACTS, childAgeVerdicts(FACTS, two))).toBe(
      'Suits Mia and Ada (recommended for ages 5–12)',
    );
  });

  it('cautions name the children outside the range, by side, and agree on is/are', () => {
    const teen = child('t', 'Jo', 14);
    const toddler2 = child('t2', 'Ben', 3);
    const verdicts = childAgeVerdicts(FACTS, [TODDLER, toddler2, OLDER, teen]);
    expect(outsideRangeCautions(FACTS, verdicts)).toEqual([
      'Recommended from age 5, so Theo and Ben are younger than that',
      'Recommended up to age 12, so Jo is older than that',
    ]);
  });

  it('never produces a half-named line: one unnamed child silences the named wording', () => {
    const unnamed = child('u', '', 2);
    const verdicts = childAgeVerdicts(FACTS, [unnamed, OLDER]);
    expect(outsideRangeCautions(FACTS, verdicts)).toEqual([]);
    expect(suitsChildrenLine(FACTS, childAgeVerdicts(FACTS, [OLDER, unnamed]))).toBe(
      'Good for Mia’s age (recommended for ages 5–12)',
    );
  });

  it('describes open-ended ranges honestly', () => {
    const open = { minRecommendedAge: 3, maxRecommendedAge: null };
    expect(suitsChildrenLine(open, childAgeVerdicts(open, [OLDER]))).toBe(
      'Good for Mia’s age (recommended for age 3 and up)',
    );
    const upTo = { minRecommendedAge: null, maxRecommendedAge: 4 };
    expect(outsideRangeCautions(upTo, childAgeVerdicts(upTo, [OLDER]))).toEqual([
      'Recommended up to age 4, so Mia is older than that',
    ]);
  });
});

describe('the family score speaks about these children', () => {
  const score = (profile: FamilyProfile, facts = FACTS) =>
    calculateFamilyScore(detail(facts), profile, { enrichmentStatus: 'enriched' });

  it('toddler + older child: suits Mia, cautions about Theo, in the same card', () => {
    const result = score(FAMILIES.toddlerAndOlder);
    expect(result.explanation).toContain('Good for Mia’s age (recommended for ages 5–12)');
    expect(result.cautions ?? []).toContain('Recommended from age 5, so Theo is younger than that');
  });

  it('a toddler alone gets no positive age line and a caution that names the toddler', () => {
    const result = score(FAMILIES.toddler);
    expect(result.explanation.some((line) => /Recommended|Good for|Suits/.test(line))).toBe(false);
    expect(result.cautions ?? []).toContain('Recommended from age 5, so Theo is younger than that');
  });

  it('a baby is cautioned by name, not lumped in as "your children"', () => {
    const result = score(FAMILIES.baby);
    expect(result.cautions ?? []).toContain('Recommended from age 5, so Poppy is younger than that');
    expect(result.cautions ?? []).not.toContain('Age range may not suit your children');
  });

  it('an older child alone gets only the positive line', () => {
    const result = score(FAMILIES.older);
    expect(result.explanation).toContain('Good for Mia’s age (recommended for ages 5–12)');
    expect((result.cautions ?? []).some((c) => /younger|older/.test(c))).toBe(false);
  });

  it('mixed family: the baby is below, Mia and Ada inside, each said honestly', () => {
    const result = score(FAMILIES.mixed);
    expect(result.explanation).toContain('Good for Mia and Ada (recommended for ages 5–12)');
    expect(result.cautions ?? []).toContain('Recommended from age 5, so Poppy is younger than that');
  });

  it('falls back to the generic wording when a child has no name, and only when everyone is outside', () => {
    const noNames = family([child('a', '', 2), child('b', '', 3)]);
    expect(score(noNames).cautions ?? []).toContain('Age range may not suit your children');
    const oneUnnamedInside = family([child('a', '', 2), OLDER]);
    expect(score(oneUnnamedInside).cautions ?? []).not.toContain('Age range may not suit your children');
  });

  it('claims nothing about age when the venue publishes no range', () => {
    const none = { ...FACTS, minRecommendedAge: null, maxRecommendedAge: null };
    const result = score(FAMILIES.toddlerAndOlder, none);
    expect(result.explanation.some((line) => /Good for|Suits|Recommended/.test(line))).toBe(false);
    expect((result.cautions ?? []).some((line) => /younger|older|Age range/.test(line))).toBe(false);
  });

  it('numeric ranking is unchanged by the wording: all inside outranks some outside outranks none', () => {
    const all = score(FAMILIES.older).factors.ageSuitability;
    const some = score(FAMILIES.toddlerAndOlder).factors.ageSuitability;
    const none = score(FAMILIES.toddler).factors.ageSuitability;
    expect(all).toBeGreaterThan(some);
    expect(some).toBeGreaterThan(none);
  });
});

describe('the buggy answer reaches scoring, the caution and the requests', () => {
  it('a difficult venue scores lower for a family whose toddler uses a buggy than for one that walks', () => {
    expect(scoreTrustedAccessibility(FACTS, FAMILIES.toddler)).toBe(32);
    expect(scoreTrustedAccessibility(FACTS, FAMILIES.older)).toBe(48);
  });

  it('raises the buggy caution from the child answer alone, with no pushchair name entered', () => {
    expect(score(FAMILIES.toddler).cautions ?? []).toContain('Pushchair access reviewed as difficult');
    expect(score(FAMILIES.older).cautions ?? []).not.toContain('Pushchair access reviewed as difficult');
  });

  function score(profile: FamilyProfile) {
    return calculateFamilyScore(detail(FACTS), profile, { enrichmentStatus: 'enriched' });
  }

  it('Home’s request carries the buggy preference and the baby-changing need from the profile', () => {
    const baby = buildProactiveDayRequest(FAMILIES.baby);
    expect(baby.hasPushchair).toBe(true);
    expect(baby.constraints.pushchair).toEqual({ strength: 'preferred', value: 'not_difficult' });
    expect(baby.constraints.babyChanging).toBeDefined();
    expect(baby.childAgeMonthsList).toEqual([8]);

    const older = buildProactiveDayRequest(FAMILIES.older);
    expect(older.hasPushchair).toBe(false);
    expect(older.constraints.pushchair).toBeUndefined();
    expect(older.constraints.babyChanging).toBeUndefined();
  });

  it('the planner family flags a buggy from the children', () => {
    const planning = planningFamilyFromProfile(
      { ...FAMILIES.toddler, homeLatitude: 51.6, homeLongitude: -0.3 },
    );
    expect(typeof planning).toBe('object');
    expect((planning as { pushchair: boolean }).pushchair).toBe(true);
    const walking = planningFamilyFromProfile({ ...FAMILIES.older, homeLatitude: 51.6, homeLongitude: -0.3 });
    expect((walking as { pushchair: boolean }).pushchair).toBe(false);
  });
});

describe('step-free: an honest unknown, only for families it matters to', () => {
  const venue: Venue = {
    id: 'fp-1', name: 'Ridge Farm', category: 'farm', latitude: 51.6, longitude: -0.3, driveMinutes: 12,
    imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] },
    enrichmentStatus: 'enriched', trustedFacts: FACTS, facilities: ['toilets'],
  } as unknown as Venue;

  it('appears for a child who uses a mobility aid and is never a score or a yes', () => {
    const withAid = personaliseVenue(venue, FAMILIES.mixed);
    expect(withAid.familyScore.cautions).toContain('Wheelchair and mobility-aid access isn’t confirmed here');
    const without = personaliseVenue(venue, FAMILIES.toddlerAndOlder);
    expect(without.familyScore.cautions).not.toContain('Wheelchair and mobility-aid access isn’t confirmed here');
  });

  it('a mobility aid does not turn on buggy scoring', () => {
    const aidOnly = family([WHEELCHAIR_KID]);
    expect(scoreTrustedAccessibility(FACTS, aidOnly)).toBe(48);
  });
});

describe('routines belong to a child and read by name', () => {
  const mia = OLDER;
  const theo = TODDLER;

  it('labels a nap and a feed by the child, and a baby has a feed where an older child has a meal', () => {
    expect(createNap(mia, '12:30').label).toBe('Mia’s nap');
    expect(createFeed(BABY, '07:00').label).toBe('Poppy’s feed');
    expect(createFeed(theo, '12:00').label).toBe('Theo’s meal');
  });

  it('the feed/meal line sits at one year: eleven months is a feed, one year is a meal', () => {
    expect(createFeed(child('e', 'Ivy', 0, [], 11), '07:00').label).toBe('Ivy’s feed');
    expect(createFeed(child('o', 'Ivy', 1), '07:00').label).toBe('Ivy’s meal');
  });

  it('resolves the label from the child’s current name, so a rename never leaves a stale label', () => {
    const nap = createNap(mia, '12:30');
    const renamed = family([{ ...mia, name: 'Maya' }], { routines: [nap] });
    expect(resolveRoutines(renamed)[0].label).toBe('Maya’s nap');
    expect(nap.label).toBe('Mia’s nap');
  });

  it('keeps a stored label when the owner is missing or unknown, and never invents a name', () => {
    const orphan = { id: 'r', label: 'Nap', kind: 'nap' as const, time: '13:00', durationMinutes: 60, atHome: true };
    expect(routineLabel(orphan, [mia])).toBe('Nap');
    expect(routineLabel({ ...orphan, childId: 'gone' }, [mia])).toBe('Nap');
    expect(routineLabel({ ...orphan, label: '' }, [])).toBe('nap');
  });

  it('naps and feeds are never said while browsing: no leave-by line, no clash, named or not', () => {
    // Before a plan exists, a place is judged on the family, not on the clock. The named routine lines ("Leave by 12:00
    // to be home in time for Theo's nap", "A visit today may run into Theo's nap time") assumed the family was leaving now.
    const profile = family([mia, theo], {
      routines: [createNap(mia, '14:00'), createNap(theo, '10:00'), createFeed(theo, '17:00')],
    });
    const venue = { ...detail(FACTS), id: 'v-routine', enrichmentStatus: 'enriched' } as unknown as Venue;
    const said = personaliseVenue(venue, profile);
    const text = JSON.stringify([said.familyScore.explanation, said.familyScore.cautions, said.familyMatch]);
    expect(text).not.toMatch(/Leave by|nap time|in time for|Theo’s nap|Mia’s nap|feed/);
  });

  it('the planner receives copies with no child’s name and no child id', () => {
    const nap = createNap(mia, '12:30');
    const profile = { ...family([mia], { routines: [nap] }), homeLatitude: 51.6, homeLongitude: -0.3 };
    const planning = planningFamilyFromProfile(profile) as { routines: Array<{ label: string; childId?: string; time: string }> };
    expect(planning.routines[0]).toMatchObject({ label: 'Nap', time: '12:30' });
    expect(planning.routines[0].childId).toBeUndefined();
    expect(JSON.stringify(planning)).not.toMatch(/Mia|child-/);
    planning.routines[0].label = 'changed';
    expect(profile.routines![0].label).toBe('Mia’s nap');
  });

  it('a routine saved before routines had an owner reaches the planner with the label the parent gave it', () => {
    const legacy = { id: 'r', label: 'Afternoon nap', kind: 'nap' as const, time: '14:00', durationMinutes: 60, atHome: true };
    const profile = { ...family([mia], { routines: [legacy] }), homeLatitude: 51.6, homeLongitude: -0.3 };
    const planning = planningFamilyFromProfile(profile) as { routines: Array<{ label: string }> };
    expect(planning.routines[0].label).toBe('Afternoon nap');
  });
});

describe('feed intervals expand to the day’s times', () => {
  it('every 4 hours from 07:00 is 07:00, 11:00, 15:00, 19:00', () => {
    expect(expandFeedInterval('07:00', 240)).toEqual(['07:00', '11:00', '15:00', '19:00']);
  });

  it('stops at 21:30 so an interval never schedules a night feed', () => {
    expect(expandFeedInterval('08:00', 180)).toEqual(['08:00', '11:00', '14:00', '17:00', '20:00']);
  });

  it('caps a runaway interval and refuses unusable input rather than guessing', () => {
    expect(expandFeedInterval('06:00', 30).length).toBe(8);
    expect(expandFeedInterval('25:00', 240)).toEqual([]);
    expect(expandFeedInterval('07:00', 10)).toEqual([]);
    expect(expandFeedInterval('07:00', Number.NaN)).toEqual([]);
    expect(expandFeedInterval('', 240)).toEqual([]);
  });
});

describe('profile receipt, suggestion and completion follow the new answers', () => {
  it('the receipt says pushchair for a buggy child, groups naps and counts a long run of feeds', () => {
    const profile = family([TODDLER, OLDER], {
      routines: [createNap(TODDLER, '12:30'), createNap(TODDLER, '15:30'), ...['07:00', '11:00', '15:00', '19:00'].map((t) => createFeed(TODDLER, t))],
    });
    expect(profileReceipt(profile)).toBe('Using ages 2 and 8, pushchair, 12:30 and 15:30 naps, 4 feeds and max 30 min drive');
  });

  it('names no child: the receipt is read on a shared screen', () => {
    const profile = family([TODDLER], { routines: [createNap(TODDLER, '12:30')] });
    expect(profileReceipt(profile)).not.toMatch(/Theo/);
  });

  it('asks for a legacy child’s birthday first, by name, and never invents one', () => {
    const legacy = family([{ ...OLDER, dobKnown: false }]);
    expect(getProfileSuggestion(legacy)).toEqual({
      message: 'Add Mia’s birthday so Mia’s age stays up to date',
      field: 'children',
    });
  });

  it('only suggests a pushchair make to a family that uses a buggy', () => {
    const base = { memberships: [{ id: 'm' }] as never, vehicle: 'Car' };
    const walking = family([OLDER], base);
    expect(getProfileSuggestion(walking)?.field).not.toBe('pushchair');
    const buggy = family([TODDLER], base);
    expect(getProfileSuggestion(buggy)?.field).toBe('pushchair');
  });

  it('completion counts real birthdays, not a pushchair name', () => {
    const known = computeCompletionPercent(family([OLDER]));
    const legacy = computeCompletionPercent(family([{ ...OLDER, dobKnown: false }]));
    expect(known).toBeGreaterThan(legacy);
  });
});
