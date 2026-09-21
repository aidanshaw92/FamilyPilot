import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * Age admission — the one age fact that may remove a venue from a parent's results.
 *
 * The distinction this module exists to hold is the whole of P0-B2. `minRecommendedAge` /
 * `maxRecommendedAge` are advice: they say which ages a venue suggests it suits, they rank and
 * explain, and `age-suitability.ts` may never exclude on them. `minAdmissionAge` /
 * `maxAdmissionAge` are a door policy: "under 4s are not admitted". A family that turns up will
 * be turned away, so surfacing the venue is not a judgement call left to the parent, it is a
 * wasted journey.
 *
 * Three rules follow, and each is load-bearing:
 *
 * 1. **Unknown never excludes.** Almost every venue has no admission fact, and absence of a
 *    recorded prohibition is not evidence of one. Treating unknown as a closed door would empty
 *    the catalogue.
 * 2. **Any prohibited child excludes the venue.** A parent cannot leave one child at home, so a
 *    venue that admits the eight-year-old but not the toddler is not somewhere this family can
 *    go. This is the same shape as the B1 ruling that a child inside a recommended range must not
 *    vouch for a sibling outside it, applied in the stricter direction that a hard fact deserves.
 *    `docs/VENUE_DATA_AUTOMATION.md` says it directly: do not loosen essential requirements to
 *    fill results.
 * 3. **Month precision, on the same interval convention as the recommendation evaluator.** A
 *    minimum of 4 admits a child the day they turn four and not before; a maximum of 11 admits
 *    them until the day they turn twelve. Ages are read in months so that a profile carrying
 *    `ageMonths` for a baby is not rounded into or out of a prohibition.
 */

export type AgeAdmissionOutcome = 'admitted' | 'prohibited' | 'unknown';

const MONTHS_PER_YEAR = 12;

/** The admitted interval in months: [min, max), half-open at the top like the recommendation one. */
export function admissionMonthInterval(
  facts: Pick<MatchableVenueFacts, 'minAdmissionAge' | 'maxAdmissionAge'>,
): { minMonthsInclusive: number | null; maxMonthsExclusive: number | null } {
  const { minAdmissionAge: min, maxAdmissionAge: max } = facts;
  return {
    minMonthsInclusive: min == null ? null : min * MONTHS_PER_YEAR,
    // A maximum of 11 means "admitted while eleven", so the door closes at the twelfth birthday.
    maxMonthsExclusive: max == null ? null : (max + 1) * MONTHS_PER_YEAR,
  };
}

/** Whether one child, in months, is admitted. */
export function childIsAdmitted(
  facts: Pick<MatchableVenueFacts, 'minAdmissionAge' | 'maxAdmissionAge'>,
  childMonths: number,
): boolean {
  const { minMonthsInclusive, maxMonthsExclusive } = admissionMonthInterval(facts);
  if (minMonthsInclusive != null && childMonths < minMonthsInclusive) return false;
  if (maxMonthsExclusive != null && childMonths >= maxMonthsExclusive) return false;
  return true;
}

/**
 * Whether this family may be admitted.
 *
 * `unknown` when the venue records no admission policy, or when the request carries no children —
 * in both cases there is nothing to test, and the caller must not treat that as a prohibition.
 */
export function evaluateAgeAdmission(
  facts: Pick<MatchableVenueFacts, 'minAdmissionAge' | 'maxAdmissionAge'>,
  childMonthsList: number[],
): AgeAdmissionOutcome {
  const hasPolicy = facts.minAdmissionAge != null || facts.maxAdmissionAge != null;
  if (!hasPolicy) return 'unknown';
  if (childMonthsList.length === 0) return 'unknown';

  return childMonthsList.every((months) => childIsAdmitted(facts, months))
    ? 'admitted'
    : 'prohibited';
}

/** Parent-facing wording. Never the raw field name, and never alarming. */
export function describeAgeAdmission(
  facts: Pick<MatchableVenueFacts, 'minAdmissionAge' | 'maxAdmissionAge'>,
): string | null {
  const { minAdmissionAge: min, maxAdmissionAge: max } = facts;
  if (min != null && max != null) return `Admits ages ${min} to ${max}`;
  if (min != null) return `Admits ages ${min} and over`;
  if (max != null) return `Admits ages ${max} and under`;
  return null;
}
