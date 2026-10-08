import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  carFitService,
  familyService,
  holidayService,
  inventoryService,
  packingService,
  recommendationService,
  restaurantService,
  savedService,
  tripService,
  venueService,
  weatherService,
} from '@/src/services/api';
import { fetchParentObservations } from '@/src/services/planning/parent-observation-fetch';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { useDayRequestStore } from '@/src/stores/day-request-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { useFiltersStore } from '@/src/stores/filters-store';
import { useSavedStore } from '@/src/stores/saved-store';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { FamilyProfile } from '@/src/types';
import { fetchNearbyFood } from '@/src/services/places/nearby-food-client';
import { venueDetailPlaceholder } from '@/src/services/venue-detail-seed';
import { BetweenHome } from '@/src/services/places/between-client';
import { resolveHomeVenues } from '@/src/utils/home-venues-state';

export function useProfileRevision() {
  return useFamilyStore((s) => s.profileRevision);
}

export function useFamilyProfile() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['family', 'profile', profileRevision],
    queryFn: familyService.getProfile,
    // The profile is on the device: the first frame already has it (no "Good evening, there" before the name).
    initialData: familyService.getProfileNow,
  });
}

export function useUpdateFamilyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<FamilyProfile>) => familyService.updateProfile(updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['family'] });
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      void queryClient.invalidateQueries({ queryKey: ['venues'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['eat-nearby'] });
      void queryClient.invalidateQueries({ queryKey: ['saved'] });
      void queryClient.invalidateQueries({ queryKey: ['car-fit'] });
    },
  });
}

export function useWeather() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['weather', 'current', profileRevision],
    queryFn: weatherService.getCurrent,
  });
}

export function useNearbyVenues(options: { enabled?: boolean } = {}) {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['venues', 'nearby', profileRevision],
    queryFn: venueService.getNearby,
    enabled: options.enabled ?? true,
  });
}

/**
 * Home's list, never a blank wait when the device already has one.
 *
 * Two queries: the fresh list (`useNearbyVenues`, the same query Explore uses) and the last list this device loaded,
 * re-ranked for the family as it is now (`getNearbyCached`, device-only, no request). Home shows the fresh list when it
 * has it and the kept one until then, so a returning parent sees their picks at once and they are refreshed in place.
 * Only when neither exists is Home loading; only when the fresh load failed AND nothing is kept is it an error.
 */
export function useHomeVenues() {
  const profileRevision = useProfileRevision();
  const live = useNearbyVenues();
  const kept = useQuery({
    queryKey: ['venues', 'nearby-kept', profileRevision],
    queryFn: venueService.getNearbyCached,
    staleTime: Infinity,
    retry: false,
  });
  return { ...resolveHomeVenues({ live, kept }), refetch: live.refetch };
}

/**
 * Meet Halfway's candidate places: the stored catalogue between two homes, NOT Home's list. Keyed on the homes (rounded to
 * about a kilometre, which is all a connection shares) so choosing the same family again reuses the answer.
 */
export function useBetweenVenues(a: BetweenHome | null, b: BetweenHome | null) {
  const profileRevision = useProfileRevision();
  const key = (home: BetweenHome | null) => [home?.latitude.toFixed(3), home?.longitude.toFixed(3), home?.maxDriveMinutes];
  return useQuery({
    queryKey: ['venues', 'between', profileRevision, ...key(a), ...key(b)],
    queryFn: () => venueService.getBetween(a!, b!),
    enabled: Boolean(a && b),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}

/**
 * One place, in full. With `showCardWhileLoading`, and when the parent arrived from a card, `placeholderData` stands in
 * for it until the detail request returns, so the screen can show what the card already knew instead of a blank skeleton
 * (see `venue-detail-seed`). While `isPlaceholderData` is true the data is the CARD, not the place: never evidence, never
 * stored, and replaced wholesale by the real detail.
 */
export function useVenue(id: string, options: { showCardWhileLoading?: boolean } = {}) {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['venues', id, profileRevision],
    queryFn: () => venueService.getById(id),
    enabled: Boolean(id),
    // OPT-IN, and only for the screen that knows how to draw a card honestly (it draws identity, never evidence, until the
    // full detail is in). Anything else that reads a venue (planning, the restaurant page) must get the real detail or
    // nothing: a plan built from a card's partial opening hours would be built on data nobody checked.
    placeholderData: options.showCardWhileLoading ? () => venueDetailPlaceholder(id) : undefined,
  });
}

/**
 * What other parents have reported about a venue, read AFTER the page is up. It never gates the screen: the page draws the
 * venue's own facts at once and applies a verified correction when (and if) this resolves, a single read of the public
 * summary that is capped at three seconds and resolves to nothing on any failure. `enabled` is the page saying the full
 * detail is in, so a card-only placeholder never triggers a request. Keyed on the venue only: reports are about the place,
 * not the family.
 */
