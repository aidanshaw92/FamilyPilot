import { describe, expect, it } from 'vitest';

import {
  mealFromFoodCandidate,
  planStopFromFoodCandidate,
} from '@/src/services/planning/day-plan';
import { createPlanSteps } from '@/src/services/planning/create-plan';
import type { FoodCandidate } from '@/src/types/nearby-food';
import { estimatedLeg, isRouted, routedLeg } from '@/src/types/travel';

/**
 * Section 12: a real OpenStreetMap restaurant becomes a lunch stop the planner can place.
 *
 * The point of these is what the stop must NOT claim. OpenStreetMap cannot confirm toilets, baby
 * changing or parking, and a lunch stop that silently asserted them would make a day look suitable on
 * evidence nobody has. Unknown stays unknown.
 */

const candidate = (over: Partial<FoodCandidate> = {}): FoodCandidate => ({
  familypilotId: 'fp-osm-node-9001',
  externalId: 'osm:node/9001',
  provider: 'osm',
  name: 'The Mapped Kitchen',
  category: 'restaurant',
  latitude: 51.5096,
  longitude: -0.1278,
  distanceKm: 0.24,
  cuisine: 'italian',
  openingHours: 'Mo-Su 11:00-22:00',
  address: '4 Fixture Lane',
  website: null,
  phone: null,
  tagged: { highchair: true },
  travel: [estimatedLeg('walk', 6), estimatedLeg('drive', 2)],
  ...over,
});

describe('a discovered restaurant becomes a stop the planner can place', () => {
  it('carries the identity, name, coordinates and category the planner needs', () => {
    const stop = planStopFromFoodCandidate(candidate());
    expect(stop.placeId).toBe('fp-osm-node-9001');
    expect(stop.name).toBe('The Mapped Kitchen');
    expect(stop.latitude).toBeCloseTo(51.5096);
    expect(stop.longitude).toBeCloseTo(-0.1278);
    expect(stop.category).toBe('restaurant');
  });

  it('maps a cafe to cafe and a quick-service place to restaurant', () => {
    expect(planStopFromFoodCandidate(candidate({ category: 'cafe' })).category).toBe('cafe');
    // The planner has no fast_food category, and a quick-service place is a restaurant for every
    // purpose the planner has.
    expect(planStopFromFoodCandidate(candidate({ category: 'fast_food' })).category).toBe('restaurant');
  });

  it('asserts NO family facts, because OpenStreetMap cannot confirm any', () => {
    // The defect this prevents: a lunch stop reporting a household's must-haves as met on the strength
    // of an OSM tag, so a day looks suitable on evidence nobody has.
    const stop = planStopFromFoodCandidate(candidate({ tagged: { highchair: true, wheelchair: true } }));
    expect(stop.facts).toBeUndefined();
    expect(stop.familyMetadata).toBeUndefined();
  });

  it('asserts no opening status, even when OpenStreetMap mapped an hours expression', () => {
    // The raw expression is not parsed anywhere in this path, so claiming open or closed from it would
    // be a guess. Absent is what the sequencer already treats as unknown.
    const stop = planStopFromFoodCandidate(candidate({ openingHours: 'Mo-Su 11:00-22:00' }));
    expect(stop.isOpen).toBeUndefined();
    expect(stop.openingHours).toBeUndefined();
  });

  it('carries the candidate travel legs through, with their provenance intact', () => {
    const meal = mealFromFoodCandidate(candidate());
    expect(meal.travel.map((leg) => leg.mode)).toEqual(['walk', 'drive']);
    expect(meal.travel.every((leg) => leg.source === 'estimated-distance')).toBe(true);
    expect(meal.travel.every((leg) => !isRouted(leg))).toBe(true);
  });
});

describe('the generating sequence tells the truth about the lunch it is adding', () => {
  it('hedges the walk, because the number is a straight-line estimate', () => {
    const steps = createPlanSteps({ venueName: 'Kentish Town City Farm', meal: mealFromFoodCandidate(candidate()) });
    const lunch = steps.find((step) => step.id === 'lunch');
    expect(lunch?.label).toBe('Finding lunch about a 6-minute walk away');
    // "within" would be a promise. The straight line does not support one.
    expect(lunch?.label).not.toContain('within');
  });

  it('omits the lunch step entirely when there is no candidate', () => {
    const steps = createPlanSteps({ venueName: 'Kentish Town City Farm' });
    expect(steps.map((step) => step.id)).not.toContain('lunch');
  });

  it('names the place when the only option is a drive', () => {
    const meal = mealFromFoodCandidate(candidate({ travel: [estimatedLeg('drive', 4)] }));
    const lunch = createPlanSteps({ venueName: 'Anywhere', meal }).find((s) => s.id === 'lunch');
    expect(lunch?.label).toBe('Adding lunch at The Mapped Kitchen');
  });
});

describe('the leg shape is ready for routing without another rewrite', () => {
  it('a routed leg is distinguishable from an estimated one by its own field', () => {
    expect(isRouted(routedLeg('drive', 8))).toBe(true);
    expect(isRouted(estimatedLeg('drive', 8))).toBe(false);
    expect(isRouted({ source: 'cached-route' })).toBe(true);
  });

  it('a routed leg carries high confidence and an estimated walk carries low', () => {
    expect(routedLeg('drive', 8).confidence).toBe('high');
    // A detour factor on a straight line models a walk badly: pedestrian routes bend around blocks,
    // crossings and rivers, and a river between two points can double the real journey.
    expect(estimatedLeg('walk', 8).confidence).toBe('low');
    expect(estimatedLeg('drive', 8).confidence).toBe('medium');
  });

  it('a leg can name its origin and destination, so two households are expressible later', () => {
    // Section 14: no halfway planning now, but an interface that could never express
    // origin A + origin B -> shared destination would make it a rewrite rather than an addition.
    const leg = routedLeg('drive', 12, { from: 'family-a', to: 'fp-osm-node-9001' });
    expect(leg.from).toBe('family-a');
    expect(leg.to).toBe('fp-osm-node-9001');
    const other = routedLeg('drive', 20, { from: 'family-b', to: 'fp-osm-node-9001' });
    expect([leg, other].map((l) => l.from)).toEqual(['family-a', 'family-b']);
    expect(new Set([leg.to, other.to]).size).toBe(1);
  });

  it('never rounds a duration below a minute', () => {
    expect(estimatedLeg('walk', 0.2).durationMinutes).toBe(1);
    expect(routedLeg('drive', 0).durationMinutes).toBe(1);
  });
});
