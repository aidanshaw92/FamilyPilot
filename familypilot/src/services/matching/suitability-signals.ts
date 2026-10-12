import { FamilyMember } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { activityEvidenceFor, evidenceCovers } from '@/src/services/matching/activity-evidence';
import { childAgeMonths, evaluateAgeRecommendation } from '@/src/services/matching/age-suitability';

/**
 * SUITABILITY, read the way an experienced parent reads a place: what kind of place it is, what it is confirmed to have
 * for children, and whether that fits a child of this age. Kept apart from EVIDENCE COMPLETENESS (how much has been
 * checked about toilets, parking and the rest), which is a different question answered by `evidenceCompleteness` below
 * and never changes a grade on its own.
 *
 * Three strengths of signal about one child, and each line says which it is:
 *
 *   confirmed   the venue's own words about this age: its published recommended ages, or a reviewed permanent provision
 *               on its own pages that names the age (docs/EXCELLENT_RULE_V2.md). A venue-specific fact.
 *   provision   a child-specific thing confirmed AT THIS VENUE (today: a children's playground), read against a
 *               common-sense age band. Venue-specific fact, plus an inference about the age: the line says "usually".
 *   likely      a category-level inference: a farm or a zoo usually suits a toddler, soft play usually suits a
 *               four-year-old. The line says it is about the kind of place, not this one.
 *
 * and three outcomes that are not signals:
 *
 *   uncertain   nothing above applies (a museum with no child-specific evidence, a park with no playground on record):
 *               not unsuitable, not suitable, said as a thing still to confirm.
 *   excluded    the venue's own recommended ages put the child outside (said by the caller as a caution).
 *   logistics   a baby under a year: the visit is the activity, so none of this is asked (family-match.ts).
 *
 * What is NEVER done here: reading a category as a fact about facilities (a farm is not assumed to have a café), reading
 * a venue's marketing, or lifting a child the venue has itself placed outside its ages. Where the venue has stated the
 * ages its provisions are for and none covers the child, the generic playground band does not apply either: the venue's
 * words outrank the inference.
 */
export type SuitabilityState = 'confirmed' | 'provision' | 'likely' | 'uncertain' | 'excluded';

export interface ChildSuitability {
  id: string;
  name: string;
  months: number;
  state: SuitabilityState;
  /** Strong enough to support Excellent (confirmed or a venue-specific provision at a place where that is the point). */
  strong: boolean;
  /** The sentence for the reasons list, where there is one. */
  text: string | null;
  /** True when `text` rests on an inference about the kind of place or the age band, not only on a venue-specific fact. */
  inferred: boolean;
  /** For `uncertain`: what is not yet known, in the venue's terms ("whether the exhibits suit"). */
  gap: 'exhibits' | 'activity' | 'child-specific';
  /** What the reading rests on, for the ranking's age factor and for tests. */
  via: 'range' | 'reviewed' | 'playground' | 'category' | 'none';
}

/**
 * Ages, in months, that a confirmed children's playground usually suits: one to under twelve. It is STRONG evidence (enough
 * for Excellent, where the playground is the kind of thing the place is for) up to eight, when a playground is most of the
 * day; for an older child it supports Good and no more.
 */
const PLAYGROUND_BAND = { min: 12, max: 144, strongBelow: 96 };

/** Category-level bands, in months. Only categories whose core activity is for children have one. */
const CATEGORY_BAND: Record<string, { min: number; max: number; strong: boolean; text: (age: string, name: string) => string }> = {
  // A park with no playground on record: room to run around is what a park is, and that is all this claims; the sentence
  // says nothing child-specific is confirmed. Never strong: Excellent needs something confirmed for the child here.
  park: { min: 12, max: 144, strong: false, text: (age, name) => `A park usually gives a ${age} like ${name} space to run around; nothing child-specific is confirmed here yet` },
  farm: { min: 12, max: 156, strong: false, text: (age, name) => `Farms are usually a hit with a ${age} like ${name}: animals to see up close` },
  zoo: { min: 12, max: 156, strong: false, text: (age, name) => `Zoos usually suit a ${age} like ${name}: animals to see up close` },
  soft_play: { min: 12, max: 120, strong: false, text: (age, name) => `Soft play usually suits a ${age} like ${name}; check any age or height limits on the day` },
  beach: { min: 12, max: 180, strong: false, text: (age, name) => `A beach usually suits a ${age} like ${name}` },
};

