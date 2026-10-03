import { FamilyProfile } from '@/src/types';

/**
 * Frame 04's "profile receipt" (node 76:61): "Using ages 2 and 4, pushchair, 15:30 nap and max
 * 30 min drive". One line that tells a parent which of their own details the plan is about to use,
 * built only from what the profile holds. Nothing is assumed: a family with no pushchair recorded
 * gets no "pushchair", a profile with no routines gets no nap. Names never appear; this line is read
 * on a shared screen, and the ages alone say who the day is for.
 */
export function profileReceipt(profile: Pick<FamilyProfile, 'members' | 'pushchair' | 'routines' | 'maxDriveMinutes'> | null | undefined): string | null {
  if (!profile) return null;
  const parts: string[] = [];

  const ages = (profile.members ?? [])
    .filter((m) => m.role === 'child')
    .map((m) => (m.ageMonths != null && m.age === 0 ? `${m.ageMonths} months` : String(m.age)))
    .filter((a) => a !== 'NaN' && a !== 'undefined');
  if (ages.length === 1) parts.push(`age ${ages[0]}`);
  else if (ages.length > 1) parts.push(`ages ${ages.slice(0, -1).join(', ')} and ${ages[ages.length - 1]}`);

  if (profile.pushchair) parts.push('pushchair');

  for (const routine of profile.routines ?? []) {
    if (!routine.time) continue;
    parts.push(`${routine.time} ${routine.kind === 'nap' ? 'nap' : 'feed'}`);
  }

  if (Number.isFinite(profile.maxDriveMinutes) && profile.maxDriveMinutes > 0) {
    parts.push(`max ${profile.maxDriveMinutes} min drive`);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return `Using ${parts[0]}`;
  return `Using ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
