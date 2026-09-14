import { Ionicons } from '@expo/vector-icons';

import { MatchableVenueFacts } from '@/src/types/day-request';
import { Venue } from '@/src/types';

export interface FamilySignal {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

type Facts = Partial<
  Pick<
    MatchableVenueFacts,
    | 'toilets'
    | 'babyChanging'
    | 'parking'
    | 'freeParking'
    | 'pushchairSuitability'
    | 'environment'
    | 'visitDurationMinutes'
  >
>;

/**
 * The handful of facts a parent actually scans for, in the order they matter, and only
 * where the fact is genuinely confirmed. An absent signal means "not confirmed", never
 * "not available" - so nothing here is ever inferred from a category.
 */
export function getFamilySignals(facts: Facts | undefined, limit = 4): FamilySignal[] {
  if (!facts) return [];
  const signals: FamilySignal[] = [];

  if (facts.freeParking === 'yes') {
    signals.push({ key: 'freeParking', icon: 'car-outline', label: 'Free parking' });
  } else if (facts.parking === 'yes') {
    signals.push({ key: 'parking', icon: 'car-outline', label: 'Parking' });
  }
  if (facts.babyChanging === 'yes') {
    signals.push({ key: 'babyChanging', icon: 'happy-outline', label: 'Baby changing' });
  }
  if (facts.pushchairSuitability === 'excellent' || facts.pushchairSuitability === 'good') {
    signals.push({ key: 'pushchair', icon: 'accessibility-outline', label: 'Buggy friendly' });
  }
  if (facts.toilets === 'yes') {
    signals.push({ key: 'toilets', icon: 'water-outline', label: 'Toilets' });
  }
  if (facts.environment === 'indoor') {
    signals.push({ key: 'indoor', icon: 'home-outline', label: 'Indoor' });
  } else if (facts.environment === 'outdoor') {
    signals.push({ key: 'outdoor', icon: 'leaf-outline', label: 'Outdoor' });
  }

  return signals.slice(0, limit);
}

/** Travel time always earns its place on a card: it is known for every venue. */
export function getTravelSignal(driveMinutes: number): FamilySignal {
  return { key: 'drive', icon: 'time-outline', label: `${driveMinutes} min away` };
}

/** Card signals: travel time first, then confirmed facts, capped so cards stay calm. */
export function getCardSignals(venue: Pick<Venue, 'driveMinutes' | 'trustedFacts'>, limit = 3): FamilySignal[] {
  return [getTravelSignal(venue.driveMinutes), ...getFamilySignals(venue.trustedFacts, limit - 1)].slice(0, limit);
}
