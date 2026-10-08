import { FamilyProfile } from '@/src/types';
import { familyUsesBuggy } from './family-mobility';
import { driveLimitMinutes } from './preferences';

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

  if (familyUsesBuggy(profile)) parts.push('pushchair');

  // Several children can nap and eat several times a day; the receipt stays one short line, so naps are
  // grouped ("12:30 and 15:30 naps") and a long run of feeds is a count, not a list.
  const timed = (kind: 'nap' | 'feed') =>
    [...new Set((profile.routines ?? []).filter((r) => r.kind === kind && r.time).map((r) => r.time))].sort();
  const naps = timed('nap');
  const feeds = timed('feed');
  if (naps.length > 0) {
    const list = naps.length === 1 ? naps[0] : `${naps.slice(0, -1).join(', ')} and ${naps[naps.length - 1]}`;
    parts.push(`${list} ${naps.length === 1 ? 'nap' : 'naps'}`);
  }
  if (feeds.length === 1) parts.push(`${feeds[0]} feed`);
  else if (feeds.length === 2) parts.push(`${feeds[0]} and ${feeds[1]} feeds`);
  else if (feeds.length > 2) parts.push(`${feeds.length} feeds`);

  // Only a limit the parent stated; "max 30 min drive" must never be read out for a limit nobody chose.
  const limit = driveLimitMinutes(profile);
  if (limit !== null) {
    parts.push(`max ${limit} min drive`);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return `Using ${parts[0]}`;
  return `Using ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
