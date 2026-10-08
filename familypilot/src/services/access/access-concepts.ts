import type { FamilyProfile } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import { familyNeedsStepFree } from '@/src/utils/family-mobility';

/**
 * The access and getting-there concepts, each defined ONCE, each answered only from its own evidence.
 *
 * Before this file "parking" stood in for three different questions (is there a car park, are there Blue Badge bays, can a
 * disabled visitor get in), and a patch in three places guessed which was meant. A family with a mobility aid was read as
 * needing parking, and a venue with no car park was read as possibly inaccessible. Neither is true, and both led to a wrong
 * answer: a Natural History Museum that publishes Blue Badge spaces was "missing parking" for a wheelchair family that never
 * asked for any.
 *
 * Rules, all pinned by tests:
 *   1. Each concept is read from ITS OWN claim. No concept is derived from another.
 *   2. A household needs a concept only because it SAID so (a must-have, a transport need) or because the answer it gave IS
 *      that need (a mobility aid is a step-free need). A mobility aid is not a parking need; a buggy is not a step-free need;
 *      a car is not a parking need.
 *   3. Unknown stays unknown: only a CONFIRMED "no" for a REQUIRED need is a conflict.
 *   4. The same functions answer Home, Explore, Venue Detail and the planner. Nothing else decides.
 */
export type AccessConcept =
  | 'general_parking'
  | 'blue_badge_parking'
  | 'step_free_access'
  | 'wheelchair_access'
  | 'pushchair_access'
  | 'step_free_station'
  | 'public_transport';

export type Tri = 'yes' | 'no' | 'unknown';
const tri = (value: unknown): Tri => (value === 'yes' ? 'yes' : value === 'no' ? 'no' : 'unknown');

export interface ConceptDefinition {
  label: string;
  /** The claim this concept is read from. */
  claimKey: string;
  /** What it means, in the words a reviewer applies. */
  means: string;
  /** What it is explicitly NOT read from, and never stands in for. */
  notInferredFrom: readonly string[];
}

export const ACCESS_CONCEPTS: Readonly<Record<AccessConcept, ConceptDefinition>> = Object.freeze({
  general_parking: {
    label: 'Parking',
    claimKey: 'familyFacilities.parking',
    means: 'A car park the venue provides or states for visitors.',
    notInferredFrom: ['blue_badge_parking', 'step_free_access', 'wheelchair_access', 'a mobility aid', 'a vehicle', 'a buggy'],
  },
  blue_badge_parking: {
    label: 'Blue Badge parking',
    claimKey: 'accessibility.accessibleParking',
    means: 'Disabled bays, or parking for Blue Badge holders, at or next to the venue, as the venue states.',
    notInferredFrom: ['general_parking', 'step_free_access', 'wheelchair_access', 'a mobility aid'],
  },
  step_free_access: {
    label: 'Step-free access',
    claimKey: 'accessibility.stepFreeEntrance',
    means: 'The main visit can be made without steps: a level or ramped entrance and a route to what the visit is for.',
    notInferredFrom: ['general_parking', 'pushchair_access', 'a buggy rating'],
  },
  wheelchair_access: {
    label: 'Wheelchair access',
    claimKey: 'accessibility.wheelchairAccessible',
    means: 'The venue says it can be visited by a wheelchair user.',
    notInferredFrom: ['general_parking', 'blue_badge_parking', 'pushchair_access'],
  },
  pushchair_access: {
    label: 'Pushchair access',
    claimKey: 'pushchairSuitability',
    means: 'How easily a buggy gets around, and the venue’s own pushchair rules.',
    notInferredFrom: ['wheelchair_access', 'step_free_access', 'general_parking'],
  },
  step_free_station: {
    label: 'Step-free station',
    claimKey: 'transport.stepFreeStation',
    means: 'The station the venue directs visitors to has step-free access.',
    notInferredFrom: ['general_parking', 'wheelchair_access', 'step_free_access'],
  },
  public_transport: {
    label: 'Public transport',
    claimKey: 'transport.publicTransport',
    means: 'The venue says it can be reached by train, tube or bus.',
    notInferredFrom: ['general_parking', 'a vehicle'],
  },
});

/** What the venue's evidence says about every concept. Each value comes from one field and one field only. */
export function venueAccess(facts: Partial<MatchableVenueFacts> | null | undefined): Record<AccessConcept, Tri> {
  const p = facts?.pushchairSuitability;
  return {
    general_parking: tri(facts?.parking),
    blue_badge_parking: tri(facts?.blueBadgeParking),
    step_free_access: tri(facts?.stepFreeAccess),
    wheelchair_access: tri(facts?.wheelchairAccessible),
    // A rating of the ground and the venue's rules: "good" is a yes, "difficult" a no, anything between is not a verdict.
    pushchair_access: p === 'good' || p === 'excellent' ? 'yes' : p === 'difficult' ? 'no' : 'unknown',
    step_free_station: tri(facts?.stepFreeStation),
    public_transport: tri(facts?.publicTransport),
  };
}

