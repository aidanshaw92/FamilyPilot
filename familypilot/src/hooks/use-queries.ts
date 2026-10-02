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
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { useDayRequestStore } from '@/src/stores/day-request-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { useFiltersStore } from '@/src/stores/filters-store';
import { useSavedStore } from '@/src/stores/saved-store';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { FamilyProfile } from '@/src/types';
import { fetchNearbyFood } from '@/src/services/places/nearby-food-client';

export function useProfileRevision() {
  return useFamilyStore((s) => s.profileRevision);
}

export function useFamilyProfile() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['family', 'profile', profileRevision],
    queryFn: familyService.getProfile,
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

export function useNearbyVenues() {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['venues', 'nearby', profileRevision],
    queryFn: venueService.getNearby,
  });
}

export function useVenue(id: string) {
  const profileRevision = useProfileRevision();
  return useQuery({
    queryKey: ['venues', id, profileRevision],
    queryFn: () => venueService.getById(id),
    enabled: Boolean(id),
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
  const { data: weather } = useWeather();
  const parsedRequest = useDayRequestStore((state) => state.parsedRequest);
  const requestSource = useDayRequestStore((state) => state.requestSource);
  const setParsedRequest = useDayRequestStore((state) => state.setParsedRequest);

  useEffect(() => {
    if (!profile || requestSource === 'user') return;
    const proactiveRequest = buildProactiveDayRequest(profile, weather);
    setParsedRequest(proactiveRequest, 'proactive');
  }, [profile, weather, requestSource, setParsedRequest]);

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
