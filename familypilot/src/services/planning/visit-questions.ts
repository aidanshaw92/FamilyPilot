import { FamilyMember, FamilyProfile } from '@/src/types';
import { familyUsesBuggy } from '@/src/utils/family-mobility';

import type { VenueTrustField } from './feedback';

/**
 * After a visit FamilyPilot asks a SHORT set of questions, chosen from what it does not know about this venue and
 * what matters to this family.
 *
 * The server ranks every field by how much a new observation would help (disputed, then unknown, then stale, then
 * a single parent report; a confirmed-and-fresh field is never asked). This module narrows that to the two or three
 * a given family can actually answer, using only what the device already knows about them. Nothing about the
 * family is sent anywhere to do this: the ranking comes down, the choice is made here, and the only thing that goes
 * back up is the answers.
 *
 * A family with no buggy is not asked how the buggy coped, and a family with no child under four is not asked about
 * baby changing: they could only answer "didn't check", which is noise for them and a wasted question slot.
 */
export type QuestionKey = 'babyChanging' | 'pushchair' | 'toilets' | 'parking' | 'cafe';

const ORDER: QuestionKey[] = ['babyChanging', 'pushchair', 'toilets', 'cafe', 'parking'];
export const MAX_VISIT_QUESTIONS = 3;

function youngestAgeMonths(members: FamilyMember[]): number | null {
  const ages = members
    .filter((m) => m.role === 'child')
    .map((m) => (typeof m.ageMonths === 'number' ? m.ageMonths : Number.isFinite(m.age) ? m.age * 12 : NaN))
    .filter((n) => Number.isFinite(n));
  return ages.length ? Math.min(...ages) : null;
}

/** 0: cannot answer (never asked), 1: could answer, 2: matters to this family. */
export function relevanceFor(key: QuestionKey, profile: FamilyProfile | null): 0 | 1 | 2 {
  if (!profile) return 1;
  const youngest = youngestAgeMonths(profile.members);
  const must = profile.mustHaveFacilities ?? [];
  switch (key) {
    case 'pushchair':
      return familyUsesBuggy(profile) ? 2 : 0;
    case 'babyChanging':
      return youngest !== null && youngest < 48 ? 2 : 0;
    case 'toilets':
      return must.includes('toilets') || (youngest !== null && youngest < 72) ? 2 : 1;
    case 'cafe':
      return must.includes('cafe' as never) ? 2 : 1;
    case 'parking':
      return must.includes('parking') || Boolean(profile.vehicle) ? 2 : 1;
  }
}

export function whyAsked(field: VenueTrustField): string {
  if (field.status === 'needs_recheck') return 'Sources disagree about this one';
  if (field.status === 'unknown') return 'Nobody has confirmed this yet';
  if (field.stale) return 'The last check was a while ago';
  if (field.status === 'parent_reported') return field.agreement === 'corroborated' ? 'Families have reported this, not yet checked' : 'One family has reported this';
  return 'Worth a second look';
}

export interface PickedQuestion {
  key: QuestionKey;
  why: string;
}

/**
 * @param fields the per-field state the server returned for this venue
 * @returns up to three questions, most useful first; empty when nothing here needs checking for this family
 */
export function pickVisitQuestions(
  fields: Partial<Record<QuestionKey, VenueTrustField>> | null | undefined,
  profile: FamilyProfile | null,
  max: number = MAX_VISIT_QUESTIONS,
): PickedQuestion[] {
  const candidates = ORDER.map((key) => ({ key, field: fields?.[key], relevance: relevanceFor(key, profile) }))
    // Without the server's answer nothing is known, so every answerable field is a candidate at "unknown".
    .map((c) => ({ ...c, priority: c.field?.priority ?? 1 }))
    .filter((c) => c.priority < 9 && c.relevance > 0);
  candidates.sort((a, b) => a.priority - b.priority || b.relevance - a.relevance || ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return candidates.slice(0, max).map((c) => ({ key: c.key, why: c.field ? whyAsked(c.field) : 'Nobody has confirmed this yet' }));
}
