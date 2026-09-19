import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { GenerateDayPlanDeps, generateDayPlan } from '@/src/services/planning/day-plan';
import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { DayPlanRequest, ResolvedStop } from '@/src/types/day-plan';
import { JourneyMatrix } from '@/src/types/day-sequence';
import { JourneyMatrixBuild, JourneyProbe, JourneyProbeResult } from '@/src/types/journey-matrix-build';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

import { BABYLON_PARK, TEXT_ONLY_PLACE, WHITECHAPEL_GALLERY } from './fixtures/provider-opening-hours';

const { googlePlaceToRecord } = require('../../../server/places/lib/google-places');

/**
 * Orchestration is driven end to end through the real sequencer, with only the matrix builder
 * stubbed. Schedules come through the real provider mapper, so a day is judged against the hours
 * production would actually see.
 */
const schedule = (payload: unknown): OpeningHoursSchedule =>
  googlePlaceToRecord(payload, 'explore').openingHours;

const WHITECHAPEL = schedule(WHITECHAPEL_GALLERY);
const BABYLON = schedule(BABYLON_PARK);
const NO_PERIODS = schedule(TEXT_ONLY_PLACE);

const ANCHOR = 'fp-anchor';
const MEAL = 'fp-meal';
const EXTRA = 'fp-extra';

// 2026-09-22 is a Tuesday. The gallery opens at 11:00 and shuts at 18:00.
const TUESDAY = '2026-09-22';
const MONDAY = '2026-09-21';
const NOW = new Date('2026-09-20T08:00:00Z');

const stop = (
  placeId: string,
  over: Partial<ResolvedStop> = {},
): ResolvedStop => ({
  placeId,
  name: placeId,
  category: 'museum',
  role: 'activity',
  dwellMinutes: 90,
  latitude: 51.5,
  longitude: -0.5,
  openingHours: WHITECHAPEL,
  enrichmentStatus: 'verified',
  familyMetadata: {
    familypilotPlaceId: placeId,
    enrichmentStatus: 'verified',
    minRecommendedAge: 0,
    maxRecommendedAge: 12,
    familyFacilities: { babyChanging: 'yes', toilets: 'yes', parking: 'yes' },
    pushchairSuitability: 'good',
    provenance: {},
    updatedAt: '2026-09-01',
  },
  ...over,
});

const anchor = stop(ANCHOR, { name: 'Whitechapel Gallery' });
const meal = stop(MEAL, {
  name: 'Babylon Park',
  role: 'meal',
  dwellMinutes: 60,
  latitude: 51.6,
  longitude: -0.6,
  openingHours: BABYLON,
});
const extra = stop(EXTRA, {
  name: 'Second Activity',
  dwellMinutes: 60,
  latitude: 51.7,
  longitude: -0.7,
  openingHours: BABYLON,
});

const family = (id: string, latitude: number): PlanningFamily => ({
  id,
  label: `Family ${id.toUpperCase()}`,
  area: 'Town',
  latitude,
  longitude: -0.1,
  ages: [4],
  maxDriveMinutes: 60,
  budgetTier: 'moderate',
  pushchair: true,
  required: [],
  routines: [],
});

const request = (over: Partial<DayPlanRequest> = {}): DayPlanRequest => ({
  date: TUESDAY,
  families: [family('a', 51.1)],
  anchor,
  meal,
  secondActivity: extra,
  options: {
    leaveAt: '09:00',
    returnBy: '',
    bufferMinutes: 15,
    environment: 'either',
    timezone: 'Europe/London',
  },
  ...over,
});

/** A matrix covering every leg any order could need, all live unless stated otherwise. */
const fullMatrix = (source: 'live' | 'estimated' = 'live'): JourneyMatrix => {
  const nodes = [stopKey(ANCHOR), stopKey(MEAL), stopKey(EXTRA)];
  const homes = [homeKey('a'), homeKey('b')];
  const legs: JourneyMatrix['legs'] = {};
  for (const home of homes) legs[home] = Object.fromEntries(nodes.map((n) => [n, { minutes: 20, source }]));
  for (const node of nodes) {
    legs[node] = Object.fromEntries(
      [...nodes.filter((other) => other !== node), ...homes].map((to) => [to, { minutes: 15, source }]),
    );
  }
  return { legs };
};

