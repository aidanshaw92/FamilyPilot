import { MatchableVenueFacts, VenueAgeRestriction } from '@/src/types/day-request';

/**
 * Age admission — the one age fact that may remove a venue from a parent's results.
 *
 * The distinction this module holds is the whole of P0-B2. `minRecommendedAge` /
 * `maxRecommendedAge` are advice: they say which ages a venue suggests it suits, they rank and
 * explain, and `age-suitability.ts` may never exclude on them. `venueAgeRestriction` is a door
 * policy: "under 4s are not admitted". A family that turns up is turned away, so surfacing the
 * venue is not a judgement call left to the parent, it is a wasted journey.
 *
 * Everything here is already in MONTHS. The interval is projected server-side from trusted,
 * in-lifetime, non-conflicted, venue-scope age-policy claims (server/enrichment/_lib/age-policy.js),
 * so this module never sees an activity rule, an accompaniment rule, a rule whose scope could not
 * be determined, a source-less claim, or two sources that disagree — each of those arrives here
 * as `null`, which is unknown, which never excludes.
 *
 * Two rules remain for this module to hold:
 *
 * 1. **Unknown never excludes.** Almost every venue has no admission fact, and absence of a
 *    recorded prohibition is not evidence of one. Treating unknown as a closed door would empty
 *    the catalogue.
 * 2. **Any prohibited child excludes the venue.** A parent cannot leave one child at home, so a
 *    venue that admits the eight-year-old but not the toddler is not somewhere this family can
 *    go. The same shape as the B1 ruling that a child inside a recommended range must not vouch
 *    for a sibling outside it, applied in the stricter direction a hard fact deserves.
 */

export type AgeAdmissionOutcome = 'admitted' | 'prohibited' | 'unknown';

const MONTHS_PER_YEAR = 12;

/** Whether one child, in months, is admitted by a restriction. Half-open [min, max). */
export function childIsAdmitted(restriction: VenueAgeRestriction, childMonths: number): boolean {
  const { minMonthsInclusive, maxMonthsExclusive } = restriction;
  if (minMonthsInclusive != null && childMonths < minMonthsInclusive) return false;
  if (maxMonthsExclusive != null && childMonths >= maxMonthsExclusive) return false;
  return true;
}

/**
 * Whether this family may be admitted.
 *
 * `unknown` when the venue records no restriction, or when the request carries no children — in
 * both cases there is nothing to test, and the caller must not read that as a prohibition.
 */
export function evaluateAgeAdmission(
  facts: Pick<MatchableVenueFacts, 'venueAgeRestriction'>,
  childMonthsList: number[],
): AgeAdmissionOutcome {
  const restriction = facts.venueAgeRestriction;
  if (!restriction) return 'unknown';
  if (restriction.minMonthsInclusive == null && restriction.maxMonthsExclusive == null) return 'unknown';
  if (childMonthsList.length === 0) return 'unknown';

  return childMonthsList.every((months) => childIsAdmitted(restriction, months))
    ? 'admitted'
    : 'prohibited';
}

/**
 * Parent-facing wording. Never the raw field name, and never alarming.
 *
 * Months are rendered as years only when the conversion is lossless, because "admits ages 0 and
 * over" would be a silly way to say "admits babies from six months".
 */
export function describeAgeAdmission(
  facts: Pick<MatchableVenueFacts, 'venueAgeRestriction'>,
): string | null {
  const restriction = facts.venueAgeRestriction;
  if (!restriction) return null;

  const min = formatLowerBound(restriction.minMonthsInclusive);
  const max = formatUpperBound(restriction.maxMonthsExclusive);

  if (min && max) return `Admits ${min} to ${max}`;
  if (min) return `Admits ${min} and over`;
  if (max) return `Admits ${max} and under`;
  return null;
}

function formatLowerBound(months: number | null): string | null {
  if (months == null) return null;
  if (months === 0) return 'all ages';
  if (months % MONTHS_PER_YEAR === 0) return `age ${months / MONTHS_PER_YEAR}`;
  return `${months} months`;
}

/**
 * The stored maximum is EXCLUSIVE, so 144 means "admitted until the twelfth birthday" and reads
 * to a parent as "age 11". Converting first and subtracting after is what keeps that true: taking
 * a month off 144 and then formatting yields "143 months", which is both ugly and wrong.
 */
function formatUpperBound(maxMonthsExclusive: number | null): string | null {
  if (maxMonthsExclusive == null) return null;
  if (maxMonthsExclusive % MONTHS_PER_YEAR === 0) {
    return `age ${maxMonthsExclusive / MONTHS_PER_YEAR - 1}`;
  }
  return `${maxMonthsExclusive - 1} months`;
}
