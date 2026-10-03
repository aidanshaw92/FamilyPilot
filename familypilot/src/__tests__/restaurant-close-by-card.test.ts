import { describe, expect, it } from 'vitest';

import { restaurantFactsLine, restaurantHoursLine, restaurantTravelLine } from '@/src/utils/restaurant-card-lines';
import { FoodCandidate } from '@/src/types/nearby-food';
import { TravelLeg } from '@/src/types/travel';

const candidate = (over: Partial<FoodCandidate>): FoodCandidate =>
  ({ familypilotId: 'f1', externalId: 'osm-1', provider: 'osm', name: 'Cafe', category: 'cafe', latitude: 0, longitude: 0,
     distanceKm: 0.4, cuisine: null, openingHours: null, address: null, website: null, phone: null, tagged: {}, travel: [], ...over }) as FoodCandidate;

describe('restaurant card lines', () => {
  it('says what OpenStreetMap tagged, and says plainly when it tagged nothing', () => {
    expect(restaurantFactsLine(candidate({ tagged: { highchair: true, changingTable: true } }))).toEqual({ text: 'Highchairs · Baby changing', recorded: true });
    expect(restaurantFactsLine(candidate({}))).toEqual({ text: 'Nobody has recorded facilities for children here', recorded: false });
  });

  it('states hours, or states that none are listed', () => {
    expect(restaurantHoursLine(candidate({ openingHours: 'Mo-Su 11:00-22:00' }))).toEqual({ text: 'Hours: Mo-Su 11:00-22:00', recorded: true });
    expect(restaurantHoursLine(candidate({}))).toEqual({ text: 'Hours not listed', recorded: false });
  });

  it('leads with the walk and never calls an estimate a routed journey', () => {
    const legs = [
      { mode: 'drive', durationMinutes: 4, source: 'estimated-distance' },
      { mode: 'walk', durationMinutes: 6, source: 'estimated-distance' },
    ] as unknown as TravelLeg[];
    const line = restaurantTravelLine(legs);
    expect(line).toMatch(/walk/);
    expect(line).toMatch(/about|estimated/i);
    expect(restaurantTravelLine([])).toBeNull();
  });
});