export type NeedStrength = 'required' | 'preferred';
export type NeedSource = 'must_have' | 'mobility_answer' | 'transport_need';

export interface AccessNeed {
  concept: AccessConcept;
  strength: NeedStrength;
  /** Where the household said so. */
  source: NeedSource;
}

/**
 * What THIS household needs, and nothing it did not say. The buggy and pushchair-rule handling stays where it is (it needs
 * the venue's rules); this lists the access needs that are plain facts.
 */
export function householdAccessNeeds(profile: Pick<FamilyProfile, 'members' | 'mustHaveFacilities' | 'transportNeeds'> | null | undefined): AccessNeed[] {
  if (!profile) return [];
  const needs: AccessNeed[] = [];
  const stated = new Set(profile.mustHaveFacilities ?? []);
  if (stated.has('parking')) needs.push({ concept: 'general_parking', strength: 'required', source: 'must_have' });
  if (stated.has('blue_badge_parking')) needs.push({ concept: 'blue_badge_parking', strength: 'required', source: 'must_have' });
  // The answer "wheelchair or mobility aid" IS a step-free need. It is not a parking need.
  if (familyNeedsStepFree(profile)) needs.push({ concept: 'step_free_access', strength: 'required', source: 'mobility_answer' });
  const t = profile.transportNeeds;
  if (t?.stepFreeStation) needs.push({ concept: 'step_free_station', strength: t.stepFreeStation, source: 'transport_need' });
  if (t?.publicTransport) needs.push({ concept: 'public_transport', strength: t.publicTransport, source: 'transport_need' });
  return needs;
}

export type NeedOutcome = 'met' | 'unmet' | 'unknown';

/**
 * Whether the venue meets a step-free need. Two of the venue's own claims speak to it, and only those: a step-free entrance
 * claim and a wheelchair-access claim. Either saying yes meets it; either saying no, with nothing saying yes, fails it; a yes
 * and a no together is a disagreement, which is unknown (nobody picks a side). Parking, a buggy rating and the category are
 * not evidence.
 */
export function stepFreeOutcome(venue: Pick<Record<AccessConcept, Tri>, 'step_free_access' | 'wheelchair_access'>): NeedOutcome {
  const readings = [venue.step_free_access, venue.wheelchair_access];
  const yes = readings.includes('yes');
  const no = readings.includes('no');
  if (yes && no) return 'unknown';
  if (yes) return 'met';
  if (no) return 'unmet';
  return 'unknown';
}

/** Whether the venue meets one stated need. */
export function needOutcome(need: AccessNeed, venue: Record<AccessConcept, Tri>): NeedOutcome {
  if (need.concept === 'step_free_access') return stepFreeOutcome(venue);
  const reading = venue[need.concept];
  return reading === 'yes' ? 'met' : reading === 'no' ? 'unmet' : 'unknown';
}

/** The matcher's field name for each concept, so a conflict is named the same way on every surface. */
export const ACCESS_FIELD: Readonly<Record<AccessConcept, string>> = Object.freeze({
  general_parking: 'familyFacilities.parking',
  blue_badge_parking: 'accessibility.accessibleParking',
  step_free_access: 'accessibility.wheelchairAccessible',
  wheelchair_access: 'accessibility.wheelchairAccessible',
  pushchair_access: 'pushchairSuitability',
  step_free_station: 'transport.stepFreeStation',
  public_transport: 'transport.publicTransport',
});

/** A parent-facing name for a need, used by "you said you need…" sentences. */
export const ACCESS_NEED_LABEL: Readonly<Record<AccessConcept, string>> = Object.freeze({
  general_parking: 'parking',
  blue_badge_parking: 'Blue Badge parking',
  step_free_access: 'wheelchair and step-free access',
  wheelchair_access: 'wheelchair access',
  pushchair_access: 'pushchair access',
  step_free_station: 'a step-free station',
  public_transport: 'public transport',
});

/**
 * Every REQUIRED access need the venue is confirmed not to meet, for one household. The one list the Home and Explore conflict
 * order, the Venue Detail "you said you need" lines and the planner's refusal all agree with, because the matcher builds its
 * constraints from `householdAccessNeeds` and answers them with `needOutcome`.
 */
export function confirmedAccessConflicts(
  facts: Partial<MatchableVenueFacts> | null | undefined,
  profile: Parameters<typeof householdAccessNeeds>[0],
): AccessNeed[] {
  const venue = venueAccess(facts);
  return householdAccessNeeds(profile).filter((need) => need.strength === 'required' && needOutcome(need, venue) === 'unmet');
}
