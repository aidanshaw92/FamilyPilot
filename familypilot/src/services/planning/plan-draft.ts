import { FamilyProfile } from '@/src/types';
import { householdPeople, householdTitle, profileForAttendees, sayPeople } from '@/src/utils/household';
import { canPlanFor, planningFamilyFromProfile } from './plan-parties';
import { PlanningFamily, PlanningOptions } from './planner';
import {
  DEFAULT_VISIT_LENGTH,
  VisitLength,
  visitLengthFromParam,
  visitLengthToParam,
} from './visit-duration';

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
  /**
   * `HH:MM`: when the family wants to ARRIVE. Leaving home is worked back from it, so the plan reasons from the time
   * the parent actually named rather than from a preset.
   */
  startAt: string;
  /** Which households are coming. Always at least one. */
  partyIds: string[];
  /**
   * Which members of the parent's own household are coming. `null` is everyone: the sheet opens with the whole family
   * selected and a parent toggles somebody OUT (a baby asleep at Grandma's), which is how the day really gets decided.
   */
  attendeeIds: string[] | null;
  /** How long at the main venue, including "Not sure" and "All day". */
  visit: VisitLength;
  /** Optional deadline, `HH:MM`: everyone home by. `''` for none. A real limit, so it stays a hard one. */
  returnBy: string;
  /** Extra time each way for traffic, parking and getting everyone ready. */
  bufferMinutes: number;
  environment: 'either' | 'indoor' | 'outdoor';
}

export const DEFAULT_BUFFER_MINUTES = 15;
export const BUFFER_CHOICES = [10, 15, 30] as const;

/** A person in the parent's own household, as the Who's coming row shows them. */
export interface PlanPerson {
  id: string;
  name: string;
  kind: 'adult' | 'child';
  /** "Partner", "8 months": what helps tell people apart, never anything sensitive. */
  detail?: string;
}

export interface PlanParty {
  id: string;
  label: string;
  /** "Aidan, Ellie, Sloane and Ozzie" for the household; counts for a family added another way. */
  summary: string;
  /** False for a household the parent has not finished describing. */
  ready: boolean;
  /** The household's own members, present only for the parent's own family. Each can be toggled. */
  people?: PlanPerson[];
}

export interface PlanDraftDefaults {
  draft: PlanDraft;
  parties: PlanParty[];
  /** True when nothing describes the family yet, so the sheet can invite them to set it up. */
  needsProfile: boolean;
}

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
  options?: Pick<PlanningOptions, 'date' | 'leaveAt'> | null;
  /** `YYYY-MM-DD` for today, passed in rather than read, so the result is deterministic. */
  today: string;
  /**
   * `HH:MM` now, in the same local time as `today`. When today's chosen start has already gone, the
   * sheet opens on tomorrow: planning a day that began in the past can only end in "No day fits yet",
   * which would be true and useless. Omitted, today stays today.
   */
  nowTime?: string;
}

/** Minutes since midnight for `H:MM` or `HH:MM`; an unreadable time never counts as passed. */
function minutesOf(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
}

/** The calendar day after a `YYYY-MM-DD` date, with no timezone arithmetic in it. */
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function profileParty(profile: FamilyProfile): PlanParty {
  const people = householdPeople(profile);
  return {
    id: 'mine',
    label: householdTitle(profile),
    summary: sayPeople(people.map((p) => p.name)),
    // Ready means the planner could actually build a day for them, which is more than having
    // members: a household that has never said where they live has nowhere to leave from. Asked
    // through the resolver so the sheet's button and the plan it starts cannot disagree.
    ready: typeof planningFamilyFromProfile(profile) !== 'string',
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      detail: p.kind === 'child' ? p.ageLabel : p.isYou ? 'You' : p.relationship ? ({ partner: 'Partner', 'co-parent': 'Co-parent', other: 'Adult' } as const)[p.relationship] : undefined,
    })),
  };
}

