import { FamilyMember } from '@/src/types';
import { FactMatchOutcome, MatchableVenueFacts } from '@/src/types/day-request';

/**
 * Recommended ages, evaluated per child.
 *
 * `minRecommendedAge` / `maxRecommendedAge` mean what they say: the ages a venue *suggests* it
 * suits. They are not admission rules. A three-year-old at a venue recommended for 5+ is a
 * judgement call for the parent, not a locked door, so nothing in this module may remove a venue
 * from consideration. It reports how well a recommendation lines up with the children, and the
 * callers use that for ranking and explanation only.
 *
 * A venue-level prohibition — "under 4s not admitted" — is a different fact with a different
 * source and a different consequence. It lives in `age-admission.ts` (P0-B2) and is the only age
 * fact that can make a venue ineligible. Nothing in THIS module may ever exclude.
 */

/**
 * How many of the children fall inside the recommended range.
 *
 * Deliberately its own type rather than a `partial` member added to `FactMatchOutcome`: only age
 * has a meaningful "some of them" state, and widening the generic outcome would force every
 * unrelated constraint evaluator to answer a question it has no answer to.
 */
export type AgeRecommendationFit = 'all' | 'some' | 'none' | 'unknown';

/** Months in a year, named so the interval arithmetic below reads as intent rather than magic. */
const MONTHS_PER_YEAR = 12;

/**
 * A child's age in months, keeping babies distinguishable.
 *
 * `FamilyMember.age` rounds down, so every baby under one is `0` and an eleven-month-old is
 * indistinguishable from a two-month-old — which matters precisely where family suitability is
 * most sensitive. `ageMonths` already carries that precision for under-ones; this reads it
 * without touching how profiles are stored or entered.
 */
export function childAgeMonths(member: Pick<FamilyMember, 'age' | 'ageMonths'>): number {
  if (member.age === 0 && member.ageMonths != null) return member.ageMonths;
  return member.age * MONTHS_PER_YEAR;
}

/** Every child in a profile, in months. */
export function childAgesInMonths(members: FamilyMember[]): number[] {
  return members.filter((member) => member.role === 'child').map(childAgeMonths);
}

/** Whole years (legacy `DayRequest.childAges`) widened to months. */
export function yearsToMonths(ages: number[]): number[] {
  return ages.map((age) => age * MONTHS_PER_YEAR);
}

export interface RecommendedMonthInterval {
  /** First month that is inside the recommendation. */
  minMonthsInclusive: number | null;
  /** First month that is *outside* it — the bound is exclusive. */
  maxMonthsExclusive: number | null;
}

/**
 * Turn a whole-year recommendation into the half-open month interval the evaluator works in.
 *
 * "Recommended up to age 8" means a child is suited right up to their ninth birthday, so the
 * upper bound is the first month of age 9 and is exclusive: 107 months is inside, 108 is not.
 * Storing it exclusively avoids the off-by-one that an inclusive bound invites, and it is the
 * same interval shape a month-precise recommendation in B2 will use, so the evaluator does not
 * have to change when real data arrives.
 */
export function recommendedMonthInterval(
  facts: Pick<MatchableVenueFacts, 'minRecommendedAge' | 'maxRecommendedAge'>,
): RecommendedMonthInterval {
  const { minRecommendedAge: min, maxRecommendedAge: max } = facts;
  return {
    minMonthsInclusive: min == null ? null : min * MONTHS_PER_YEAR,
    maxMonthsExclusive: max == null ? null : (max + 1) * MONTHS_PER_YEAR,
  };
}

function isInside(months: number, interval: RecommendedMonthInterval): boolean {
  if (interval.minMonthsInclusive != null && months < interval.minMonthsInclusive) return false;
  if (interval.maxMonthsExclusive != null && months >= interval.maxMonthsExclusive) return false;
  return true;
}

/**
 * Evaluate the recommendation against each child independently.
 *
 * Evaluating the *span* of the children instead — youngest against the upper bound, oldest
 * against the lower — let one fitting child vouch for the rest: a 2-year-old and an 8-year-old
 * against a 5–12 recommendation came back fully suitable, because the 8-year-old is inside it
 * and the span straddles the range. The 2-year-old's mismatch simply disappeared. Each child is
 * now asked separately and the answers are counted.
 */
export function evaluateAgeRecommendation(
  facts: Pick<MatchableVenueFacts, 'minRecommendedAge' | 'maxRecommendedAge'>,
  childMonths: number[],
): AgeRecommendationFit {
  if (childMonths.length === 0) return 'unknown';

  const interval = recommendedMonthInterval(facts);
  if (interval.minMonthsInclusive == null && interval.maxMonthsExclusive == null) return 'unknown';

  const inside = childMonths.filter((months) => isInside(months, interval)).length;
  if (inside === childMonths.length) return 'all';
  if (inside === 0) return 'none';
  return 'some';
}

/**
 * Project the age-specific result onto the generic outcome the ranking tally understands.
 *
 * Lossy on purpose — `some` and `none` both read as `unsuitable` to a tally that has no third
 * state. The richer value stays available to callers that can say something better with it, and
 * this projection is only ever applied at `preferred` strength, so neither value can exclude a
 * venue. See `AGE_RECOMMENDATION_STRENGTH`.
 */
export function ageRecommendationToOutcome(fit: AgeRecommendationFit): FactMatchOutcome {
  switch (fit) {
    case 'all':
      return 'suitable';
    case 'some':
    case 'none':
      return 'unsuitable';
    default:
      return 'unknown';
  }
}

/**
 * The only strength a recommended-age constraint may be evaluated at.
 *
 * `required` would let `applyConstraint` fail the venue closed on `unsuitable` *or* `unknown` —
 * turning both "we suggest other ages" and "nobody published a suggestion" into a rejection.
 * Producers are normalised to this value, and the matcher pins it again at the point of use, so
 * a request assembled by some future caller cannot reintroduce the prohibition.
 */
export const AGE_RECOMMENDATION_STRENGTH = 'preferred' as const;
