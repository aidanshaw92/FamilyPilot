import { describe, expect, it, vi } from 'vitest';

import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { PlanningFamily } from '@/src/services/planning/planner';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { StopRequest } from '@/src/types/day-sequence';
import {
  BuildJourneyMatrixInput,
  JourneyProbe,
  JourneyProbeResult,
  PROVIDER_MAX_DESTINATIONS,
  StopLocation,
} from '@/src/types/journey-matrix-build';

/**
 * The builder is the only network boundary in the JourneyMatrix / new sequencer path, so these
 * drive it through a stubbed probe — including the degraded answers the real endpoint gives when
 * Google declines an element or the key is missing entirely.
 */

const TODAY = '2026-09-22';

const facts = (placeId: string): MatchableVenueFacts => ({
  placeId,
  name: placeId,
  category: 'museum',
  driveMinutes: 0,
  enrichmentStatus: 'verified',
  minRecommendedAge: 0,
  maxRecommendedAge: 12,
  venueAgeRestriction: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  pushchairSuitability: 'good',
  environment: 'indoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 90,
  estimatedSpend: 'Free',
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
});

const stop = (placeId: string, anchor = false, role: StopRequest['role'] = 'activity'): StopRequest => ({
  placeId,
  name: placeId,
  role,
  anchor,
  dwellMinutes: 60,
  facts: facts(placeId),
});

const location = (placeId: string, latitude: number, longitude: number): StopLocation => ({
  placeId,
  latitude,
  longitude,
});

const family = (id: string, latitude: number, longitude: number): PlanningFamily => ({
  id,
  label: `Family ${id.toUpperCase()}`,
  area: 'Town',
  latitude,
  longitude,
  ages: [4],
  maxDriveMinutes: 60,
  budgetTier: 'moderate',
  pushchair: true,
  required: [],
  routines: [],
});

const ANCHOR = 'fp-anchor';
const MEAL = 'fp-meal';
const EXTRA = 'fp-extra';

/**
 * A stub that answers from a table of `${originKey}->${destinationKey}` entries. Anything absent
 * from the table is simply not returned, which is exactly how the real endpoint drops an element
 * Google declined.
 */
const probeFrom = (
  table: Record<string, { minutes: number; source: 'live' | 'estimated' }>,
  originOf: (probe: JourneyProbe) => string,
) =>
  vi.fn(async (probe: JourneyProbe): Promise<JourneyProbeResult> => {
    const origin = originOf(probe);
    return {
      journeys: probe.destinations
        .map((destination) => {
          const entry = table[`${origin}->${destination.placeId}`];
          return entry
            ? { placeId: destination.placeId, driveMinutes: entry.minutes, source: entry.source }
            : null;
        })
        .filter((journey): journey is NonNullable<typeof journey> => journey !== null),
    };
  });

/** Origins are identified by coordinates, since the probe carries no key of its own. */
const COORDS: Record<string, string> = {
  '51.1,-0.1': homeKey('a'),
  '51.2,-0.2': homeKey('b'),
  '51.5,-0.5': stopKey(ANCHOR),
  '51.6,-0.6': stopKey(MEAL),
  '51.7,-0.7': stopKey(EXTRA),
};
const originOf = (probe: JourneyProbe) =>
  COORDS[`${probe.origin.latitude},${probe.origin.longitude}`] ?? 'unknown';

const twoFamilyInput: BuildJourneyMatrixInput = {
  families: [family('a', 51.1, -0.1), family('b', 51.2, -0.2)],
  stops: [stop(ANCHOR, true), stop(MEAL, false, 'meal')],
  locations: [location(ANCHOR, 51.5, -0.5), location(MEAL, 51.6, -0.6)],
};

