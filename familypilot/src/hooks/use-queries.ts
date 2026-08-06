import { useQuery } from '@tanstack/react-query';

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

export function useFamilyProfile() {
  return useQuery({
    queryKey: ['family', 'profile'],
    queryFn: familyService.getProfile,
  });
}

export function useWeather() {
  return useQuery({
    queryKey: ['weather', 'current'],
    queryFn: weatherService.getCurrent,
  });
}

export function useNearbyVenues() {
  return useQuery({
    queryKey: ['venues', 'nearby'],
    queryFn: venueService.getNearby,
  });
}

export function useVenue(id: string) {
  return useQuery({
    queryKey: ['venues', id],
    queryFn: () => venueService.getById(id),
    enabled: Boolean(id),
  });
}

export function useHomeRecommendations() {
  return useQuery({
    queryKey: ['recommendations', 'home'],
    queryFn: recommendationService.getHomeRecommendations,
  });
}

export function useRecentVenues() {
  return useQuery({
    queryKey: ['venues', 'recent'],
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
  return useQuery({
    queryKey: ['saved'],
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
  return useQuery({
    queryKey: ['car-fit'],
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
