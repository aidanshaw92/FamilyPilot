import { ConstraintEvaluation } from '@/src/types/day-request';
import { StopRole } from '@/src/types/day-sequence';

/**
 * Which evidence matters at a stop, by what the stop is FOR.
 *
 * The planner matches every stop against the same family request, so before this a lunch stop was judged like a day out:
 * a parent was told a café "does not publish recommended ages" and that "what a visit costs is not confirmed". Both are
 * true and both are irrelevant. Nobody chooses lunch by a recommended age range or an admission price, and an uncertainty
 * that does not bear on the decision is noise that makes the honest ones easier to ignore.
 *
 * The contract, stated once and applied wherever a stop's evidence is assembled:
 *
 *   ATTRACTION (a day-out place, the activity a day is built around)
 *     Everything the family request asks about: journey, age policy at the door, recommended ages, indoor/outdoor, how
 *     lively it is, visit length, cost, buggy access, toilets, baby changing, parking.
 *
 *   FOOD (a lunch stop in a day built around something else)
 *     Only what decides whether a family can eat there: the journey to it, a confirmed age policy at the door, buggy
 *     access, toilets, baby changing, and parking (which only ever reaches a stop as a family's own must-have). Opening at
 *     the time the plan arrives is checked by the sequencer for every stop and is not filtered here.
 *     NOT recommended ages, visit cost, indoor/outdoor, how lively, or visit length: those describe a day out, and the
 *     day's indoor/outdoor choice is about the activity, not where the family eats.
 *
 *   FOOD VENUE (a café or restaurant chosen as the day's own venue)
 *     As FOOD, plus indoor/outdoor: here the café IS the activity the family chose a setting for.
 *
 * What this does NOT change: an outcome. A relevant fact is evaluated exactly as before, so a must-have confirmed missing
 * at a food stop is still a hard conflict, and one nobody has confirmed is still "check before you go". Unknown is never
 * turned into yes or no here; an irrelevant field is simply not asked about. No food-specific facts (highchairs, a
 * children's menu) are invented: FamilyPilot holds none, so none are claimed or asked about.
 */

export type StopEvidenceKind = 'attraction' | 'food' | 'food-venue';

/** Venue categories that are places to eat, whichever slot of the day they fill. */
const FOOD_CATEGORIES: ReadonlySet<string> = new Set(['restaurant', 'cafe']);

/** The evidence fields a food stop is judged on. Every other field is an attraction's question. */
const FOOD_RELEVANT_FIELDS: ReadonlySet<string> = new Set([
  'journey',
  'ageAdmission',
  'pushchairSuitability',
  'familyFacilities.toilets',
  'familyFacilities.babyChanging',
  'familyFacilities.parking',
]);

/** What a stop is for: its role in the day, or, for a place to eat chosen as the day's venue, its category. */
export function stopEvidenceKind(stop: { role: StopRole; category?: string | null }): StopEvidenceKind {
  if (stop.role === 'meal') return 'food';
  return stop.category && FOOD_CATEGORIES.has(stop.category) ? 'food-venue' : 'attraction';
}

/** Whether a piece of evidence bears on the decision this kind of stop is for. */
export function isRelevantEvidence(kind: StopEvidenceKind, field: string): boolean {
  if (kind === 'attraction') return true;
  if (kind === 'food-venue' && field === 'environment') return true;
  return FOOD_RELEVANT_FIELDS.has(field);
}

/** A stop's evaluations, keeping only those relevant to what the stop is for. Outcomes are untouched. */
export function relevantEvaluations<T extends Pick<ConstraintEvaluation, 'field'>>(kind: StopEvidenceKind, evaluations: readonly T[]): T[] {
  return evaluations.filter((evaluation) => isRelevantEvidence(kind, evaluation.field));
}