const TABLE = {
  [`${homeKey('a')}->${stopKey(ANCHOR)}`]: { minutes: 20, source: 'live' as const },
  [`${homeKey('b')}->${stopKey(ANCHOR)}`]: { minutes: 35, source: 'live' as const },
  [`${stopKey(ANCHOR)}->${stopKey(MEAL)}`]: { minutes: 15, source: 'live' as const },
  [`${stopKey(MEAL)}->${stopKey(ANCHOR)}`]: { minutes: 14, source: 'live' as const },
  [`${stopKey(ANCHOR)}->${homeKey('a')}`]: { minutes: 26, source: 'live' as const },
  [`${stopKey(ANCHOR)}->${homeKey('b')}`]: { minutes: 41, source: 'live' as const },
  [`${stopKey(MEAL)}->${homeKey('a')}`]: { minutes: 22, source: 'live' as const },
  [`${stopKey(MEAL)}->${homeKey('b')}`]: { minutes: 38, source: 'live' as const },
};

describe('per-family journeys', () => {
  it('keeps two families’ different home to anchor durations', async () => {
    const probe = probeFrom(TABLE, originOf);
    const { matrix, missing } = await buildJourneyMatrix(twoFamilyInput, {
      probe,
      planDate: TODAY,
      today: TODAY,
    });

    expect(matrix.legs[homeKey('a')][stopKey(ANCHOR)].minutes).toBe(20);
    expect(matrix.legs[homeKey('b')][stopKey(ANCHOR)].minutes).toBe(35);
    expect(missing).toEqual([]);
  });

  it('measures the way home separately from the way out', async () => {
    const probe = probeFrom(TABLE, originOf);
    const { matrix } = await buildJourneyMatrix(twoFamilyInput, {
      probe,
      planDate: TODAY,
      today: TODAY,
    });

    // Different origins, so asymmetry is measured rather than assumed — the single-venue planner
    // still sets inbound equal to outbound, which this deliberately does not copy.
    expect(matrix.legs[homeKey('a')][stopKey(ANCHOR)].minutes).toBe(20);
    expect(matrix.legs[stopKey(ANCHOR)][homeKey('a')].minutes).toBe(26);
    expect(matrix.legs[stopKey(ANCHOR)][stopKey(MEAL)].minutes).toBe(15);
    expect(matrix.legs[stopKey(MEAL)][stopKey(ANCHOR)].minutes).toBe(14);
  });

  it('gives every stop a way home for every family, since any stop can be the last', async () => {
    const probe = probeFrom(TABLE, originOf);
    const { matrix } = await buildJourneyMatrix(twoFamilyInput, {
      probe,
      planDate: TODAY,
      today: TODAY,
    });

    for (const from of [stopKey(ANCHOR), stopKey(MEAL)]) {
      for (const to of [homeKey('a'), homeKey('b')]) {
        expect(matrix.legs[from][to], `${from} -> ${to}`).toBeDefined();
      }
    }
  });
});

