import { FoodCandidate } from '@/src/types/nearby-food';
import { isRouted } from '@/src/types/travel';

import { MEAL_DWELL_MINUTES } from './create-plan';
import { lunchFit } from './meal-window';
import { PlanningFamily } from './planner';

/**
 * What can honestly be said about a place to eat before the parent chooses it, from what OpenStreetMap recorded and nothing
 * else. One line per fact, each with its provenance, so the picker explains a recommendation instead of asserting one.
 *
 * Nothing here is invented: no rating, no "open now", no Family Fit. A facility is "listed" only where a mapper said yes, and
 * an unlisted one is said to be unlisted, never absent. The walk is the discovery's own leg (estimated from distance unless
 * routed). The start time is the existing lunch window arithmetic (meal-window.ts): advice, not a rule.
 */
export type LunchEvidenceProvenance = 'reported' | 'estimated' | 'unknown' | 'inferred';

export interface LunchEvidenceLine {
  text: string;
  provenance: LunchEvidenceProvenance;
  /** Outside the family lunch window: said plainly, left to the parent. */
  warn?: boolean;
}

export interface LunchNeeds {
  /** A child under three is coming, so high chairs and changing matter. */
  littleOnes: boolean;
  /** A family said baby changing is a must-have. */
  changing: boolean;
}

export function lunchNeeds(families: readonly Pick<PlanningFamily, 'ages' | 'required'>[]): LunchNeeds {
  const littleOnes = families.some((family) => family.ages.some((age) => age < 3));
  return { littleOnes, changing: littleOnes || families.some((family) => family.required.includes('babyChanging')) };
}

const walkOf = (candidate: FoodCandidate) => candidate.travel.find((leg) => leg.mode === 'walk');

/** How many of the facilities this family needs are listed for the place. */
export function listedRelevant(candidate: FoodCandidate, needs: LunchNeeds): number {
  return (needs.littleOnes && candidate.tagged.highchair ? 1 : 0) + (needs.changing && candidate.tagged.changingTable ? 1 : 0);
}

/**
 * Recommended order: the places listing the facilities this family needs first, then the shortest walk (estimated or
 * measured), then as the discovery ranked them. A family with no particular needs gets the discovery's order by distance.
 */
export function rankLunchCandidates(candidates: readonly FoodCandidate[], needs: LunchNeeds): FoodCandidate[] {
  const minutes = (c: FoodCandidate) => walkOf(c)?.durationMinutes ?? Number.POSITIVE_INFINITY;
  return [...candidates].sort((a, b) => listedRelevant(b, needs) - listedRelevant(a, needs) || minutes(a) - minutes(b) || a.distanceKm - b.distanceKm);
}

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function lunchEvidence(
  candidate: FoodCandidate,
  context: { arriveAt: string; visitMinutes: number; needs: LunchNeeds },
): LunchEvidenceLine[] {
  const lines: LunchEvidenceLine[] = [];
  const walk = walkOf(candidate);
  const kind = candidate.cuisine ? `${upperFirst(candidate.category.replace('_', ' '))} · ${candidate.cuisine}` : upperFirst(candidate.category.replace('_', ' '));
  if (walk) {
    const n = Math.max(1, Math.round(walk.durationMinutes));
    lines.push(isRouted(walk)
      ? { text: `${kind} · ${n} min walk, measured`, provenance: 'reported' }
      : { text: `${kind} · about ${n} min walk, estimated from distance`, provenance: 'estimated' });
  } else {
    lines.push({ text: `${kind} · ${candidate.distanceKm.toFixed(1)} km away in a straight line`, provenance: 'estimated' });
  }
  const listed = [
    candidate.tagged.highchair ? 'high chairs' : null,
    candidate.tagged.changingTable ? 'baby changing' : null,
    candidate.tagged.outdoorSeating ? 'outdoor seating' : null,
    candidate.tagged.wheelchair ? 'step-free access' : null,
  ].filter((f): f is string => Boolean(f));
  if (listed.length) {
    const relevant = listedRelevant(candidate, context.needs);
    lines.push({ text: `${upperFirst(listed.join(', '))} listed on OpenStreetMap${relevant ? ', which your family needs' : ''}.`, provenance: 'reported' });
  } else {
    lines.push({ text: 'No family facilities listed: not the same as none. Worth asking.', provenance: 'unknown' });
  }
  lines.push(candidate.openingHours
    ? { text: `Hours as mapped: ${candidate.openingHours}. Not checked for this day.`, provenance: 'reported' }
    : { text: 'Opening hours not mapped: check before you go.', provenance: 'unknown' });
  const fit = lunchFit({ arriveAt: context.arriveAt, visitMinutes: context.visitMinutes, hopMinutes: walk ? Math.max(1, Math.round(walk.durationMinutes)) : undefined });
  if (fit.startsAt) {
    if (fit.fits) lines.push({ text: `Would start about ${fit.startsAt} · ${MEAL_DWELL_MINUTES} minutes at the table.`, provenance: 'inferred' });
    else lines.push({ text: `Would start about ${fit.startsAt}, ${fit.reason === 'late' ? 'later' : 'earlier'} than most families eat lunch. Your call.`, provenance: 'inferred', warn: true });
  }
  return lines;
}