/** The arrival time a first plan opens on. */
export const DEFAULT_START_AT = '10:00';

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
      // Said as what is on record, not as a claim about the family: "Adults only" would assert something nobody entered.
      summary: childrenLabel(children) ?? (family.routines.length ? 'No children added' : 'Starting point only'),
      ready: canPlanFor(family),
    });
  }

  const needsProfile = parties.length === 0;
  if (needsProfile) {
    parties.push({ id: 'mine', label: 'Our family', summary: 'Nobody added yet', ready: false });
  }

  // A stored date in the past would plan a day that cannot happen, so today wins.
  const storedDate = sources.options?.date;
  // The start a parent last chose is remembered as a convenience, but arriving at 09:30 is not a sensible
  // default for everyone, so the first-ever default is the middle of the morning most families aim for.
  const startAt = sources.options?.leaveAt || DEFAULT_START_AT;
  let date = storedDate && storedDate >= sources.today ? storedDate : sources.today;
  // ...and so would today itself once its start time has gone.
  if (date === sources.today && sources.nowTime && minutesOf(startAt) < minutesOf(sources.nowTime)) date = nextDay(sources.today);

  return {
    draft: {
      date,
      startAt,
      partyIds: [parties[0].id],
      // Everyone, unless the parent takes somebody out.
      attendeeIds: null,
      visit: DEFAULT_VISIT_LENGTH,
      returnBy: '',
      bufferMinutes: DEFAULT_BUFFER_MINUTES,
      environment: 'either',
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

/**
 * The first value of a route parameter, which may arrive repeated.
 *
 * Exported because callers must narrow params to primitives BEFORE memoising on them: an array
 * value is a new identity on every render, and a `useMemo` or `useEffect` that depends on one never
 * settles. See the note in app/plan.tsx.
 */
export const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function planDraftFromParams(params: PlanRouteParams): PlanDraft {
  const list = (value: string | string[] | undefined) =>
    (firstValue(value) ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  const parties = list(params.parties);
  const who = list(params.who);
  return {
    date: firstValue(params.date) ?? '',
    // `leaveAt` is what a link written before the start meant "arrive" read as; it is still understood.
    startAt: firstValue(params.start) ?? firstValue(params.leaveAt) ?? '',
    // The signed-in household is the only sensible default for who is coming, and it is what the
    // sheet offers first; everything else about the day stays exactly as the link said.
    partyIds: parties.length ? parties : ['mine'],
    attendeeIds: who.length ? who : null,
    visit: visitLengthFromParam(firstValue(params.visit)),
    returnBy: firstValue(params.home) ?? '',
    bufferMinutes: BUFFER_CHOICES.find((n) => String(n) === firstValue(params.buffer)) ?? DEFAULT_BUFFER_MINUTES,
    environment: (['indoor', 'outdoor'] as const).find((e) => e === firstValue(params.setting)) ?? 'either',
  };
}

/** The route parameters a draft travels as: the inverse of `planDraftFromParams`. */
export function planDraftToParams(draft: PlanDraft): Record<string, string> {
  return {
    date: draft.date,
    start: draft.startAt,
    visit: visitLengthToParam(draft.visit),
    parties: draft.partyIds.join(','),
    ...(draft.attendeeIds ? { who: draft.attendeeIds.join(',') } : {}),
    ...(draft.returnBy ? { home: draft.returnBy } : {}),
    ...(draft.bufferMinutes !== DEFAULT_BUFFER_MINUTES ? { buffer: String(draft.bufferMinutes) } : {}),
    ...(draft.environment !== 'either' ? { setting: draft.environment } : {}),
  };
}

/** Who in the parent's own household is coming. A person not named in a narrowed list stays at home. */
export const isComing = (draft: Pick<PlanDraft, 'attendeeIds'>, personId: string): boolean =>
  draft.attendeeIds === null || draft.attendeeIds.includes(personId);

/**
 * Toggles one person. Selecting everyone again goes back to `null`, so "everyone" stays "everyone" even if the household
 * changes before the plan is built.
 */
export function toggleAttendee(draft: PlanDraft, people: PlanPerson[], personId: string): PlanDraft {
  const current = draft.attendeeIds ?? people.map((p) => p.id);
  const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];
  const everyone = people.every((p) => next.includes(p.id));
  return { ...draft, attendeeIds: everyone ? null : next };
}

/** The household the planner should use: only the people coming. */
export const profileForDraft = <T extends Pick<FamilyProfile, 'members' | 'routines'>>(profile: T, draft: Pick<PlanDraft, 'attendeeIds'>): T =>
  profileForAttendees(profile, draft.attendeeIds);

/** Everything the sheet needs before it can generate: a party that is actually described. */
export function planDraftBlocker(draft: PlanDraft, parties: PlanParty[]): string | null {
  if (!draft.partyIds.length) return 'Choose who is coming.';
  if (draft.attendeeIds && draft.attendeeIds.length === 0 && draft.partyIds.length === 1 && draft.partyIds[0] === 'mine') {
    return 'Choose who is coming.';
  }
  const chosen = parties.filter((p) => draft.partyIds.includes(p.id));
  if (!chosen.length) return 'Choose who is coming.';
  if (chosen.some((p) => !p.ready)) {
    return chosen.length === 1
      ? 'Add your family details so we can plan around them.'
      : 'One of the families still needs its details before we can plan.';
  }
  return null;
}
