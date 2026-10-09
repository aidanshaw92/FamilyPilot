import { VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { formatTerrainLabel } from '@/src/utils/family-match-classification';

/**
 * The "Family essentials" rows of the approved Venue Detail frame (02, nodes 72:7 to 72:24): a label
 * on the left, a short value on the right, and "Not confirmed" wherever nobody has established the
 * fact. Built only from what the venue record actually carries: a reviewed tri-state, a confirmed
 * facility, a reviewed free-text detail. Unknown stays unknown; a category never implies a toilet.
 */
export interface FamilyEssentialRow {
  key: string;
  label: string;
  value: string;
  /** False when the value is the honest "Not confirmed", so the row can draw it quieter. */
  confirmed: boolean;
}

export const NOT_CONFIRMED = 'Not confirmed';

type Facts = Partial<MatchableVenueFacts> | undefined;

const unknownRow = (key: string, label: string): FamilyEssentialRow => ({ key, label, value: NOT_CONFIRMED, confirmed: false });
const row = (key: string, label: string, value: string): FamilyEssentialRow => ({ key, label, value, confirmed: true });

function pushchairValue(facts: Facts, facilities: string[]): string | null {
  switch (facts?.pushchairSuitability) {
    case 'excellent':
      return 'Step-free throughout';
    case 'good':
      return 'Mostly step-free';
    case 'mixed':
      return 'Mixed, some steps';
    case 'difficult':
      return 'Reviewed as difficult';
    default:
      return facilities.includes('pushchair_friendly') ? 'Pushchair friendly' : null;
  }
}

function parkingValue(venue: VenueDetail, facts: Facts, facilities: string[]): string | null {
  if (facts?.parking === 'no') return 'None on site';
  const confirmed = facts?.parking === 'yes' || facilities.includes('parking');
  if (!confirmed) return null;
  if (venue.parkingInfo) return venue.parkingInfo;
  return facts?.freeParking === 'yes' ? 'Free, on site' : 'On site';
}

function agesValue(venue: VenueDetail, facts: Facts): string | null {
  const min = facts?.minRecommendedAge ?? null;
  const max = facts?.maxRecommendedAge ?? null;
  if (min !== null && max !== null) return `Ages ${min} to ${max}`;
  if (min !== null) return `Ages ${min} and up`;
  if (max !== null) return `Up to age ${max}`;
  return venue.bestAges ?? null;
}

function foodValue(facilities: string[]): string | null {
  const cafe = facilities.includes('cafe');
  const picnic = facilities.includes('picnic');
  if (cafe && picnic) return 'Café and picnic area';
  if (cafe) return 'Café';
  if (picnic) return 'Picnic area';
  return null;
}

/**
 * A playground on site is provision, not a statement about who it suits: no claim carries the playground's own ages, so
 * where the venue states no ages either, the row says so rather than letting "On site" read as "good for your children".
 */
function playgroundValue(venue: VenueDetail, facts: Facts, facilities: string[]): string | null {
  if (facts?.playground === 'no') return 'None on site';
  if (facts?.playground !== 'yes' && !facilities.includes('playground')) return null;
  return agesValue(venue, facts) ? 'On site' : 'On site, ages not stated';
}

function triStateValue(state: string | undefined, yes: string, no: string, facilityConfirmed: boolean): string | null {
  if (state === 'yes' || facilityConfirmed) return yes;
  if (state === 'no') return no;
  return null;
}

export function familyEssentialRows(venue: VenueDetail): FamilyEssentialRow[] {
  const facts: Facts = venue.trustedFacts;
  const facilities: string[] = venue.facilities ?? [];
  const maybe = (key: string, label: string, value: string | null) => (value ? row(key, label, value) : unknownRow(key, label));
  return [
    maybe('baby-changing', 'Baby changing', triStateValue(facts?.babyChanging, 'Available', 'None reviewed', facilities.includes('baby_changing'))),
    maybe('buggy', 'Buggy access', pushchairValue(facts, facilities)),
    maybe('wheelchair', 'Wheelchair access', triStateValue(facts?.wheelchairAccessible, 'Accessible', 'Not accessible', false)),
    maybe('toilets', 'Toilets', triStateValue(facts?.toilets, 'On site', 'None on site', facilities.includes('toilets'))),
    maybe('step-free', 'Step-free access', triStateValue(facts?.stepFreeAccess, 'Step-free', 'Not step-free', false)),
    maybe('accessible-toilet', 'Accessible toilet', triStateValue(facts?.accessibleToilet, 'On site', 'None on site', false)),
    maybe('parking', 'Parking', parkingValue(venue, facts, facilities)),
    // Blue Badge bays are their own row, from their own claim. "None on site" for parking says nothing about them.
    // Where the bays are matters as much as whether they exist: "Available" alone would read as on site, so the venue's own location words lead when it gave them.
    maybe('blue-badge', 'Blue Badge parking', facts?.blueBadgeParking === 'yes' && facts?.blueBadgeNote ? facts.blueBadgeNote : triStateValue(facts?.blueBadgeParking, 'Available', 'None reviewed', false)),
    maybe('step-free-station', 'Step-free station', triStateValue(facts?.stepFreeStation, 'Yes', 'No', false)),
    maybe('public-transport', 'Public transport', triStateValue(facts?.publicTransport, 'Available', 'Not available', false)),
    maybe('food', 'Food', foodValue(facilities)),
    maybe('playground', 'Playground', playgroundValue(venue, facts, facilities)),
    maybe('ages', 'Best for ages', agesValue(venue, facts)),
    maybe('terrain', 'Terrain', venue.terrain ? formatTerrainLabel(venue.terrain) : null),
    maybe('hours', 'Opening hours', venue.openingHours?.trim() ? venue.openingHours : null),
  ];
}