export function useParentObservations(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['venues', id, 'parent-observations'],
    queryFn: () => fetchParentObservations(id),
    enabled: enabled && Boolean(id),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/**
 * Places to eat near a venue.
 *
 * Keyed on the ANCHOR's coordinates rather than on the venue id, because the answer depends only on
 * where the venue is: two venues in the same building share a cached row, and the server's stored
 * cache is keyed the same way. `staleTime` is six hours to match that stored TTL, so a parent moving
 * between screens never re-requests, and `enabled` keeps the lookup from firing before coordinates
 * exist -- a request with undefined coordinates would be a wasted Overpass call.
 */
export function useNearbyFood(anchor: { latitude?: number; longitude?: number; placeId?: string }) {
  const latitude = anchor.latitude;
  const longitude = anchor.longitude;
  return useQuery({
    queryKey: ['nearby-food', latitude?.toFixed(4), longitude?.toFixed(4)],
    queryFn: () =>
      fetchNearbyFood({ latitude: latitude!, longitude: longitude!, placeId: anchor.placeId }),
    enabled: Number.isFinite(latitude) && Number.isFinite(longitude),
    staleTime: 6 * 60 * 60 * 1000,
    // One retry only. Overpass is public infrastructure and the provider already retries once with a
    // narrower query, so more attempts here would multiply the load rather than improve the odds.
    retry: 1,
  });
}

export function useHomeRecommendations() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['recommendations', 'home', profileRevision],
    queryFn: recommendationService.getHomeRecommendations,
    enabled: false,
  });
}

export function useFocusedRecommendations(request: import('@/src/types/day-request').DayRequest | null) {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['recommendations', 'focused', profileRevision, request],
    queryFn: () => recommendationService.getFocusedRecommendations(request!),
    enabled: Boolean(request),
  });
}

/** Ensures Home has a proactive day request before the parent types anything. */
export function useProactiveHomeRequest() {
  const { data: profile } = useFamilyProfile();
  const parsedRequest = useDayRequestStore((state) => state.parsedRequest);
  const requestSource = useDayRequestStore((state) => state.requestSource);
  const setParsedRequest = useDayRequestStore((state) => state.setParsedRequest);

  useEffect(() => {
    if (!profile || requestSource === 'user') return;
    const proactiveRequest = buildProactiveDayRequest(profile);
    setParsedRequest(proactiveRequest, 'proactive');
  }, [profile, requestSource, setParsedRequest]);

  return {
    parsedRequest,
    requestSource,
    isProactive: requestSource === 'proactive',
  };
}

export function useRecentVenues() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['venues', 'recent', profileRevision],
    queryFn: recommendationService.getRecentVenues,
  });
}

export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: tripService.getTrips,
  });
}

export function useSavedItems() {
  const profileRevision = useProfileRevision();
  const savedVersion = useSavedStore((state) =>
    state.items.map((item) => `${item.venue.id}:${item.savedAt ?? ''}`).join('|'),
  );
  return useQuery({
    queryKey: ['saved', profileRevision, savedVersion],
    queryFn: savedService.getSaved,
  });
}

export function useNearbyStores() {
  return useQuery({
    queryKey: ['inventory', 'nearby'],
    queryFn: inventoryService.getNearbyStores,
  });
}

export function useCarFit() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['car-fit', profileRevision],
    queryFn: carFitService.getCarFit,
  });
}

export function usePackingList() {
  return useQuery({
    queryKey: ['packing'],
    queryFn: packingService.getPackingList,
  });
}

export function useHolidayOffers() {
  return useQuery({
    queryKey: ['holidays'],
    queryFn: holidayService.getOffers,
  });
}

export function useRestaurants() {
  const profileRevision = useProfileRevision();
  const { categoryFilter, exploreMaxDrive, exploreBudget, advancedFilters } =
    useFiltersStore();
  const isRestaurantCategory =
    categoryFilter === 'restaurants' && isPilotFeatureVisible('explore_restaurants');

  return useQuery({
    queryKey: [
      'restaurants',
      profileRevision,
      categoryFilter,
      exploreMaxDrive,
      exploreBudget,
      advancedFilters,
    ],
    queryFn: () =>
      isRestaurantCategory
        ? restaurantService.getFiltered(advancedFilters, exploreMaxDrive, exploreBudget)
        : restaurantService.getAll(),
    enabled: isRestaurantCategory,
  });
}

export function useRestaurant(id: string, activityVenueId?: string) {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['restaurants', id, activityVenueId, profileRevision],
    queryFn: () => restaurantService.getById(id, activityVenueId),
    enabled: Boolean(id) && isPilotFeatureVisible('explore_restaurants'),
  });
}

export function useEatNearby(activityVenueId: string | undefined) {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['eat-nearby', activityVenueId, profileRevision],
    queryFn: () => restaurantService.getEatNearby(activityVenueId!),
    enabled: Boolean(activityVenueId),
  });
}
