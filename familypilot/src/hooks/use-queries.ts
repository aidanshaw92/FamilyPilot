import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  carFitService,
  familyService,
  holidayService,
  inventoryService,
  packingService,
  recommendationService,
  savedService,
  tripService,
  venueService,
  weatherService,
} from '@/src/services/api';
import { useFamilyStore } from '@/src/stores/family-store';
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