describe('provenance', () => {
  it('takes each element’s own source, never the batch’s', async () => {
    // One live element in a batch must not make its neighbours live.
    const mixed = {
      ...TABLE,
      [`${stopKey(ANCHOR)}->${homeKey('a')}`]: { minutes: 26, source: 'estimated' as const },
      [`${stopKey(ANCHOR)}->${stopKey(MEAL)}`]: { minutes: 15, source: 'live' as const },
      [`${stopKey(ANCHOR)}->${homeKey('b')}`]: { minutes: 41, source: 'estimated' as const },
    };
    const { matrix, provenance } = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(mixed, originOf),
      planDate: TODAY,
      today: TODAY,
    });

    const fromAnchor = matrix.legs[stopKey(ANCHOR)];
    expect(fromAnchor[stopKey(MEAL)].source).toBe('live');
    expect(fromAnchor[homeKey('a')].source).toBe('estimated');
    expect(fromAnchor[homeKey('b')].source).toBe('estimated');
    expect(provenance.live + provenance.estimated).toBe(8);
    expect(provenance.estimated).toBeGreaterThan(0);
  });

  it('keeps a provider-estimated leg present and labelled, not absent', async () => {
    const allEstimated = Object.fromEntries(
      Object.entries(TABLE).map(([key, value]) => [key, { ...value, source: 'estimated' as const }]),
    );
    const { matrix, missing, provenance } = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(allEstimated, originOf),
      planDate: TODAY,
      today: TODAY,
    });

    expect(missing).toEqual([]);
    expect(provenance).toEqual({ live: 0, estimated: 8 });
    expect(matrix.legs[homeKey('a')][stopKey(ANCHOR)]).toEqual({ minutes: 20, source: 'estimated' });
  });

  it('reports no downgrade for a future date the provider had already estimated', async () => {
    // Nothing was taken away, so nothing was downgraded. Reading `trafficDowngraded` off the date
    // alone would describe a loss that never happened.
    const allEstimated = Object.fromEntries(
      Object.entries(TABLE).map(([key, value]) => [key, { ...value, source: 'estimated' as const }]),
    );
    const { provenance, trafficDowngraded } = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(allEstimated, originOf),
      planDate: '2026-12-25',
      today: TODAY,
    });

    expect(provenance.live).toBe(0);
    expect(trafficDowngraded).toBe(false);
  });

  it('reports a downgrade only when a live element actually lost its label', async () => {
    const oneLive: Record<string, { minutes: number; source: 'live' | 'estimated' }> =
      Object.fromEntries(
        Object.entries(TABLE).map(([key, value]) => [key, { ...value, source: 'estimated' as const }]),
      );
    oneLive[`${homeKey('a')}->${stopKey(ANCHOR)}`] = { minutes: 20, source: 'live' };

    const future = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(oneLive, originOf),
      planDate: '2026-12-25',
      today: TODAY,
    });
    expect(future.trafficDowngraded).toBe(true);
    expect(future.provenance.live).toBe(0);

    // The same data planned for today keeps its live element and is not a downgrade.
    const todayBuild = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(oneLive, originOf),
      planDate: TODAY,
      today: TODAY,
    });
    expect(todayBuild.trafficDowngraded).toBe(false);
    expect(todayBuild.provenance.live).toBe(1);
  });

  it('never reports a downgrade for a plan made today', async () => {
    const { trafficDowngraded, provenance } = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(TABLE, originOf),
      planDate: TODAY,
      today: TODAY,
    });
    expect(trafficDowngraded).toBe(false);
    expect(provenance.live).toBe(8);
  });

  it('exposes no live leg for a plan on another date', async () => {
    const { matrix, provenance, trafficDowngraded } = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(TABLE, originOf),
      // Every element in TABLE is live; the request still asked for traffic now, which is not
      // traffic on the day being planned.
      planDate: '2026-12-25',
      today: TODAY,
    });

    expect(trafficDowngraded).toBe(true);
    expect(provenance.live).toBe(0);
    expect(provenance.estimated).toBe(8);
    for (const destinations of Object.values(matrix.legs)) {
      for (const journey of Object.values(destinations)) {
        expect(journey.source).toBe('estimated');
      }
    }
  });
});

describe('when the provider comes up short', () => {
  it('treats an element that never came back as an absent leg', async () => {
    const withHole = { ...TABLE };
    delete (withHole as Record<string, unknown>)[`${stopKey(MEAL)}->${homeKey('b')}`];

    const { matrix, missing } = await buildJourneyMatrix(twoFamilyInput, {
      probe: probeFrom(withHole, originOf),
      planDate: TODAY,
      today: TODAY,
    });

    expect(matrix.legs[stopKey(MEAL)]?.[homeKey('b')]).toBeUndefined();
    expect(missing).toEqual([
      { from: stopKey(MEAL), to: homeKey('b'), reason: 'no-element-returned' },
    ]);
    // Everything else survives, so the day is still worth attempting.
    expect(matrix.legs[stopKey(MEAL)][homeKey('a')].minutes).toBe(22);
  });

  it('loses only the failing origin when one probe throws', async () => {
    const probe = vi.fn(async (request: JourneyProbe): Promise<JourneyProbeResult> => {
      if (originOf(request) === stopKey(ANCHOR)) throw new Error('Journey API error 503');
      return probeFrom(TABLE, originOf)(request);
    });

    const { matrix, missing, provenance } = await buildJourneyMatrix(twoFamilyInput, {
      probe,
      planDate: TODAY,
      today: TODAY,
    });

    // The anchor's own outgoing legs are gone...
    expect(matrix.legs[stopKey(ANCHOR)]).toBeUndefined();
    expect(missing.map((leg) => leg.reason)).toEqual(['probe-failed', 'probe-failed', 'probe-failed']);
    expect(missing.every((leg) => leg.from === stopKey(ANCHOR))).toBe(true);

    // ...while every other origin's legs survive, including both rendezvous journeys.
    expect(matrix.legs[homeKey('a')][stopKey(ANCHOR)].minutes).toBe(20);
    expect(matrix.legs[homeKey('b')][stopKey(ANCHOR)].minutes).toBe(35);
    expect(matrix.legs[stopKey(MEAL)][homeKey('a')].minutes).toBe(22);
    expect(provenance.live).toBe(5);
  });
});

