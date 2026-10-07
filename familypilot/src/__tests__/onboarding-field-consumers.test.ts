import { describe, expect, it } from 'vitest';

import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { budgetFitReason } from '@/src/utils/budget-copy';
import { familyTitle } from '@/src/utils/family-title';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { DraftChild, blankChild, buildOnboardingProfile, newNap } from '@/src/utils/onboarding-draft';
import { profileReceipt } from '@/src/utils/profile-receipt';
import { FamilyProfile, Venue, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * Every field onboarding collects must change something a parent can see or the app can use. This is the
 * trace, as a test: for each answer, two profiles that differ in that answer alone, and the output that
 * differs. If a future change leaves a question collecting an answer nothing reads, its row fails.
 */

const NOW = new Date(2026, 5, 15, 9, 0);
const MORNING = new Date(2026, 5, 15, 9, 0);

const FACTS = {
  placeId: 'p1', name: 'Park', category: 'park', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: 3, maxRecommendedAge: 9, venueAgePolicy: null, toilets: 'yes', babyChanging: 'unknown',
  parking: 'yes', freeParking: 'unknown', pushchairSuitability: 'difficult', environment: 'outdoor', energyLevel: 'moderate',
  visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
} as MatchableVenueFacts;

const VENUE = {
  id: 'p1', name: 'Park', category: 'park', latitude: 51.6, longitude: -0.3, driveMinutes: 20, imageUrl: '',
  photos: [], facilities: ['toilets'], openingHours: '', description: '', enrichmentStatus: 'enriched',
  trustedFacts: FACTS, familyScore: { score: 0, factors: {}, explanation: [] },
} as unknown as VenueDetail;

function child(over: Partial<DraftChild> = {}): DraftChild {
  return { ...blankChild(), id: 'c', name: 'Mia', day: '20', month: '3', year: '2024', ...over };
}
const family = (over: Partial<DraftChild> = {}, parentName = 'Sam', homeLocation = 'Bushey'): FamilyProfile =>
  buildOnboardingProfile({ parentName, homeLocation, home: { latitude: 51.6, longitude: -0.3 }, children: [child(over)], now: NOW });

const lines = (p: FamilyProfile) => {
  const score = calculateFamilyScore(VENUE, p, { enrichmentStatus: 'enriched' });
  return JSON.stringify([score.explanation, score.cautions, score.factors]);
};
const request = (p: FamilyProfile) => JSON.stringify(buildProactiveDayRequest(p, null, MORNING));

describe('each onboarding answer changes something', () => {
  it('the child’s name appears in what Family Fit says about them', () => {
    expect(lines(family({ name: 'Mia' }))).not.toBe(lines(family({ name: 'Ada' })));
    expect(lines(family({ name: 'Mia' }))).toContain('Mia');
  });

  it('the date of birth changes the age Home’s request is built from, and the score', () => {
    const young = family({ day: '10', month: '1', year: '2026' });
    const older = family({ day: '10', month: '1', year: '2018' });
    expect(request(young)).not.toBe(request(older));
    expect(lines(young)).not.toBe(lines(older));
  });

  it('a buggy answer changes the accessibility score, the caution and the planner flag', () => {
    const walks = family({ mobility: ['walks'] });
    const buggy = family({ mobility: ['walks', 'buggy'] });
    expect(lines(walks)).not.toBe(lines(buggy));
    expect(request(walks)).not.toBe(request(buggy));
    expect(JSON.stringify(planningFamilyFromProfile({ ...walks, homeLatitude: 51.6, homeLongitude: -0.3 }))).not.toBe(
      JSON.stringify(planningFamilyFromProfile({ ...buggy, homeLatitude: 51.6, homeLongitude: -0.3 })),
    );
  });

  it('a mobility-aid answer adds the wheelchair caution on Venue Detail and nothing else', () => {
    const venue = { ...VENUE, id: 'p1' } as unknown as Venue;
    const plain = personaliseVenue(venue, family({ mobility: ['walks'] }));
    const aid = personaliseVenue(venue, family({ mobility: ['mobility-aid'] }));
    expect(aid.familyScore.cautions ?? []).toContain('Wheelchair and mobility-aid access isn’t confirmed here');
    expect(plain.familyScore.cautions ?? []).not.toContain('Wheelchair and mobility-aid access isn’t confirmed here');
  });

  it('a nap time reaches the planner, where a chosen day is worked out around it', () => {
    const early = family({ naps: [{ ...newNap(), time: '12:00' }] });
    const late = family({ naps: [{ ...newNap(), time: '14:00' }] });
    const naps = (p: FamilyProfile) => (planningFamilyFromProfile({ ...p, homeLatitude: 51.6, homeLongitude: -0.3 }) as { routines: { kind: string; time: string }[] }).routines.filter((r) => r.kind === 'nap').map((r) => r.time);
    expect(naps(early)).toEqual(['12:00']);
    expect(naps(late)).toEqual(['14:00']);
  });

  it('a nap time never changes how a place is judged or ranked while browsing', () => {
    const venue = { ...VENUE, id: 'p1' } as unknown as Venue;
    const early = personaliseVenue(venue, family({ naps: [{ ...newNap(), time: '12:00' }] }));
    const none = personaliseVenue(venue, family({ naps: [] }));
    expect(early.familyScore.score).toBe(none.familyScore.score);
    expect(early.familyScore.explanation).toEqual(none.familyScore.explanation);
    expect(early.familyMatch?.headline).toBe(none.familyMatch?.headline);
  });

  it('feed times reach the planner and the receipt', () => {
    const none = family({ feedMode: 'none' });
    const times = family({ feedMode: 'times', feedTimes: ['12:00', '17:00'] });
    expect(profileReceipt(none)).not.toBe(profileReceipt(times));
    expect(profileReceipt(times)).toContain('12:00 and 17:00 feeds');
    const planner = planningFamilyFromProfile({ ...times, homeLatitude: 51.6, homeLongitude: -0.3 }) as { routines: unknown[] };
    expect(planner.routines).toHaveLength(2);
  });

  it('the parent’s name and the home area are used too', () => {
    expect(familyTitle('Sam')).not.toBe(familyTitle('Jo'));
    expect(request(family({}, 'Sam', 'Bushey'))).not.toBe(request(family({}, 'Sam', 'Watford')));
  });
});

describe('what is not asked is not claimed', () => {
  it('a family that never chose a budget is not told the venue is within "your usual" one', () => {
    const p = family();
    const heuristic = { ...VENUE, trustedFacts: undefined, familyScore: { score: 0, factors: {}, explanation: [] } } as unknown as VenueDetail;
    const score = calculateFamilyScore(heuristic, p, { enrichmentStatus: 'enriched' });
    expect(score.explanation.join(' ')).not.toMatch(/your usual/i);
    expect(budgetFitReason('moderate')).toBe('Fits a moderate spend');
    expect(budgetFitReason('budget')).toBe('Fits a budget-friendly spend');
    expect(budgetFitReason('premium')).toBe('Fits a premium spend');
  });

  it('the drive caution says "the drive we’re using", not "your usual"', () => {
    const venue = { ...VENUE, driveMinutes: 50 } as unknown as Venue;
    // Only a limit the family stated: a new profile has none, so nothing is "further than" anything.
    const stated = personaliseVenue({ ...venue, driveMinutes: 50 }, { ...family(), maxDriveMinutes: 30 }).familyScore.cautions ?? [];
    expect(stated.join(' ')).toContain('Further than the 30 min drive we’re using');
    expect(stated.join(' ')).not.toMatch(/your usual/i);
    const unstated = personaliseVenue({ ...venue, driveMinutes: 50 }, family()).familyScore.cautions ?? [];
    expect(unstated.join(' ')).not.toMatch(/drive|further|over the/i);
  });
});