/** Where a confirmed playground is the kind of thing the place is FOR, it is strong evidence; at a museum it is a bonus. */
const PLAYGROUND_IS_THE_POINT = new Set(['park', 'farm', 'zoo', 'beach', 'attraction']);

/** "3-year-old", "18-month-old". */
export function agePhrase(months: number): string {
  if (!Number.isFinite(months)) return 'child';
  if (months < 24) return `${Math.max(1, Math.round(months))}-month-old`;
  return `${Math.floor(months / 12)}-year-old`;
}

function gapFor(category: string): ChildSuitability['gap'] {
  if (category === 'museum') return 'exhibits';
  if (category === 'park' || category === 'beach') return 'child-specific';
  return 'activity';
}

export interface SuitabilityInput {
  venueId?: string;
  category: string;
  facts: Pick<MatchableVenueFacts, 'minRecommendedAge' | 'maxRecommendedAge' | 'playground'> | null | undefined;
  children: readonly FamilyMember[];
  now?: Date;
  /** Children already covered by the venue's own words (the caller's range and reviewed-evidence pass). */
  coveredIds?: ReadonlySet<string>;
}

/**
 * One reading per child of a year or more. Babies are left to logistics by the caller and are not listed here.
 */
export function childSuitability(input: SuitabilityInput): ChildSuitability[] {
  const now = input.now ?? new Date();
  const facts = input.facts;
  const evidence = input.venueId ? activityEvidenceFor(input.venueId, now) : [];
  const provisions = evidence.filter((e) => e.kind === 'provision');
  const gap = gapFor(input.category);
  const band = CATEGORY_BAND[input.category];
  const playground = facts?.playground === 'yes';

  return input.children
    .filter((child) => child.role === 'child')
    .map((child): ChildSuitability | null => {
      const months = childAgeMonths(child);
      if (!Number.isFinite(months) || months < 12) return null;
      const name = child.name.trim() || 'your child';
      const age = agePhrase(months);
      const base = { id: child.id, name, months, gap };

      // The venue's own words first, and they can exclude.
      if (facts) {
        const range = evaluateAgeRecommendation(facts, [months]);
        if (range === 'all') return { ...base, state: 'confirmed', strong: true, text: null, inferred: false, via: 'range' };
        if (range === 'none') return { ...base, state: 'excluded', strong: false, text: null, inferred: false, via: 'range' };
      }
      const provision = provisions.find((e) => evidenceCovers(e, months));
      if (provision || input.coveredIds?.has(child.id)) return { ...base, state: 'confirmed', strong: true, text: null, inferred: false, via: 'reviewed' };
      // The venue has named the ages its provisions are for, and this child is not among them: the generic playground
      // band must not put them back in.
      const venueStatesProvisionAges = provisions.length > 0;

      if (playground && !venueStatesProvisionAges && months >= PLAYGROUND_BAND.min && months < PLAYGROUND_BAND.max) {
        const strong = PLAYGROUND_IS_THE_POINT.has(input.category) && months < PLAYGROUND_BAND.strongBelow;
        return {
          ...base,
          state: 'provision',
          strong,
          text: `A children’s playground is confirmed here, which usually suits a ${age} like ${name}`,
          inferred: true,
          via: 'playground',
        };
      }
      if (band && months >= band.min && months < band.max) {
        return { ...base, state: 'likely', strong: band.strong, text: band.text(age, name), inferred: true, via: 'category' };
      }
      return { ...base, state: 'uncertain', strong: false, text: null, inferred: false, via: 'none' };
    })
    .filter((entry): entry is ChildSuitability => entry !== null);
}

