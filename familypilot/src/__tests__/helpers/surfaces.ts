import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { PROPOSED_POLICY } from '@/src/services/scoring/fit-policy';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import type { FamilyMember, FamilyProfile, Venue, VenueDetail } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import type { StopRequest } from '@/src/types/day-sequence';

/** One household, one venue, asked three ways: the planner's own sequencer, the Home/Explore card, and the order lists use. */
export const NOW = new Date('2026-10-08T12:00:00Z');

export const adult: FamilyMember = { id: 'p', name: 'P', role: 'parent', dateOfBirth: '', age: 36 };
export const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, mobility: ['walks'], ...extra,
});
export const profile = (members: FamilyMember[], extra: Partial<FamilyProfile> = {}): FamilyProfile => ({
  id: 'f', parentName: 'P', members: [adult, ...members], homeLocation: 'Camden', homeLatitude: 51.539, homeLongitude: -0.142,
  completionPercent: 90, mustHaveFacilities: [], ...extra,
} as FamilyProfile);

export const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'museum', driveMinutes: 20, enrichmentStatus: 'verified', minRecommendedAge: null,
  maxRecommendedAge: null, venueAgePolicy: null, toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', freeParking: 'unknown',
  cafe: 'unknown', playground: 'unknown', wheelchairAccessible: 'unknown', accessibleToilet: 'unknown', pushchairSuitability: 'unknown',
  environment: 'indoor', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
  ...over,
} as MatchableVenueFacts);

export const detail = (f: MatchableVenueFacts, id = 'fp-x'): VenueDetail => ({
  id, name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
  familyScore: { score: 0, factors: {} as never, explanation: [] }, photos: [], facilities: [], openingHours: '', description: '',
  enrichmentStatus: 'enriched', trustedFacts: f,
} as unknown as VenueDetail);


export const plannerRefuses = (f: MatchableVenueFacts, p: FamilyProfile): boolean => {
  const family = planningFamilyFromProfile(p);
  if (typeof family === 'string') throw new Error(family);
  const near = { ...family, maxDriveMinutes: undefined };
  const request: StopRequest = { placeId: 'fp-x', name: 'Test Place', role: 'activity', anchor: true, dwellMinutes: 90, facts: { ...f, driveMinutes: 10 } };
  const matrix = { legs: { [homeKey(near.id)]: { [stopKey('fp-x')]: { minutes: 10, source: 'estimated' as const } }, [stopKey('fp-x')]: { [homeKey(near.id)]: { minutes: 10, source: 'estimated' as const } } } };
  const result = sequenceDay([request], [near], matrix, { date: '2026-11-10', leaveAt: '09:00', arriveAt: '10:30', returnBy: '', bufferMinutes: 15, environment: 'either' } as SequenceOptions, NOW);
  if (result.ok) return false;
  const failure = result.failure.reason === 'no-feasible-sequence' && result.failure.nearest ? result.failure.nearest : result.failure;
  return failure.reason === 'requirement-unmet';
};
export const home = (f: MatchableVenueFacts, p: FamilyProfile) => {
  const v = personaliseVenue({ id: 'fp-x', name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 10, imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: [], trustedFacts: f } as unknown as Venue, p, undefined, PROPOSED_POLICY);
  return { conflict: (v.fitConflicts?.length ?? 0) > 0, poor: v.familyMatch?.verdict === 'poor' };
};

