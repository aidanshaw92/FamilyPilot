import { FamilyProfile } from '@/src/types';
import { canPlanFor, planningFamilyFromProfile } from './plan-parties';
import { PlanningFamily, PlanningOptions } from './planner';

/**
 * What the Create a Plan sheet holds, and where its defaults come from.
 *
 * The approved sheet has four rows -- when, start, who's coming, how long -- and the product
 * intention is that a parent rarely changes any of them. That only works if the defaults are right,
 * and the defaults should come from the family's profile.
 *
 * Accounts and the real profile shape land in a later phase, so this module is the seam. The sheet
 * depends on `PlanDraft` and `PlanParty` and on nothing else; `planDraftDefaults` is the only place
 * that knows where today's answers are read from. When persistent profiles arrive, this function
 * changes and the sheet does not.
 *
 * Pure on purpose: no store access, no `Date.now()` inside the derivation. Callers pass what they
 * have, which is what makes the defaults testable.
 */

export interface PlanDraft {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, the earliest the family can leave. */
  leaveAt: string;
  /** Which households are coming. Always at least one. */
  partyIds: string[];
  /** Time at the main venue. */
  visitMinutes: number;
}

export interface PlanParty {
  id: string;
  label: string;
  /** "2 adults, 2 children" -- counts only, never names or ages. */
  summary: string;
  /** False for a household the parent has not finished describing. */
  ready: boolean;
}

export interface PlanDraftDefaults {
  draft: PlanDraft;
  parties: PlanParty[];
  /** True when nothing describes the family yet, so the sheet can invite them to set it up. */
  needsProfile: boolean;
}

/** The lengths the approved sheet offers. */
export const VISIT_LENGTH_CHOICES = [60, 90, 120, 180] as const;

function countLabel(count: number, singular: string): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/** `children` is pluralised irregularly, so it is spelled out rather than suffixed. */
function childrenLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? 'child' : 'children'}`;
}

/**
 * "2 adults, 2 children" from the household's own members.
 *
 * Counts, not identities. A plan summary is read aloud across a kitchen table and shown on a shared
 * screen, so it says how many people are coming and nothing about who they are.
 */
export function summariseHousehold(input: { adults: number; children: number }): string {
  const parts = [countLabel(input.adults, 'adult'), childrenLabel(input.children)].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : 'Nobody added yet';
}

export interface PlanDraftSources {
  /** The signed-in household, once onboarding exists. */
  profile?: FamilyProfile | null;
  /** Households already described for planning, including ones added on this device. */
  planningFamilies?: PlanningFamily[];
  /** Last used planning options, so a returning parent sees what they chose before. */
  options?: Pick<PlanningOptions, 'date' | 'leaveAt' | 'visitMinutes'> | null;
  /** `YYYY-MM-DD` for today, passed in rather than read, so the result is deterministic. */
  today: string;
}

function profileParty(profile: FamilyProfile): PlanParty {
  const members = profile.members ?? [];
  const adults = members.filter((m) => m.role !== 'child').length;
  const children = members.filter((m) => m.role === 'child').length;
  return {
    id: 'mine',
    label: 'Our family',
    summary: summariseHousehold({ adults, children }),
    // Ready means the planner could actually build a day for them, which is more than having
    // members: a household that has never said where they live has nowhere to leave from. Asked
    // through the resolver so the sheet's button and the plan it starts cannot disagree.
    ready: typeof planningFamilyFromProfile(profile) !== 'string',
  };
}

/**
 * Nearest allowed visit length at or above what was last chosen, so a stored 75 lands on 90 rather
 * than silently becoming an option the sheet cannot show as selected.
 */
function normaliseVisitMinutes(value: number | undefined): number {
  if (!Number.isFinite(value)) return 90;
  const minutes = Number(value);
  const match = VISIT_LENGTH_CHOICES.find((choice) => choice >= minutes);
  return match ?? VISIT_LENGTH_CHOICES[VISIT_LENGTH_CHOICES.length - 1];
}

export function planDraftDefaults(sources: PlanDraftSources): PlanDraftDefaults {
  const parties: PlanParty[] = [];

  if (sources.profile && (sources.profile.members?.length ?? 0) > 0) {
    parties.push(profileParty(sources.profile));
  }

  for (const family of sources.planningFamilies ?? []) {
    if (parties.some((p) => p.id === family.id)) continue;
    const children = family.ages.length;
    parties.push({
      id: family.id,
      label: family.id === 'mine' ? 'Our family' : family.label,
      // A planning family records children's ages and no adults, so the adult count is not known
      // here. Saying "2 adults" would be an invention; the children are what it actually holds.
      summary: childrenLabel(children) ?? 'Adults only',
      ready: canPlanFor(family),
    });
  }

  const needsProfile = parties.length === 0;
  if (needsProfile) {
    parties.push({ id: 'mine', label: 'Our family', summary: 'Nobody added yet', ready: false });
  }

  // A stored date in the past would plan a day that cannot happen, so today wins.
  const storedDate = sources.options?.date;
  const date = storedDate && storedDate >= sources.today ? storedDate : sources.today;

  return {
    draft: {
      date,
      leaveAt: sources.options?.leaveAt || '09:30',
      partyIds: [parties[0].id],
      visitMinutes: normaliseVisitMinutes(sources.options?.visitMinutes),
    },
    parties,
    needsProfile,
  };
}

/**
 * A draft read back out of route params.
 *
 * The Plan screen is linkable and survives a reload, so its answers arrive as URL text rather than
 * as the object the sheet handed over. Two things go wrong there and are handled here: a repeated
 * query parameter arrives as an array, which would throw on `.split`, and a number arrives as text.
 *
 * Nothing is invented. A missing or malformed date stays missing and a malformed length stays
 * unusable, so the planner rejects it and names the answer that does not add up -- rather than this
 * silently substituting a day the parent never chose.
 */
export type PlanRouteParams = Record<string, string | string[] | undefined>;

const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function planDraftFromParams(params: PlanRouteParams): PlanDraft {
  const parties = (firstValue(params.parties) ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    date: firstValue(params.date) ?? '',
    leaveAt: firstValue(params.leaveAt) ?? '',
    // The signed-in household is the only sensible default for who is coming, and it is what the
    // sheet offers first; everything else about the day stays exactly as the link said.
    partyIds: parties.length ? parties : ['mine'],
    visitMinutes: Number(firstValue(params.visit)),
  };
}

/** Everything the sheet needs before it can generate: a party that is actually described. */
export function planDraftBlocker(draft: PlanDraft, parties: PlanParty[]): string | null {
  if (!draft.partyIds.length) return 'Choose who is coming.';
  const chosen = parties.filter((p) => draft.partyIds.includes(p.id));
  if (!chosen.length) return 'Choose who is coming.';
  if (chosen.some((p) => !p.ready)) {
    return chosen.length === 1
      ? 'Add your family details so we can plan around them.'
      : 'One of the families still needs its details before we can plan.';
  }
  return null;
}
