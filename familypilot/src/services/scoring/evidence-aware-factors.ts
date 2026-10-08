import { activityEvidenceFor, evidenceCovers } from '@/src/services/matching/activity-evidence';
import { childAgeMonths, evaluateAgeRecommendation } from '@/src/services/matching/age-suitability';
import type { FamilyProfile, FamilyScoreFactors } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import { familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';

/**
 * Family Fit, read from what is CONFIRMED about this household's needs and this venue, and from nothing else.
 *
 * The principles, each one a way the current score departs from them:
 *
 *   1. Unknown is not unsuitable. Every factor has one neutral value for "nobody has confirmed this" (75 for age, 70 for
 *      access and facilities), the same for every venue. Evidence moves a venue up or down from there; silence never does.
 *      (Today a must-have that is merely unconfirmed is called "Missing" and caps the facilities factor at 35.)
 *   2. A venue is not rewarded for how much was extracted about it. Only the facts that bear on THIS household count: a
 *      buggy rating counts for a household that uses a buggy, a wheelchair claim for one with a wheelchair user, and a café, a
 *      free-parking claim or a playground for nobody until someone states they matter. (Today a "good" pushchair rating
 *      lifts a household of two ten-year-olds, and every extra confirmed facility lifts every household.)
 *   3. Age suitability comes only from the venue's own words: its recommended range, or a reviewed permanent provision on
 *      its own pages for the child's age. Never from the category, never from marketing copy, never from a programme on set
 *      days. A venue that excludes a child by its own range is a confirmed incompatibility for that child.
 *   4. Practical logistics and household requirements are separate from activity: logistics inform access and facilities and
 *      can refuse (see hard-conflicts.ts); they never make a child "suited".
 *
 * The weights are NOT changed: age .25, accessibility .15, distance .15, budget .10, facilities .15. A factor with nothing to
 * say about this household is left out of the blend (blend.ts), exactly as an unstated budget already is.
 */

export const UNKNOWN_AGE = 75;
export const UNKNOWN_PRACTICAL = 70;
const RANGE_COVERS = 96;
const PROVISION_COVERS = 88;
const RANGE_EXCLUDES = 42;

export type AgeBasis = 'range' | 'provision' | 'range_excludes' | 'unknown';

export interface ChildAgeFit {
  name: string;
  basis: AgeBasis;
  score: number;
  /** The provision's own label ("Under-7s playground") when that is the basis. */
  via?: string;
}

export interface FitBasis {
  /** Per child, why the age factor is what it is. */
  age: ChildAgeFit[];
  /** Factors that had nothing to say about this household and were left out of the blend. */
  omitted: Array<'ageSuitability' | 'accessibility' | 'facilitiesMatch'>;
  /** Practical needs of this household that were scored, with the venue's state for each. */
  needs: Array<{ need: string; state: 'yes' | 'no' | 'unknown'; stated: boolean }>;
}

type Tri = 'yes' | 'no' | 'unknown' | undefined;
const tri = (v: Tri): 'yes' | 'no' | 'unknown' => (v === 'yes' || v === 'no' ? v : 'unknown');

function ageFactor(
  venueId: string | undefined,
  facts: MatchableVenueFacts | undefined,
  profile: FamilyProfile,
  now: Date,
): { value: number | undefined; per: ChildAgeFit[] } {
  const kids = profile.members.filter((m) => m.role === 'child');
  if (kids.length === 0) return { value: undefined, per: [] };
  const provisions = venueId ? activityEvidenceFor(venueId, now).filter((e) => e.kind === 'provision') : [];
  const per = kids.map((kid): ChildAgeFit => {
    const months = childAgeMonths(kid);
    const range = facts ? evaluateAgeRecommendation(facts, [months]) : 'unknown';
    if (range === 'all') return { name: kid.name, basis: 'range', score: RANGE_COVERS };
    if (range === 'none') return { name: kid.name, basis: 'range_excludes', score: RANGE_EXCLUDES };
    const provision = provisions.find((e) => evidenceCovers(e, months));
    if (provision) return { name: kid.name, basis: 'provision', score: PROVISION_COVERS, via: provision.label };
    return { name: kid.name, basis: 'unknown', score: UNKNOWN_AGE };
  });
  return { value: Math.round(per.reduce((sum, c) => sum + c.score, 0) / per.length), per };
}

const BUGGY_RATING: Record<string, number> = { excellent: 98, good: 90, mixed: 68, difficult: 32 };

function accessFactor(facts: MatchableVenueFacts | undefined, profile: FamilyProfile): number | undefined {
  const parts: number[] = [];
  if (familyUsesBuggy(profile)) {
    parts.push(BUGGY_RATING[facts?.pushchairSuitability ?? ''] ?? UNKNOWN_PRACTICAL);
  }
  if (familyNeedsStepFree(profile)) {
    const w = tri(facts?.wheelchairAccessible);
    parts.push(w === 'yes' ? 92 : w === 'no' ? 25 : UNKNOWN_PRACTICAL);
  }
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : undefined;
}

function facilityNeeds(facts: MatchableVenueFacts | undefined, profile: FamilyProfile) {
  const kids = profile.members.filter((m) => m.role === 'child');
  const youngest = kids.map((k) => k.age).sort((a, b) => a - b)[0];
  const stated = new Set(profile.mustHaveFacilities ?? []);
  const needs: Array<{ need: string; state: 'yes' | 'no' | 'unknown'; stated: boolean; weight: number }> = [];
  if (kids.length > 0 || stated.has('toilets')) {
    needs.push({ need: 'toilets', state: tri(facts?.toilets), stated: stated.has('toilets'), weight: stated.has('toilets') ? 1.5 : 1 });
  }
  if ((youngest != null && youngest <= 3) || stated.has('baby_changing')) {
    needs.push({ need: 'baby changing', state: tri(facts?.babyChanging), stated: stated.has('baby_changing'), weight: stated.has('baby_changing') ? 1.8 : 1.2 });
  }
  if (stated.has('parking')) {
    // "No parking" says nothing about disabled bays: for a party with a step-free need it is unchecked, not absent
    // (see parkingFor in day-request-matcher.ts).
    const general = tri(facts?.parking);
    needs.push({ need: 'parking', state: familyNeedsStepFree(profile) && general === 'no' ? 'unknown' : general, stated: true, weight: 1.5 });
  }
  return needs;
}

function facilitiesFactor(needs: ReturnType<typeof facilityNeeds>): number | undefined {
  if (needs.length === 0) return undefined;
  let total = 0;
  let earned = 0;
  for (const n of needs) {
    total += n.weight;
    earned += n.weight * (n.state === 'yes' ? 95 : n.state === 'no' ? 20 : UNKNOWN_PRACTICAL);
  }
  const raw = Math.round(earned / total);
  // Only a CONFIRMED absence of something the household said it always needs caps the factor. Not-yet-confirmed does not.
  const confirmedMissing = needs.some((n) => n.stated && n.state === 'no');
  return confirmedMissing ? Math.min(raw, 35) : raw;
}

export function evidenceAwareFactors(input: {
  venueId?: string;
  facts?: MatchableVenueFacts;
  profile: FamilyProfile;
  distance: number;
  budgetFit?: number;
  now?: Date;
}): { factors: FamilyScoreFactors; basis: FitBasis } {
  const now = input.now ?? new Date();
  const age = ageFactor(input.venueId, input.facts, input.profile, now);
  const access = accessFactor(input.facts, input.profile);
  const needs = facilityNeeds(input.facts, input.profile);
  const facilities = facilitiesFactor(needs);
  const omitted: FitBasis['omitted'] = [];
  if (age.value === undefined) omitted.push('ageSuitability');
  if (access === undefined) omitted.push('accessibility');
  if (facilities === undefined) omitted.push('facilitiesMatch');
  return {
    factors: {
      ageSuitability: age.value ?? Number.NaN,
      accessibility: access ?? Number.NaN,
      distance: input.distance,
      ...(input.budgetFit !== undefined ? { budgetFit: input.budgetFit } : {}),
      facilitiesMatch: facilities ?? Number.NaN,
    },
    basis: { age: age.per, omitted, needs: needs.map(({ need, state, stated }) => ({ need, state, stated })) },
  };
}
