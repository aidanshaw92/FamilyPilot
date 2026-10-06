import { AdultRelationship, FamilyMember, FamilyProfile, FamilyRoutine } from '@/src/types';
import { childAgeMonths } from '@/src/services/matching/age-suitability';

/**
 * Who is in the household, as the product reads it.
 *
 * The profile holds `members`: the person using the app, any other adults, and the children. Everything that
 * needs "who is coming" (Create a plan, Who's coming, Family Fit's wording, Meet halfway) reads the household
 * through this one module, so a day out is planned for the actual people and never for a guessed adult count.
 *
 * All of it is device-side. Names and relationships never leave the phone: a connected family sees only the
 * first-name label and the aggregates the connection snapshot already allows (ages, drive limit, needed
 * facilities, and, only if the person ticks it, routine windows).
 */

export const ADULT_RELATIONSHIP_LABEL: Record<AdultRelationship, string> = {
  partner: 'Partner',
  'co-parent': 'Co-parent',
  other: 'Another adult',
};

/** "Shaw family", or "Your family" when no family name was given: never a guess from a first name. */
export function householdTitle(profile: Pick<FamilyProfile, 'familyName'> | null | undefined): string {
  const name = (profile?.familyName ?? '').trim();
  return name ? `${name} family` : 'Your family';
}

export interface HouseholdPerson {
  id: string;
  name: string;
  kind: 'adult' | 'child';
  /** Adults only. Absent for the person who set the app up. */
  relationship?: AdultRelationship;
  /** Children only: "8 months", "2 years". */
  ageLabel?: string;
  /** True for the person who set the app up. */
  isYou: boolean;
}

function ageLabelOf(member: FamilyMember): string {
  const months = childAgeMonths(member);
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

export const adultsOf = (profile: Pick<FamilyProfile, 'members'>): FamilyMember[] =>
  (profile.members ?? []).filter((m) => m.role !== 'child');
export const childrenOf = (profile: Pick<FamilyProfile, 'members'>): FamilyMember[] =>
  (profile.members ?? []).filter((m) => m.role === 'child');

/** Everyone, adults first (the person who set the app up leading), then the children, in the order they were added. */
export function householdPeople(profile: Pick<FamilyProfile, 'members'>): HouseholdPerson[] {
  const members = profile.members ?? [];
  const adults = members.filter((m) => m.role !== 'child');
  const children = members.filter((m) => m.role === 'child');
  const you = adults.find((a) => !a.relationship) ?? adults[0];
  const ordered = [...adults.filter((a) => a === you), ...adults.filter((a) => a !== you), ...children];
  return ordered.map((m, index) => ({
    id: m.id,
    name: m.name.trim() || (m.role === 'child' ? 'Child' : 'Adult'),
    kind: m.role === 'child' ? ('child' as const) : ('adult' as const),
    relationship: m.role === 'child' ? undefined : m.relationship,
    ageLabel: m.role === 'child' ? ageLabelOf(m) : undefined,
    isYou: m === you && index === 0,
  }));
}

/** Every member id: who is coming unless somebody is toggled off. */
export const everyoneIds = (profile: Pick<FamilyProfile, 'members'>): string[] => (profile.members ?? []).map((m) => m.id);

let adultCounter = 0;
export function newAdultId(): string {
  adultCounter += 1;
  return `adult-${Date.now().toString(36)}${adultCounter.toString(36)}`;
}

export function createAdultMember(name: string, relationship: AdultRelationship): FamilyMember {
  return {
    id: newAdultId(),
    name: name.trim(),
    role: 'parent',
    relationship,
    // Adults' dates of birth are never asked for or used.
    dateOfBirth: '1990-01-01',
    age: 30,
  };
}

/** Appends an adult, leaving everything else untouched. A blank name is not an adult. */
export function withAddedAdult(profile: FamilyProfile, name: string, relationship: AdultRelationship): FamilyProfile {
  if (!name.trim()) return profile;
  return { ...profile, members: [...profile.members, createAdultMember(name, relationship)] };
}

/** Removes an adult added after the first. The person who set the app up cannot be removed here. */
export function withoutAdult(profile: FamilyProfile, id: string): FamilyProfile {
  const target = profile.members.find((m) => m.id === id);
  if (!target || target.role === 'child' || !target.relationship) return profile;
  return { ...profile, members: profile.members.filter((m) => m.id !== id) };
}

/**
 * The household as the people who are actually coming.
 *
 * Narrowing the profile (rather than passing a list of ids down) means everything downstream that already reads a
 * profile (the planner's family, Family Fit, routine reasoning) sees exactly who is coming and needs no change:
 * a child who stays at home contributes no age, no buggy, no nap and no feed to the day.
 *
 * `attendeeIds` undefined means everyone. A routine that belongs to a child follows that child; a routine with no
 * owner (saved before routines had one) is kept, because dropping it would silently lose a constraint.
 */
export function profileForAttendees<T extends Pick<FamilyProfile, 'members' | 'routines'>>(
  profile: T,
  attendeeIds?: readonly string[] | null,
): T {
  if (!attendeeIds) return profile;
  const coming = new Set(attendeeIds);
  const members = (profile.members ?? []).filter((m) => coming.has(m.id));
  const comingChildren = new Set(members.filter((m) => m.role === 'child').map((m) => m.id));
  const routines: FamilyRoutine[] = (profile.routines ?? []).filter((r) => !r.childId || comingChildren.has(r.childId));
  return { ...profile, members, routines };
}

/** A sentence for the people coming: "Aidan, Ellie, Sloane and Ozzie", "Sloane and Ozzie", "just you". */
export function sayPeople(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return 'nobody yet';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}
