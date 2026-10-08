import { getPlacesRepository } from '@/src/services/places/places-repository';
import { FamilyProfile, Venue } from '@/src/types';
import { isListableVenue } from '@/src/utils/opening-today';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { compareTravelMinutes } from '@/src/utils/travel-time';

/**
 * Home's list: loaded fresh, or shown from what the device kept while a fresh one loads.
 *
 * Kept apart from `services/api` (which reaches React Native) so the loading rules can be tested directly.
 */

/**
 * The listable venues, personalised for this family and ranked: one definition for the fresh and the kept list.
 *
 * Explore is a London-wide discovery surface. Do not apply the normal max-drive cut-off here; keep travel time visible and
 * let the parent filter it explicitly when they want to. A venue shut today is NOT hidden or demoted: how well a place
 * suits a family does not depend on the day it is read, so the list is the same on Monday and Sunday and the card says
 * "Closed today" as a fact (isListableVenue drops only places that are never open to visitors). Nothing here reads the
 * provider's stored open-now flag, a snapshot from when the search ran.
 */
export function rankForFamily(venues: Venue[], profile: FamilyProfile): Venue[] {
  return venues
    .filter((venue) => isListableVenue(venue))
    .map((venue) => personaliseVenue(venue, profile))
    .sort((a, b) => b.familyScore.score - a.familyScore.score || compareTravelMinutes(a.driveMinutes, b.driveMinutes));
}

/**
 * The fresh list. Nothing about today (weather, the clock) is fetched or used to rank it: Family Fit is about the family and
 * the place, so the list loads on the venue search alone, and a slow or silent weather provider can no longer touch it.
 * There is no artificial delay: a list already on the device is returned at once.
 */
export async function loadHomeList(profile: FamilyProfile): Promise<Venue[]> {
  const venues = await getPlacesRepository().searchNearby(profile);
  return rankForFamily(venues, profile);
}

/**
 * The list this device last loaded, re-ranked for the family as it is NOW, for Home to show while a fresh one loads
 * (stale-while-revalidate). Device-only: no request, no spend. Null when nothing showable is held. It never waits on anything; the fresh list replaces it on the same screen.
 */
export async function loadKeptHomeList(profile: FamilyProfile): Promise<Venue[] | null> {
  const venues = await getPlacesRepository().cachedNearby(profile);
  return venues ? rankForFamily(venues, profile) : null;
}

/** Starts Home's (family-independent) search early: see `PlacesRepository.prefetchNearby`. */
export function prefetchHomeList(): void {
  getPlacesRepository().prefetchNearby();
}
