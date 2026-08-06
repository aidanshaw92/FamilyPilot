import { mockVenues } from '@/src/data/mock-data';

/** All venue IDs used for static export deep linking. */
export const VENUE_IDS = mockVenues.map((venue) => venue.id);

export function generateVenueStaticParams() {
  return VENUE_IDS.map((id) => ({ id }));
}
