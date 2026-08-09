import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
import { useFamilyStore } from '@/src/stores/family-store';
import { useFiltersStore } from '@/src/stores/filters-store';
import { FamilyProfile } from '@/src/types';

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
  return useQuery({
    queryKey: ['weather', 'current'],
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
    queryKey: ['recommendations', 'focused', profileRevision, request?.rawText, request?.parsedAt],
    queryFn: () => recommendationService.getFocusedRecommendations(request!),
    enabled: Boolean(request),
  });
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
  return useQuery({
    queryKey: ['saved', profileRevision],
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
  const isRestaurantCategory = categoryFilter === 'restaurants';

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
    enabled: Boolean(id),
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
