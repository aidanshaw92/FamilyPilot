import { describe, expect, it } from 'vitest';

import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import type { PlanningFamily } from '@/src/services/planning/planner';
import type { StopLocation, StopRequest } from '@/src/types/journey-matrix-build';
import type { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * What a routed plan would actually COST, measured against the implementation rather than read off it.
 *
 * The Section 7 audit derived `F + S x (S - 1 + F)` billable elements by reading planProbes. A formula
 * derived by reading is a hypothesis: these run the real builder with a probe that records request
 * shapes instead of calling a provider, and compare. The numbers in the cost model come from here.
 *
 * Kept as a test rather than a script so that a later change to the probe plan -- adding a leg,
 * batching origins, routing a second mode -- fails loudly instead of quietly changing a bill.
 */

const facts = (placeId: string): MatchableVenueFacts =>
  ({
    placeId,
    name: placeId,
    category: 'park',
    driveMinutes: 0,
    enrichmentStatus: 'provider_only',
    minRecommendedAge: null,
    maxRecommendedAge: null,
  }) as MatchableVenueFacts;

const stops = (count: number): StopRequest[] =>
  Array.from({ length: count }, (_, i) => ({
    placeId: `stop-${i}`,
    name: `Stop ${i}`,
    role: i === 0 ? 'anchor' : 'meal',
    anchor: i === 0,
    dwellMinutes: 90,
    facts: facts(`stop-${i}`),
  })) as StopRequest[];

const families = (count: number): PlanningFamily[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `family-${i}`,
    label: `Family ${i}`,
    area: 'London',
    latitude: 51.6 + i * 0.02,
    longitude: -0.3 - i * 0.02,
    ages: [4],
    maxDriveMinutes: 90,
    budgetTier: 'moderate',
    pushchair: true,
    required: [],
    routines: [],
  })) as PlanningFamily[];

const locations = (stopCount: number): StopLocation[] =>
  Array.from({ length: stopCount }, (_, i) => ({
    placeId: `stop-${i}`,
    latitude: 51.5 + i * 0.01,
    longitude: -0.12 + i * 0.01,
  }));

/** Runs the builder, counting origins x destinations exactly as Distance Matrix would bill it. */
async function measure(stopCount: number, familyCount: number) {
  const shapes: Array<{ origins: number; destinations: number }> = [];

  await buildJourneyMatrix(
    {
      stops: stops(stopCount),
      families: families(familyCount),
      locations: locations(stopCount),
    },
    {
      probe: async (probe) => {
        shapes.push({ origins: 1, destinations: probe.destinations.length });
        return {
          journeys: probe.destinations.map((destination) => ({
            placeId: destination.placeId,
            driveMinutes: 10,
            source: 'live' as const,
          })),
        };
      },
      planDate: '2026-10-03',
      today: '2026-10-03',
    },
  );

  return {
    requests: shapes.length,
    elements: shapes.reduce((total, shape) => total + shape.origins * shape.destinations, 0),
  };
}

const formula = (S: number, F: number) => F + S * (S - 1 + F);

describe('the audit formula holds against the real builder', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [2, 2],
    [3, 2],
  ])('S=%i stops, F=%i families matches F + S(S-1+F)', async (S, F) => {
    const measured = await measure(S, F);
    expect(measured.elements).toBe(formula(S, F));
  });
});

describe('what a routed plan would cost, by shape', () => {
  it('a single activity for one household is 2 elements', async () => {
    expect((await measure(1, 1)).elements).toBe(2);
  });

  it('an activity plus a real lunch stop is 5 elements', async () => {
    // The cost of Section 12, stated as a number: three more elements than today's plan.
    expect((await measure(2, 1)).elements).toBe(5);
  });

  it('activity, lunch and a second activity is 10 elements', async () => {
    expect((await measure(3, 1)).elements).toBe(10);
  });

  it('three stops for two households is 14 elements', async () => {
    // The halfway-family future, priced now so it is not a surprise later.
    //
    // The audit document first wrote 17 here. The formula was right and my arithmetic was not:
    // 2 + 3 x (3 - 1 + 2) is 14. Which is the reason this file exists rather than a table typed by
    // hand -- the cost model's numbers now come from running the builder.
    expect((await measure(3, 2)).elements).toBe(14);
  });

  it('issues one request per origin, so requests and elements are different numbers', async () => {
    const measured = await measure(3, 1);
    expect(measured.requests).toBe(4);
    expect(measured.elements).toBe(10);
    // The whole reason the budget had to change: these are not the same figure.
    expect(measured.requests).not.toBe(measured.elements);
  });
});

describe('the shape stays inside what the provider accepts', () => {
  it('no single request exceeds the provider destination cap', async () => {
    // A request past 25 destinations is silently truncated by Distance Matrix, so a plan that grew
    // past it would quietly lose legs. The builder asserts this; this proves the assertion is live.
    await expect(measure(30, 1)).rejects.toThrow(/beyond the provider's limit/i);
  });
});
