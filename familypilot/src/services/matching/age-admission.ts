import {
  MatchableVenueFacts,
  VenueAgeCaveat,
  VenueAgePolicy,
  VenueAgeRestriction,
} from '@/src/types/day-request';

/**
 * Age admission — the one age fact that may remove a venue from a parent's results.
 *
 * The distinction this module holds is the whole of P0-B2. `minRecommendedAge` /
 * `maxRecommendedAge` are advice: they say which ages a venue suggests it suits, they rank and
 * explain, and `age-suitability.ts` may never exclude on them. A `VenueAgePolicy.restrictions`
 * entry is a door policy: "under 4s are not admitted". A family that turns up is turned away, so
 * surfacing the venue is not a judgement call left to the parent, it is a wasted journey.
 *
 * Everything here is already in MONTHS. The policy is projected server-side from trusted,
 * in-lifetime, human-approved, non-conflicted, venue-scope age-policy claims
 * (server/enrichment/_lib/age-policy.js), so this module never sees an activity rule, an
 * accompaniment rule, a rule whose scope could not be determined, a source-less claim, or two
 * sources that disagree as a RESTRICTION — each of those arrives as a caveat, which explains
 * without excluding, or as nothing at all.
 *
 * Three rules remain for this module to hold:
 *
 * 1. **Unknown never excludes.** Almost every venue has no admission fact, and absence of a
 *    recorded prohibition is not evidence of one. Treating unknown as a closed door would empty
 *    the catalogue.
 * 2. **Any prohibited child excludes the venue.** A parent cannot leave one child at home, so a
 *    venue that admits the eight-year-old but not the toddler is not somewhere this family can
 *    go. The same shape as the B1 ruling that a child inside a recommended range must not vouch
 *    for a sibling outside it, applied in the stricter direction a hard fact deserves.
 * 3. **Every restriction applies.** A venue may state more than one door — "under 4s not
 *    admitted" AND "over 12s not admitted" are two rules, not a contradiction — so a child is
 *    admitted only by satisfying all of them.
 */

export type AgeAdmissionOutcome = 'admitted' | 'prohibited' | 'unknown';

const MONTHS_PER_YEAR = 12;

/** A restriction states something only if it carries a bound. Both-null cannot gate. */
function isEnforceable(restriction: VenueAgeRestriction): boolean {
  return restriction.minMonthsInclusive != null || restriction.maxMonthsExclusive != null;
}

function enforceableRestrictions(policy: VenueAgePolicy | null): VenueAgeRestriction[] {
  if (!policy || policy.sourcesDisagree) return [];
  return policy.restrictions.filter(isEnforceable);
}

/** Whether one child, in months, is admitted by one restriction. Half-open [min, max). */
export function childIsAdmitted(restriction: VenueAgeRestriction, childMonths: number): boolean {
  const { minMonthsInclusive, maxMonthsExclusive } = restriction;
  if (minMonthsInclusive != null && childMonths < minMonthsInclusive) return false;
  if (maxMonthsExclusive != null && childMonths >= maxMonthsExclusive) return false;
  return true;
}

/**
 * Whether this family may be admitted.
 *
 * `unknown` when the venue records no enforceable restriction, or when the request carries no
 * children — in both cases there is nothing to test, and the caller must not read that as a
 * prohibition.
 */
export function evaluateAgeAdmission(
  facts: Pick<MatchableVenueFacts, 'venueAgePolicy'>,
  childMonthsList: number[],
): AgeAdmissionOutcome {
  const restrictions = enforceableRestrictions(facts.venueAgePolicy);
  if (restrictions.length === 0) return 'unknown';
  if (childMonthsList.length === 0) return 'unknown';

  return childMonthsList.every((months) =>
    restrictions.every((restriction) => childIsAdmitted(restriction, months)),
  )
    ? 'admitted'
    : 'prohibited';
}

/**
 * Parent-facing wording for the door. Never the raw field name, and never alarming.
 *
 * Several restrictions describe one admitted band between them — a child must satisfy all of
 * them, so the band is their intersection — and that band is what a parent needs to read.
 *
 * Months are rendered as years only when the conversion is lossless, because "admits age 0 and
 * over" would be a silly way to say "admits babies from six months".
 */
export function describeAgeAdmission(
  facts: Pick<MatchableVenueFacts, 'venueAgePolicy'>,
): string | null {
  const restrictions = enforceableRestrictions(facts.venueAgePolicy);
  if (restrictions.length === 0) return null;

  const lower = restrictions
    .map((r) => r.minMonthsInclusive)
    .filter((value): value is number => value != null);
  const upper = restrictions
    .map((r) => r.maxMonthsExclusive)
    .filter((value): value is number => value != null);

  const min = formatLowerBound(lower.length > 0 ? Math.max(...lower) : null);
  const max = formatUpperBound(upper.length > 0 ? Math.min(...upper) : null);

  if (min && max) return `Admits ${min} to ${max}`;
  if (min) return `Admits ${min} and over`;
  if (max) return `Admits ${max} and under`;
  return null;
}

/**
 * Parent-facing wording for the rules that explain rather than exclude.
 *
 * These exist so that a rule which is real but not a door still reaches the person planning the
 * day. "Soft play is 5+" is worth knowing before driving there, and it is not a reason to hide
 * the venue from a family with a three-year-old who will use the rest of it.
 */
export function describeAgeCaveats(
  facts: Pick<MatchableVenueFacts, 'venueAgePolicy'>,
): string[] {
  const policy = facts.venueAgePolicy;
  if (!policy) return [];

  const lines = policy.caveats
    .map((caveat) => describeAgeCaveat(caveat))
    .filter((line): line is string => Boolean(line));

  if (policy.sourcesDisagree) {
    // Said plainly rather than hidden: the venue stays visible BECAUSE its sources disagree, and
    // a parent who is told nothing has no way to know an age rule was seen and set aside.
    lines.unshift('Sources disagree on its age rules, so check before you go');
  }

  return lines;
}

function describeAgeCaveat(caveat: VenueAgeCaveat): string | null {
  const band = describeBand(caveat.minMonthsInclusive, caveat.maxMonthsExclusive);
  if (!band) return null;

  if (caveat.scope === 'activity' && caveat.activity) return `${caveat.activity} is ${band}`;
  if (caveat.scope === 'accompaniment') return `An adult must stay with children ${outsideBand(band, caveat)}`;
  if (caveat.scope === 'venue') return `Its age rule (${band}) is not confirmed`;
  return `An age rule may apply (${band})`;
}

function describeBand(min: number | null, max: number | null): string | null {
  const lower = formatLowerBound(min);
  const upper = formatUpperBound(max);
  if (lower && upper) return `${lower} to ${upper}`;
  if (lower) return `${lower} and over`;
  if (upper) return `${upper} and under`;
  return null;
}

/** An accompaniment rule names the children it covers, not the ones it admits. */
function outsideBand(band: string, caveat: VenueAgeCaveat): string {
  if (caveat.minMonthsInclusive == null && caveat.maxMonthsExclusive != null) {
    return `under ${formatLowerBound(caveat.maxMonthsExclusive) ?? band}`;
  }
  return band;
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
