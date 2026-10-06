import { fetchLiveWeatherSafe } from '@/src/services/context/live-context';
import { getPlacesRepository } from '@/src/services/places/places-repository';
import { FamilyProfile, Venue, WeatherInfo } from '@/src/types';
import { isVisitableVenue } from '@/src/utils/opening-today';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { compareTravelMinutes } from '@/src/utils/travel-time';

/**
 * Home's list: loaded fresh, or shown from what the device kept while a fresh one loads.
 *
 * Kept apart from `services/api` (which reaches React Native) so the loading rules can be tested directly.
 */

/**
 * How long Home's list waits for the weather. Weather only nudges the ranking, so a slow or silent weather provider must
 * not hold the whole list back: past this it ranks without weather, exactly as it already does when weather fails.
 */
export const HOME_WEATHER_WAIT_MS = 2500;

function weatherWithin(profile: FamilyProfile, ms: number): Promise<WeatherInfo | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    fetchLiveWeatherSafe(profile),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The visitable venues, personalised for this family and ranked: one definition for the fresh and the kept list.
 *
 * Explore is a London-wide discovery surface. Do not apply the normal max-drive cut-off here; keep travel time visible and
 * let the parent filter it explicitly when they want to. A venue that is shut for the whole of today is excluded, though:
 * never let the top of Home's main list be somewhere a family can't actually go today. "Today" is worked out from the
 * weekly schedule and the clock (opening-today.ts), NOT from the provider's stored open-now flag, which is a snapshot from
 * when the search ran and was hiding every farm and most museums for the day after a night-time refresh.
 */
export function rankForFamily(venues: Venue[], profile: FamilyProfile, weather: WeatherInfo | null): Venue[] {
  return venues
    .filter((venue) => isVisitableVenue(venue))
    .map((venue) => personaliseVenue(venue, profile, weather))
    .sort((a, b) => b.familyScore.score - a.familyScore.score || compareTravelMinutes(a.driveMinutes, b.driveMinutes));
}

/**
 * The fresh list. Weather is a soft scoring input, not the primary thing being loaded: it is fetched alongside the venue
 * search, never allowed to take the search down (fetchLiveWeatherSafe resolves to null on failure), and given a short
 * budget (HOME_WEATHER_WAIT_MS), where Home used to wait for it with no limit. There is no artificial delay: a list already
 * on the device is returned at once.
 */
export async function loadHomeList(profile: FamilyProfile): Promise<Venue[]> {
  const [venues, weather] = await Promise.all([
    getPlacesRepository().searchNearby(profile),
    weatherWithin(profile, HOME_WEATHER_WAIT_MS),
  ]);
  return rankForFamily(venues, profile, weather);
}

/**
 * The list this device last loaded, re-ranked for the family as it is NOW, for Home to show while a fresh one loads
 * (stale-while-revalidate). Device-only: no request, no spend. Null when nothing showable is held. Ranked without weather,
 * so it never waits on anything; the fresh list replaces it on the same screen.
 */
export async function loadKeptHomeList(profile: FamilyProfile): Promise<Venue[] | null> {
  const venues = await getPlacesRepository().cachedNearby(profile);
  return venues ? rankForFamily(venues, profile, null) : null;
}

/** Starts Home's (family-independent) search early: see `PlacesRepository.prefetchNearby`. */
export function prefetchHomeList(): void {
  getPlacesRepository().prefetchNearby();
}
