import { FamilyMember } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { childAgeMonths, recommendedMonthInterval } from '@/src/services/matching/age-suitability';

/**
 * Where each child sits against a venue's published recommended ages.
 *
 * `evaluateAgeRecommendation` answers "how many of them are inside" for ranking. A parent reading a
 * card needs the next question answered: *which* child, and on which side. A venue recommended for
 * 5–12 suits an 8-year-old and not a 2-year-old, and the honest sentence names both. This is the one
 * place that works that out, from the same month interval the ranking uses, so the sentence can
 * never disagree with the score.
 *
 * Explanation only. Like the evaluator it sits beside, it must never exclude a venue.
 */
export type ChildAgeSide = 'inside' | 'below' | 'above';

export interface ChildAgeVerdict {
  id: string;
  name: string;
  side: ChildAgeSide;
}

type RecommendedAges = Pick<MatchableVenueFacts, 'minRecommendedAge' | 'maxRecommendedAge'>;

export function childAgeVerdicts(
  facts: RecommendedAges,
  members: readonly FamilyMember[] | undefined,
): ChildAgeVerdict[] {
  const interval = recommendedMonthInterval(facts);
  if (interval.minMonthsInclusive == null && interval.maxMonthsExclusive == null) return [];

  return (members ?? [])
    .filter((member) => member.role === 'child')
    .map((member) => {
      const months = childAgeMonths(member);
      let side: ChildAgeSide = 'inside';
      if (interval.minMonthsInclusive != null && months < interval.minMonthsInclusive) side = 'below';
      else if (interval.maxMonthsExclusive != null && months >= interval.maxMonthsExclusive) side = 'above';
      return { id: member.id, name: member.name.trim(), side };
    });
}

/** "Mia", "Mia and Theo", "Mia, Theo and Ada". Empty when any name is missing: no half-named lines. */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0 || names.some((name) => name.length === 0)) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "ages 5–12", "age 5 and up", "up to age 8". */
export function recommendedAgesPhrase(facts: RecommendedAges): string | null {
  const { minRecommendedAge: min, maxRecommendedAge: max } = facts;
  if (min != null && max != null) return `ages ${min}–${max}`;
  if (min != null) return `age ${min} and up`;
  if (max != null) return `up to age ${max}`;
  return null;
}

/**
 * The positive line: who the published range suits, by name. Null when there is no range, no child
 * inside it, or a child without a name (the caller falls back to its generic wording).
 */
export function suitsChildrenLine(
  facts: RecommendedAges,
  verdicts: readonly ChildAgeVerdict[],
): string | null {
  const phrase = recommendedAgesPhrase(facts);
  const inside = verdicts.filter((verdict) => verdict.side === 'inside');
  if (!phrase || inside.length === 0) return null;
  const names = joinNames(inside.map((verdict) => verdict.name));
  if (!names) return null;
  const everyone = inside.length === verdicts.length;
  const subject = everyone && inside.length > 1 ? `Suits ${names}` : `Good for ${inside.length === 1 ? `${names}’s age` : names}`;
  return `${subject} (recommended for ${phrase})`;
}

/**
 * The cautionary lines: children outside the range, grouped by side so two toddlers produce one
 * sentence. Empty when nothing is outside or a name is missing.
 */
export function outsideRangeCautions(
  facts: RecommendedAges,
  verdicts: readonly ChildAgeVerdict[],
): string[] {
  const cautions: string[] = [];
  const below = verdicts.filter((verdict) => verdict.side === 'below');
  const above = verdicts.filter((verdict) => verdict.side === 'above');
  const { minRecommendedAge: min, maxRecommendedAge: max } = facts;

  const belowNames = joinNames(below.map((verdict) => verdict.name));
  if (below.length > 0 && belowNames && min != null) {
    cautions.push(`Recommended from age ${min}, so ${belowNames} ${below.length === 1 ? 'is' : 'are'} younger than that`);
  }
  const aboveNames = joinNames(above.map((verdict) => verdict.name));
  if (above.length > 0 && aboveNames && max != null) {
    cautions.push(`Recommended up to age ${max}, so ${aboveNames} ${above.length === 1 ? 'is' : 'are'} older than that`);
  }
  return cautions;
}
