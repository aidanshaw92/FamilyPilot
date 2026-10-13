import { Venue } from '@/src/types';
import { classify } from '@/src/utils/venue-classification';

/**
 * WHAT A CARD SAYS ABOUT AGES AND FACILITIES, in words that keep three things apart: what a venue has told us, what is typical
 * for this kind of place, and what nobody has recorded. Nothing is inferred into a fact, and a missing fact is never a "no".
 *
 * AGES. Three states, and the card says which:
 *   recorded     the venue's own page states an age rule or a recommended range (none does today: 0 of 149);
 *   typical      what is usual for this kind of place, worded as typical and never as a limit for this venue;
 *   unrecorded   nothing is said, and nothing is assumed.
 * Only a recorded rule can hide a place, and that is decided elsewhere (the planner's confirmed conflicts), never from here.
 */
export type AgeKind = 'recorded' | 'typical' | 'unrecorded';

export interface AgeGuidance {
  kind: AgeKind;
  text: string;
}

const monthsWords = (months: number): string => (months < 24 ? `${months} month${months === 1 ? '' : 's'}` : `${Math.floor(months / 12)} years`);

export function ageGuidance(venue: Venue): AgeGuidance {
  const facts = venue.trustedFacts;
  const door = facts?.venueAgePolicy?.restrictions?.find((r) => r.minMonthsInclusive != null || r.maxMonthsExclusive != null);
  if (door) {
    const parts: string[] = [];
    if (door.minMonthsInclusive != null) parts.push(`from ${monthsWords(door.minMonthsInclusive)}`);
    if (door.maxMonthsExclusive != null) parts.push(`under ${monthsWords(door.maxMonthsExclusive)}`);
    return { kind: 'recorded', text: `Ages: its own page sets an age rule, ${parts.join(', ')}` };
  }
  const min = facts?.minRecommendedAge;
  const max = facts?.maxRecommendedAge;
  if (min != null || max != null) {
    const range = min != null && max != null ? `${min} to ${max}` : min != null ? `from ${min}` : `up to ${max}`;
    return { kind: 'recorded', text: `Ages: its own page recommends ${range}` };
  }

  const c = classify(venue);
  if (c.group === 'play') {
    if (c.play?.trampolines === 'confirmed' && c.play.softPlay !== 'confirmed') {
      return { kind: 'typical', text: 'Ages: trampoline parks usually suit school-age children; no limit recorded for this venue' };
    }
    if (c.play?.softPlay === 'confirmed') {
      return { kind: 'typical', text: 'Ages: soft play usually suits under-fives; no limit recorded for this venue' };
    }
    return { kind: 'unrecorded', text: 'Ages: not recorded. Nothing is assumed' };
  }
  if (c.group === 'parks') return { kind: 'typical', text: 'Ages: typical for parks, no limit recorded' };
  if (c.group === 'museums') return { kind: 'typical', text: 'Ages: typical for museums, no limit recorded' };
  if (c.group === 'animals') return { kind: 'typical', text: 'Ages: typical for farms and zoos, no limit recorded' };
  return { kind: 'unrecorded', text: 'Ages: not recorded. Nothing is assumed' };
}

export interface FacilityEvidence {
  /** "Confirmed: café, toilets": from an approved claim on the venue's own pages. */
  confirmed: string[];
  /** "Parking: confirmed none": the venue's own page says it does not have it. */
  none: string[];
  /** Nobody has recorded either way. Not the same as none. */
  notRecorded: string[];
}

const FACILITIES: { key: 'toilets' | 'babyChanging' | 'parking' | 'cafe' | 'playground'; label: string }[] = [
  { key: 'cafe', label: 'café' },
  { key: 'toilets', label: 'toilets' },
  { key: 'babyChanging', label: 'baby changing' },
  { key: 'playground', label: 'playground' },
  { key: 'parking', label: 'parking' },
];

/** Facilities a parent decides on; a playground is only worth listing as "not recorded" for a park. */
export function facilityEvidence(venue: Venue): FacilityEvidence {
  const facts = venue.trustedFacts as unknown as Record<string, unknown> | undefined;
  const isPark = classify(venue).group === 'parks';
  const out: FacilityEvidence = { confirmed: [], none: [], notRecorded: [] };
  for (const { key, label } of FACILITIES) {
    const value = facts?.[key];
    if (value === 'yes') out.confirmed.push(label);
    else if (value === 'no') out.none.push(label);
    else if (key !== 'cafe' && (key !== 'playground' || isPark)) out.notRecorded.push(label);
  }
  const buggy = venue.trustedFacts?.pushchairSuitability;
  if (buggy === 'good' || buggy === 'excellent') out.confirmed.push('buggy access good');
  return out;
}

/** The lines a card shows for these facilities, longest first. Empty when there is nothing to say. */
export function facilityLines(evidence: FacilityEvidence): string[] {
  const lines: string[] = [];
  if (evidence.confirmed.length) lines.push(`Confirmed: ${evidence.confirmed.join(', ')}`);
  for (const label of evidence.none) lines.push(`${label[0].toUpperCase()}${label.slice(1)}: confirmed none`);
  if (evidence.notRecorded.length) lines.push(`Not recorded: ${evidence.notRecorded.slice(0, 3).join(', ')}`);
  return lines;
}