const buildOf = (over: Partial<JourneyMatrixBuild> = {}): JourneyMatrixBuild => ({
  matrix: fullMatrix(),
  missing: [],
  provenance: { live: 12, estimated: 0 },
  trafficDowngraded: false,
  ...over,
});

const deps = (over: Partial<GenerateDayPlanDeps> = {}): GenerateDayPlanDeps => ({
  buildMatrix: vi.fn(async () => buildOf()) as unknown as typeof buildJourneyMatrix,
  probe: vi.fn(async (): Promise<JourneyProbeResult> => ({ journeys: [] })),
  sequence: sequenceDay,
  now: NOW,
  ...over,
});

const withRoutines = (...routines: Routine[]): PlanningFamily => ({ ...family('a', 51.1), routines });

afterEach(() => {
  delete process.env.TZ;
});

describe('composition', () => {
  it('builds a three stop day in anchor, meal, activity order', async () => {
    const buildMatrix = vi.fn(async () => buildOf()) as unknown as typeof buildJourneyMatrix;
    const result = await generateDayPlan(request(), deps({ buildMatrix }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.itinerary.stops.map((s) => s.placeId)).toEqual([ANCHOR, MEAL, EXTRA]);
    expect(buildMatrix).toHaveBeenCalledTimes(1);
  });

  it('builds an anchor-only day', async () => {
    const result = await generateDayPlan(
      request({ meal: undefined, secondActivity: undefined }),
      deps(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.itinerary.stops).toHaveLength(1);
  });

  it('carries structured opening hours through to the sequencer', async () => {
    const result = await generateDayPlan(
      request({ meal: undefined, secondActivity: undefined }),
      deps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The gallery opens at 11:00, so a confirmed schedule moved the day off the earliest slot.
    expect(result.plan.itinerary.stops[0].opening.status).toBe('open');
    expect(result.plan.itinerary.stops[0].arrive).toBe(660);
    expect(result.plan.itinerary.openingConfidence).toEqual({ confirmed: 1, unknown: 0 });
    expect(result.plan.caveats).toEqual([]);
  });

  it('leaves a venue with no periods unknown, and says so as a typed caveat', async () => {
    const result = await generateDayPlan(
      request({
        anchor: stop(ANCHOR, { name: 'Alexandra Palace Ice Rink', openingHours: NO_PERIODS }),
        meal: undefined,
        secondActivity: undefined,
      }),
      deps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.itinerary.stops[0].opening.status).toBe('unknown');
    expect(result.plan.itinerary.stops[0].opening.status).not.toBe('open');
    expect(result.plan.caveats).toContainEqual({
      kind: 'opening-hours-unknown',
      placeId: ANCHOR,
      name: 'Alexandra Palace Ice Rink',
    });
  });
});

describe('degraded matrices', () => {
  it('succeeds when a missing leg is one the chosen day never needed', async () => {
    // The day ends at the second activity, so the meal's way home is irrelevant to it.
    const unused = { from: stopKey(MEAL), to: homeKey('a'), reason: 'probe-failed' as const };
    const result = await generateDayPlan(
      request(),
      deps({ buildMatrix: vi.fn(async () => buildOf({ missing: [unused] })) as unknown as typeof buildJourneyMatrix }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.itinerary.stops).toHaveLength(3);
    // Still reported: the day did not need it, which is not the same as it being fine.
    expect(result.plan.travel.missing).toEqual([unused]);
  });

  it('blames the matrix when the missing leg was actually required', async () => {
    const legs = fullMatrix().legs;
    delete legs[homeKey('a')][stopKey(ANCHOR)];
    const required = { from: homeKey('a'), to: stopKey(ANCHOR), reason: 'probe-failed' as const };

    const result = await generateDayPlan(
      request(),
      deps({
        buildMatrix: vi.fn(async () =>
          buildOf({ matrix: { legs }, missing: [required] }),
        ) as unknown as typeof buildJourneyMatrix,
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'sequencing-failed') return;
    const nearest =
      result.failure.failure.reason === 'no-feasible-sequence'
        ? result.failure.failure.nearest
        : result.failure.failure;
    expect(nearest?.reason).toBe('travel-infeasible');
    expect(result.failure.blamedLeg).toEqual(required);
  });

  it('reports estimated travel as a typed caveat with a count', async () => {
    const result = await generateDayPlan(
      request(),
      deps({
        buildMatrix: vi.fn(async () =>
          buildOf({ matrix: fullMatrix('estimated'), provenance: { live: 8, estimated: 4 } }),
        ) as unknown as typeof buildJourneyMatrix,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.caveats).toContainEqual({ kind: 'travel-estimated', legs: 4 });
  });

  it('never presents a future day’s traffic as predictive', async () => {
    const result = await generateDayPlan(
      request(),
      deps({
        buildMatrix: vi.fn(async () =>
          buildOf({
            matrix: fullMatrix('estimated'),
            provenance: { live: 0, estimated: 12 },
            trafficDowngraded: true,
          }),
        ) as unknown as typeof buildJourneyMatrix,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.travel.provenance.live).toBe(0);
    expect(result.plan.caveats).toContainEqual({ kind: 'traffic-not-predictive', planDate: TUESDAY });
  });
});

describe('failure fidelity', () => {
  const failOn = async (over: Partial<DayPlanRequest>) =>
    generateDayPlan(request({ meal: undefined, secondActivity: undefined, ...over }), deps());

  it('reports a shut anchor as venue-closed, not as a generic failure', async () => {
    const result = await failOn({ date: MONDAY });
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'sequencing-failed') return;
    const failure = result.failure.failure;
    const nearest = failure.reason === 'no-feasible-sequence' ? failure.nearest : failure;
    expect(nearest?.reason).toBe('venue-closed');
    if (nearest?.reason === 'venue-closed') expect(nearest.placeId).toBe(ANCHOR);
  });

  it('preserves the closing time when a visit would overrun it', async () => {
    const result = await failOn({
      options: { ...request().options, leaveAt: '16:30' },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'sequencing-failed') return;
    const failure = result.failure.failure;
    const nearest = failure.reason === 'no-feasible-sequence' ? failure.nearest : failure;
    expect(nearest?.reason).toBe('venue-closes-during-visit');
    if (nearest?.reason === 'venue-closes-during-visit') expect(nearest.closesAt).toBe('18:00');
  });

  it('preserves the family and routine behind a routine conflict', async () => {
    const result = await failOn({
      families: [
        withRoutines({ id: 'nap', label: 'Nap', kind: 'nap', time: '09:00', durationMinutes: 240, atHome: true }),
      ],
      options: { ...request().options, returnBy: '15:00' },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'sequencing-failed') return;
    const failure = result.failure.failure;
    const nearest = failure.reason === 'no-feasible-sequence' ? failure.nearest : failure;
    expect(nearest?.reason).toBe('routine-conflict');
    if (nearest?.reason === 'routine-conflict') {
      expect(nearest.routineLabel).toBe('Nap');
      expect(nearest.familyId).toBe('a');
    }
  });

  it('preserves both times when the return deadline cannot be met', async () => {
    const result = await failOn({
      anchor: stop(ANCHOR, { name: 'Babylon Park', openingHours: BABYLON, dwellMinutes: 60 }),
      // Babylon opens at 10:00; an hour there plus the drive and buffer puts the family home at
      // 11:30, so 11:15 is the deadline that cannot be met.
      options: { ...request().options, returnBy: '11:15' },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'sequencing-failed') return;
    const failure = result.failure.failure;
    const nearest = failure.reason === 'no-feasible-sequence' ? failure.nearest : failure;
    expect(nearest?.reason).toBe('return-by-exceeded');
    if (nearest?.reason === 'return-by-exceeded') {
      expect(nearest.returnBy).toBe(11 * 60 + 15);
      expect(nearest.homeAt).toBe(11 * 60 + 30);
    }
  });
});

describe('boundaries', () => {
  it('rejects an invalid request before any matrix work is attempted', async () => {
    const buildMatrix = vi.fn() as unknown as typeof buildJourneyMatrix;
    const result = await generateDayPlan(request({ date: 'not-a-date' }), deps({ buildMatrix }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('invalid-request');
    expect(buildMatrix).not.toHaveBeenCalled();
  });

  it('reports a builder that threw as matrix-unavailable, with no invented missing list', async () => {
    const result = await generateDayPlan(
      request(),
      deps({
        buildMatrix: vi.fn(async () => {
          throw new Error("A journey probe asks for 30 destinations, beyond the provider's limit of 25.");
        }) as unknown as typeof buildJourneyMatrix,
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('matrix-unavailable');
    if (result.failure.kind === 'matrix-unavailable') {
      expect(result.failure.message).toContain('limit of 25');
      // An empty `missing` here would read as "nothing was missing" when nothing was attempted.
      expect('missing' in result.failure).toBe(false);
    }
  });

  it('is deterministic for the same injected instant', async () => {
    const first = await generateDayPlan(request(), deps());
    const second = await generateDayPlan(request(), deps());
    expect(first).toEqual(second);
  });

  it('hands the sequencer the exact matrix and clock it resolved, unmodified', async () => {
    const build = buildOf();
    const sequence = vi.fn(sequenceDay);
    const result = await generateDayPlan(
      request(),
      deps({
        buildMatrix: vi.fn(async () => build) as unknown as typeof buildJourneyMatrix,
        sequence,
      }),
    );

    expect(sequence).toHaveBeenCalledTimes(1);
    const [, , passedMatrix, , passedClock] = sequence.mock.calls[0];
    // Object identity: orchestration neither copies nor edits the matrix on its way through.
    expect(passedMatrix).toBe(build.matrix);
    expect(passedClock).toEqual({ today: '2026-09-20', nowMinutes: 9 * 60, timezone: 'Europe/London' });
    if (result.ok) expect(result.plan.clock).toEqual(passedClock);
  });
});

describe('the planning clock is never the device clock', () => {
  it('uses the London date when the device is on another day', async () => {
    // 23:30 UTC on the 22nd is already the 23rd in London, and still the 22nd in Midway.
    process.env.TZ = 'Pacific/Midway';
    const sequence = vi.fn(sequenceDay);
    const result = await generateDayPlan(
      request({ date: '2026-09-23', meal: undefined, secondActivity: undefined }),
      deps({ now: new Date('2026-09-22T23:30:00Z'), sequence }),
    );

    const [, , , , passedClock] = sequence.mock.calls[0];
    expect(passedClock).toMatchObject({ today: '2026-09-23', timezone: 'Europe/London' });
    // The device would have said the 22nd, which would make the 23rd a future date.
    expect(new Date('2026-09-22T23:30:00Z').getDate()).toBe(22);
    if (result.ok) expect(result.plan.clock.today).toBe('2026-09-23');
  });

  it('measures the earliest start against venue-local time, not the device’s', async () => {
    // 13:00 UTC is 14:00 in London and 02:00 in Midway. leaveAt is 09:00, so only the London
    // reading holds the day back to the afternoon.
    process.env.TZ = 'Pacific/Midway';
    const result = await generateDayPlan(
      request({
        date: TUESDAY,
        anchor: stop(ANCHOR, { name: 'Babylon Park', openingHours: BABYLON, dwellMinutes: 60 }),
        meal: undefined,
        secondActivity: undefined,
      }),
      deps({ now: new Date('2026-09-22T13:00:00Z') }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.clock.nowMinutes).toBe(14 * 60);
    // Device-local 02:00 would have allowed a 09:00 start; London's 14:00 does not.
    expect(result.plan.itinerary.stops[0].arrive).toBeGreaterThanOrEqual(14 * 60);
  });

  it('refuses a timezone it cannot interpret rather than falling back silently', async () => {
    const buildMatrix = vi.fn() as unknown as typeof buildJourneyMatrix;
    const result = await generateDayPlan(
      request({ options: { ...request().options, timezone: 'Mars/Olympus_Mons' } }),
      deps({ buildMatrix }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === 'invalid-request') {
      expect(result.failure.field).toBe('options.timezone');
      expect(result.failure.message).toContain('Mars/Olympus_Mons');
    } else {
      expect.unreachable('an uninterpretable timezone must be an invalid request');
    }
    // The fallback is for a timezone nobody gave, not for one that was given and is wrong.
    expect(buildMatrix).not.toHaveBeenCalled();
  });

  it('falls back to London only when no timezone was supplied anywhere', async () => {
    const result = await generateDayPlan(
      request({
        anchor: stop(ANCHOR, { openingHours: undefined }),
        meal: undefined,
        secondActivity: undefined,
        options: { ...request().options, timezone: undefined },
      }),
      deps(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.clock.timezone).toBe('Europe/London');
  });
});
