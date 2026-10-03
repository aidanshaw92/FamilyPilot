import { ChildMobility, FacilityType, FamilyMember, FamilyProfile, FamilyRoutine } from '@/src/types';

import { MAX_CHILD_YEARS, parseIsoDate } from './child-age';
import { withCompletion } from './profile-defaults';

/**
 * Bringing a stored family profile of any age up to the current shape, without inventing anything.
 *
 * What it guarantees, and the reasons:
 * - **No invented date of birth.** A child saved before dates of birth were collected has a made-up one;
 *   `dobKnown` stays false for them, so nothing derives an age from it and the app asks for the real date.
 * - **No invented age.** A child whose stored age is unusable and whose date cannot stand in for it is
 *   dropped, and counted, rather than kept as a guess: an invented baby would be recommended baby things.
 * - **Malformed or partial storage never throws.** Anything unreadable falls back to the same defaults a
 *   brand-new profile has, field by field, so one bad field does not cost the family the rest.
 *
 * Device-local data in, device-local data out: nothing here touches the network.
 */

const BUDGET_TIERS: FamilyProfile['budgetTier'][] = ['budget', 'moderate', 'premium'];
const MOBILITY: ChildMobility[] = ['walks', 'buggy', 'carrier', 'mobility-aid'];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface MigrationResult {
  profile: FamilyProfile;
  /** Children whose age could not be established and who were therefore not kept. */
  droppedChildren: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

let counter = 0;
const freshId = (prefix: string) => `${prefix}-${Date.now()}-${(counter += 1)}`;

function migrateMember(raw: unknown): FamilyMember | 'dropped' | null {
  if (!isRecord(raw)) return null;
  const role = raw.role === 'child' || raw.role === 'parent' ? raw.role : null;
  if (!role) return null;

  const id = text(raw.id) || freshId(role);
  const name = text(raw.name).trim();
  const dobText = text(raw.dateOfBirth);
  const dobParses = parseIsoDate(dobText) !== null;

  if (role === 'parent') {
    return { id, name, role, dateOfBirth: dobParses ? dobText : '1990-01-01', age: finite(raw.age) ?? 30 };
  }

  const storedAge = finite(raw.age);
  const years = storedAge !== null && storedAge >= 0 && storedAge <= MAX_CHILD_YEARS ? Math.floor(storedAge) : null;
  if (years === null) return 'dropped';

  const storedMonths = finite(raw.ageMonths);
  const ageMonths = years === 0 && storedMonths !== null && storedMonths >= 0 && storedMonths <= 11 ? Math.floor(storedMonths) : null;

  const mobility = Array.isArray(raw.mobility)
    ? MOBILITY.filter((mode) => (raw.mobility as unknown[]).includes(mode))
    : [];

  return {
    id,
    name,
    role,
    dateOfBirth: dobParses ? dobText : '',
    // Trusted only when the member says so AND the date is a real date.
    dobKnown: raw.dobKnown === true && dobParses,
    age: years,
    ageMonths,
    ...(mobility.length ? { mobility } : {}),
  };
}

function migrateRoutine(raw: unknown): FamilyRoutine | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind === 'nap' || raw.kind === 'feed' ? raw.kind : null;
  const time = text(raw.time);
  if (!kind || !CLOCK.test(time)) return null;
  const duration = finite(raw.durationMinutes);
  return {
    id: text(raw.id) || freshId('routine'),
    label: text(raw.label) || (kind === 'nap' ? 'Nap' : 'Feed'),
    kind,
    time,
    durationMinutes: duration !== null && duration > 0 ? Math.round(duration) : kind === 'nap' ? 60 : 30,
    atHome: typeof raw.atHome === 'boolean' ? raw.atHome : true,
    ...(typeof raw.childId === 'string' && raw.childId ? { childId: raw.childId } : {}),
  };
}

export function migrateLegacyProfile(raw: unknown): MigrationResult {
  const source = isRecord(raw) ? raw : {};
  let droppedChildren = 0;

  const members: FamilyMember[] = [];
  for (const entry of Array.isArray(source.members) ? source.members : []) {
    const member = migrateMember(entry);
    if (member === 'dropped') droppedChildren += 1;
    else if (member) members.push(member);
  }

  // Routines owned by a child who was dropped, or who never existed, lose their owner rather than
  // pointing at nobody; they are still the family's routines.
  const childIds = new Set(members.filter((m) => m.role === 'child').map((m) => m.id));
  const routines = (Array.isArray(source.routines) ? source.routines : [])
    .map(migrateRoutine)
    .filter((routine): routine is FamilyRoutine => routine !== null)
    .map((routine) => {
      if (routine.childId && !childIds.has(routine.childId)) {
        const { childId: _unused, ...rest } = routine;
        return rest;
      }
      return routine;
    });

  const drive = finite(source.maxDriveMinutes);
  const lat = finite(source.homeLatitude);
  const lng = finite(source.homeLongitude);

  const profile = withCompletion({
    id: text(source.id) || freshId('family'),
    parentName: text(source.parentName),
    members,
    homeLocation: text(source.homeLocation),
    ...(lat !== null && lng !== null ? { homeLatitude: lat, homeLongitude: lng } : {}),
    budgetTier: BUDGET_TIERS.includes(source.budgetTier as FamilyProfile['budgetTier'])
      ? (source.budgetTier as FamilyProfile['budgetTier'])
      : 'moderate',
    maxDriveMinutes: drive !== null && drive > 0 ? Math.round(drive) : 30,
    completionPercent: 0,
    vehicle: optionalText(source.vehicle),
    pushchair: optionalText(source.pushchair),
    travelCot: optionalText(source.travelCot),
    memberships: Array.isArray(source.memberships) ? source.memberships.filter((m): m is string => typeof m === 'string') : [],
    routines,
    mustHaveFacilities: Array.isArray(source.mustHaveFacilities)
      ? (source.mustHaveFacilities.filter((f): f is string => typeof f === 'string') as FacilityType[])
      : [],
  });

  return { profile, droppedChildren };
}
