import { FamilyProfile } from '@/src/types';
import { ageFromDob } from '@/src/utils/child-age';
import { Attendee } from './admission';

/**
 * Who is coming, as the calculator needs them, with each child's age ON THE VISIT DATE.
 *
 * A child's age is taken from a date of birth the parent actually entered. A child saved with only an approximate age
 * (no real date of birth) has no age we can stand behind at a ticket boundary (under-3s free, 3 to 15 pay), so their age is
 * left unknown and the price says so, rather than guessing which side of the line they fall on. Adults are anonymous
 * ("Adult"): an admission line needs a count, not a name or an age.
 */
export function attendeesFromProfile(
  profile: Pick<FamilyProfile, 'members'>,
  visitDate: Date,
  attendeeIds?: readonly string[] | null,
): Attendee[] {
  const chosen = attendeeIds ? new Set(attendeeIds) : null;
  const out: Attendee[] = [];
  let adults = 0;
  for (const m of profile.members ?? []) {
    if (chosen && !chosen.has(m.id)) continue;
    if (m.role === 'child') {
      const parts = m.dobKnown ? ageFromDob(m.dateOfBirth, visitDate) : null;
      out.push({ id: m.id, kind: 'child', label: m.name?.trim() || 'Child', ageMonths: parts ? parts.totalMonths : null });
    } else {
      adults += 1;
      out.push({ id: m.id, kind: 'adult', label: adults === 1 ? 'Adult' : `Adult ${adults}` });
    }
  }
  return out;
}