/**
 * "we haven’t yet confirmed whether the exhibits suit Sloane" / "whether this activity suits Sloane" /
 * "nothing child-specific is confirmed here yet for Sloane (a playground, play area or activities)".
 */
export function uncertainClause(gap: ChildSuitability['gap'], names: string): string {
  switch (gap) {
    case 'exhibits':
      return `we haven’t yet confirmed whether the exhibits suit ${names}`;
    case 'child-specific':
      return `nothing child-specific is confirmed here yet for ${names}`;
    default:
      return `we haven’t yet confirmed whether this activity suits ${names}`;
  }
}

/**
 * The ranking's age factor when the venue publishes no range: the same reading as above, as a number. The venue's own
 * range 96 (the range score), a reviewed provision on its pages 88 (the evidence-aware policy's figure), a confirmed
 * playground 84, a category inference 80, nothing 75 (the neutral value the blend has always used), excluded 42.
 * Averaged over the children of a year or more; null with none of them.
 */
export function suitabilityAgeScore(input: SuitabilityInput): number | null {
  const per = childSuitability(input);
  if (per.length === 0) return null;
  const score = (s: ChildSuitability): number =>
    s.state === 'excluded' ? 42 : s.via === 'range' ? 96 : s.via === 'reviewed' ? 88 : s.via === 'playground' ? 84 : s.via === 'category' ? 80 : 75;
  return Math.round(per.reduce((sum, s) => sum + score(s), 0) / per.length);
}

/**
 * EVIDENCE COMPLETENESS: how much of what matters to THIS household at THIS kind of place has been checked. A count and a
 * list of what is still open; shown beside the grade, never folded into it. "5 of 7 details confirmed" is about our
 * knowledge, not about the place.
 */
export interface EvidenceCompleteness {
  known: number;
  total: number;
  level: 'well' | 'partly' | 'little';
  /** What is not yet confirmed, in a parent's words, for the line "not yet: buggy access, parking". */
  missing: string[];
}

export function evidenceCompleteness(input: {
  category: string;
  facts: MatchableVenueFacts | null | undefined;
  children: readonly FamilyMember[];
  usesBuggy: boolean;
  needsStepFree: boolean;
  venueId?: string;
  now?: Date;
  /** The venue's facilities list says there is a café (the reasons read it from there too). */
  cafeListed?: boolean;
}): EvidenceCompleteness {
  const f = input.facts;
  const known = (v: unknown) => v === 'yes' || v === 'no';
  const kids = input.children.filter((c) => c.role === 'child');
  const months = kids.map(childAgeMonths);
  const checks: Array<[string, boolean]> = [
    ['toilets', known(f?.toilets)],
    ['a café', known(f?.cafe) || Boolean(input.cafeListed)],
    ['parking', known(f?.parking)],
  ];
  if (months.some((m) => m < 48)) checks.push(['baby changing', known(f?.babyChanging)]);
  if (input.usesBuggy) checks.push(['buggy access', (f?.pushchairSuitability ?? 'unknown') !== 'unknown']);
  if (input.needsStepFree) checks.push(['step-free access', known(f?.wheelchairAccessible) || known(f?.stepFreeAccess)]);
  if (['park', 'farm', 'zoo', 'attraction', 'beach'].includes(input.category)) checks.push(['a playground', known(f?.playground)]);
  if (months.some((m) => m >= 12)) {
    const ages = f?.minRecommendedAge != null || f?.maxRecommendedAge != null;
    const reviewed = input.venueId ? activityEvidenceFor(input.venueId, input.now ?? new Date()).length > 0 : false;
    checks.push(['which ages it suits', ages || reviewed]);
  }
  const knownCount = checks.filter(([, ok]) => ok).length;
  const ratio = checks.length ? knownCount / checks.length : 0;
  return {
    known: knownCount,
    total: checks.length,
    level: ratio >= 0.75 ? 'well' : ratio >= 0.4 ? 'partly' : 'little',
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  };
}