describe('the provider’s destination limit', () => {
  const sixFamilies = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
    family(id, 51 + index / 100, -0.1 - index / 100),
  );
  const threeStops = [stop(ANCHOR, true), stop(MEAL, false, 'meal'), stop(EXTRA)];
  const threeLocations = [
    location(ANCHOR, 51.5, -0.5),
    location(MEAL, 51.6, -0.6),
    location(EXTRA, 51.7, -0.7),
  ];

  it('never asks for more than the provider will answer, at the largest allowed day', async () => {
    const probe = vi.fn(async (request: JourneyProbe): Promise<JourneyProbeResult> => ({
      journeys: request.destinations.map((destination) => ({
        placeId: destination.placeId,
        driveMinutes: 20,
        source: 'live' as const,
      })),
    }));

    const { matrix, missing } = await buildJourneyMatrix(
      { families: sixFamilies, stops: threeStops, locations: threeLocations },
      { probe, planDate: TODAY, today: TODAY },
    );

    // 6 homes asking for the anchor, and 3 stops asking for 2 other stops plus 6 homes.
    expect(probe).toHaveBeenCalledTimes(9);
    for (const call of probe.mock.calls) {
      expect(call[0].destinations.length).toBeLessThanOrEqual(PROVIDER_MAX_DESTINATIONS);
    }
    expect(Math.max(...probe.mock.calls.map((call) => call[0].destinations.length))).toBe(8);

    // 6 rendezvous + 6 transfers + 18 returns.
    const legCount = Object.values(matrix.legs).reduce(
      (total, destinations) => total + Object.keys(destinations).length,
      0,
    );
    expect(legCount).toBe(30);
    expect(missing).toEqual([]);
  });

  it('refuses to send a probe past the limit rather than let it be truncated', async () => {
    // The endpoint slices a longer list away silently, so this has to fail loudly here.
    const probe = vi.fn();
    const tooManyFamilies = Array.from({ length: 30 }, (_, index) =>
      family(`f${index}`, 51 + index / 1000, -0.1),
    );

    await expect(
      buildJourneyMatrix(
        { families: tooManyFamilies, stops: threeStops, locations: threeLocations },
        { probe, planDate: TODAY, today: TODAY },
      ),
    ).rejects.toThrow(/beyond the provider's limit of 25/);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('coordinates the day cannot use', () => {
  it('records a family with no usable home as missing rather than probing for it', async () => {
    const probe = probeFrom(TABLE, originOf);
    const { matrix, missing } = await buildJourneyMatrix(
      {
        ...twoFamilyInput,
        families: [family('a', 51.1, -0.1), { ...family('b', 51.2, -0.2), latitude: Number.NaN }],
      },
      { probe, planDate: TODAY, today: TODAY },
    );

    expect(matrix.legs[homeKey('a')][stopKey(ANCHOR)].minutes).toBe(20);
    expect(matrix.legs[homeKey('b')]).toBeUndefined();
    expect(missing.every((leg) => leg.reason === 'invalid-coordinates')).toBe(true);
    expect(missing).toContainEqual({
      from: homeKey('b'),
      to: stopKey(ANCHOR),
      reason: 'invalid-coordinates',
    });
  });
});
