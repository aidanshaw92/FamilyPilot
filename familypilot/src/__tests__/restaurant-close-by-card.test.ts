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

describe('the restaurant card says whether it is open, from the hours it has', () => {
  const candidate = (over: Partial<FoodCandidate> = {}): FoodCandidate => ({
    familypilotId: 'osm-1', externalId: 'osm:1', provider: 'osm', name: 'Test Cafe', category: 'cafe', latitude: 51.5, longitude: -0.1,
    distanceKm: 0.4, cuisine: null, openingHours: null, address: null, website: null, phone: null, tagged: {}, travel: [], ...over,
  });
  const tuesdayNoon = new Date('2026-10-06T12:00:00+01:00');

  it('works out open now from readable OpenStreetMap hours', async () => {
    const { restaurantOpenLine } = await import('@/src/utils/restaurant-card-lines');
    expect(restaurantOpenLine(candidate({ openingHours: 'Mo-Su 11:00-22:00' }), tuesdayNoon)).toEqual({ text: 'Open until 10pm', state: 'open_now' });
    expect(restaurantOpenLine(candidate({ openingHours: 'Mo-Su 08:00-11:00' }), tuesdayNoon).state).toBe('closed_for_today');
  });

  it('shows the raw text when the hours are not in a form it can read, and never guesses open or closed', async () => {
    const { restaurantOpenLine } = await import('@/src/utils/restaurant-card-lines');
    expect(restaurantOpenLine(candidate({ openingHours: 'Mo-Fr sunrise-sunset' }), tuesdayNoon)).toEqual({ text: 'Hours: Mo-Fr sunrise-sunset', state: 'listed' });
  });

  it('says hours are not listed when there are none, which is different from closed', async () => {
    const { restaurantOpenLine } = await import('@/src/utils/restaurant-card-lines');
    expect(restaurantOpenLine(candidate(), tuesdayNoon)).toEqual({ text: 'Hours not listed', state: 'not_listed' });
  });

  it('lists only the facilities OpenStreetMap recorded', async () => {
    const { restaurantFacilityChips } = await import('@/src/utils/restaurant-card-lines');
    expect(restaurantFacilityChips(candidate({ tagged: { highchair: true, changingTable: true } }))).toEqual(['Highchairs', 'Baby changing']);
    expect(restaurantFacilityChips(candidate())).toEqual([]);
  });
});
