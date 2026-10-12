import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { meetHalfway } from '@/src/services/planning/meet-halfway';
import { PlanningFamily } from '@/src/services/planning/planner';
import { Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Meet Halfway's candidates are chosen by geography from the STORED catalogue, not from Home.
 *
 * Two families who live apart (Bushey in the north-west, Walthamstow in the north-east, about 24 km). Home is personalised to
 * the first family, so its places cluster round Bushey. The genuinely fair place, a farm near Barnet, is deliberately NOT
 * in that Home set: ranking only Home's places can never find it. The stored catalogue holds it.
 */

const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const between = req(resolve(root, 'server/places/lib/between.js'));

const SATURDAY = '2026-10-10';
const TODAY = '2026-10-06';

const bushey: PlanningFamily = {
  id: 'mine', label: 'Our family', area: 'Bushey', latitude: 51.643, longitude: -0.36, ages: [3], maxDriveMinutes: 60,
  budgetTier: 'moderate', pushchair: false, required: [], routines: [],
};
const walthamstow: PlanningFamily = {
  id: 'connected-1', label: 'Hannah’s family', area: 'E17', latitude: 51.59, longitude: -0.02, ages: [2], maxDriveMinutes: 60,
  budgetTier: 'moderate', pushchair: false, required: [], routines: [],
};

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};

const facts = (id: string, over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: id, name: id, category: 'farm', driveMinutes: 0, enrichmentStatus: 'verified', minRecommendedAge: 0, maxRecommendedAge: 8,
  venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'good', environment: 'outdoor',
  energyLevel: 'moderate', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown', ...over,
});

/** A stored-catalogue place as the server returns it (the shape `firstPass` reads). */
const stored = (id: string, latitude: number, longitude: number) => ({ familypilotId: id, name: id, category: 'farm', latitude, longitude });
const asVenue = (place: { familypilotId: string; latitude: number; longitude: number }, over: Partial<MatchableVenueFacts> = {}): Venue =>
  ({
    id: place.familypilotId, name: place.familypilotId, category: 'farm', latitude: place.latitude, longitude: place.longitude,
    driveMinutes: 0, imageUrl: '', familyScore: { score: 70, factors: {} as never, explanation: [] },
    structuredOpeningHours: OPEN_DAILY, trustedFacts: facts(place.familypilotId, over), facilities: [], enrichmentStatus: 'verified',
  }) as Venue;

// The stored catalogue, across the whole geography.
const NEAR_BUSHEY_1 = stored('bushey-heath-farm', 51.633, -0.35);
const NEAR_BUSHEY_2 = stored('stanmore-country-park', 51.62, -0.31);
const NEAR_BUSHEY_3 = stored('watford-fields', 51.66, -0.4);
const BARNET_FARM = stored('barnet-common-farm', 51.625, -0.19); // the fair one
const NEAR_WALTHAMSTOW = stored('walthamstow-marshes', 51.585, -0.03);
const CROYDON = stored('croydon-park', 51.37, -0.1); // nowhere near the corridor
const HEATHROW = stored('heathrow-farm', 51.47, -0.45); // behind Bushey, away from Walthamstow
const CATALOGUE = [NEAR_BUSHEY_1, NEAR_BUSHEY_2, NEAR_BUSHEY_3, BARNET_FARM, NEAR_WALTHAMSTOW, CROYDON, HEATHROW];

/** What Family A's Home loaded: personalised to A, so it is A's neighbourhood. The fair place is not in it. */
const HOME_SET = [NEAR_BUSHEY_1, NEAR_BUSHEY_2, NEAR_BUSHEY_3];

const run = (venues: Venue[]) =>
  meetHalfway({ venues, mine: bushey, other: walthamstow, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 });

const homes = (a: PlanningFamily, b: PlanningFamily) => [
  { latitude: a.latitude, longitude: a.longitude },
  { latitude: b.latitude, longitude: b.longitude },
] as const;

describe('the first pass picks plausible places by geography alone', () => {
  const [a, b] = homes(bushey, walthamstow);
  const shortlist = between.firstPass(a, b, CATALOGUE);
  const ids = shortlist.map((entry: any) => entry.place.familypilotId);

  it('keeps the places between and around both homes, and drops the ones nowhere near the corridor', () => {
    expect(ids).toContain('barnet-common-farm');
    expect(ids).toContain('walthamstow-marshes');
    expect(ids).not.toContain('croydon-park');
    expect(ids).not.toContain('heathrow-farm');
  });

  it('ranks the fair place before the one beside either home: the longer journey matters more than the sum', () => {
    expect(ids[0]).toBe('barnet-common-farm');
    const fair = shortlist.find((entry: any) => entry.place.familypilotId === 'barnet-common-farm');
    const nearA = shortlist.find((entry: any) => entry.place.familypilotId === 'bushey-heath-farm');
    expect(fair.fairness).toBeLessThan(nearA.fairness);
  });

  it('is symmetrical: swapping the families gives the same shortlist', () => {
    const swapped = between.firstPass(b, a, CATALOGUE).map((entry: any) => entry.place.familypilotId);
    expect(swapped).toEqual(ids);
  });

  it('is bounded: a limit is honoured and cannot be exceeded by asking for more', () => {
    expect(between.firstPass(a, b, CATALOGUE, { limit: 2 })).toHaveLength(2);
    const many = Array.from({ length: 300 }, (_, i) => stored(`p${i}`, 51.62 + (i % 10) * 0.002, -0.19 + Math.floor(i / 10) * 0.002));
    expect(between.firstPass(a, b, many, { limit: 5000 }).length).toBeLessThanOrEqual(between.MAX_CANDIDATES);
  });

  it('respects each family’s own reach where one is given', () => {
    const limited = between.firstPass(a, b, CATALOGUE, { maxKmB: 8 }).map((entry: any) => entry.place.familypilotId);
    expect(limited).toEqual(['walthamstow-marshes']);
  });

  it('skips a place with no usable position rather than failing', () => {
    expect(between.firstPass(a, b, [{ name: 'Nowhere', latitude: NaN, longitude: -0.1 }, BARNET_FARM])).toHaveLength(1);
  });

  it('the database box contains the whole corridor, so the query narrows before the pass does', () => {
    const box = between.corridorBounds(a, b);
    for (const entry of shortlist) {
      expect(entry.place.latitude).toBeGreaterThanOrEqual(box.minLat);
      expect(entry.place.latitude).toBeLessThanOrEqual(box.maxLat);
      expect(entry.place.longitude).toBeGreaterThanOrEqual(box.minLng);
      expect(entry.place.longitude).toBeLessThanOrEqual(box.maxLng);
    }
  });
});

describe('the correct halfway place is not in Family A’s Home set, and is still found', () => {
  const [a, b] = homes(bushey, walthamstow);
  const candidates = between.firstPass(a, b, CATALOGUE).map((entry: any) => asVenue(entry.place));

  it('the Home set does not contain it', () => {
    expect(HOME_SET.map((p) => p.familypilotId)).not.toContain('barnet-common-farm');
  });

  it('ranking only Home’s places gives a lopsided answer: Hannah’s family has a much longer journey', () => {
    const fromHome = run(HOME_SET.map((p) => asVenue(p)));
    const best = fromHome.options[0];
    expect(best.venue.id).not.toBe('barnet-common-farm');
    // Every place Home offered is A's neighbourhood; the other family drives far further.
    expect(best.journeys[1].minutes).toBeGreaterThan(best.journeys[0].minutes + 10);
  });

  it('ranking the stored-catalogue candidates finds the fair place first, and it is fairer for both', () => {
    const fromHome = run(HOME_SET.map((p) => asVenue(p))).options[0];
    const fromCatalogue = run(candidates);
    const best = fromCatalogue.options[0];
    expect(best.venue.id).toBe('barnet-common-farm');
    const worst = (option: typeof best) => Math.max(...option.journeys.map((j) => j.minutes));
    expect(worst(best)).toBeLessThan(worst(fromHome));
    expect(best.gap).toBeLessThan(fromHome.gap);
  });

  it('the result reports how many places it looked at, so the screen can say it looked between the homes', () => {
    expect(run(candidates).considered).toBe(candidates.length);
  });

  it('works the same the other way round: the second family’s neighbourhood is no more privileged', () => {
    const reversed = meetHalfway({ venues: candidates, mine: walthamstow, other: bushey, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 });
    expect(reversed.options[0].venue.id).toBe('barnet-common-farm');
  });
});

describe('both families’ needs apply to the candidates, not just the first family’s', () => {
  const [a, b] = homes(bushey, walthamstow);

  it('a must-have the second family stated rules out a place confirmed to lack it, wherever it sits', () => {
    const needsChanging = { ...walthamstow, required: ['babyChanging' as const] };
    const candidates = between.firstPass(a, b, CATALOGUE).map((entry: any) =>
      asVenue(entry.place, entry.place.familypilotId === 'barnet-common-farm' ? { babyChanging: 'no' } : {}),
    );
    const result = meetHalfway({ venues: candidates, mine: bushey, other: needsChanging, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 });
    expect(result.options.map((o) => o.venue.id)).not.toContain('barnet-common-farm');
    expect(result.excluded.requirements).toBeGreaterThan(0);
  });

  it('an unconfirmed must-have keeps the fair place on the list, ranked below a confirmed one, saying what to check', () => {
    const needsChanging = { ...walthamstow, required: ['babyChanging' as const] };
    const candidates = between.firstPass(a, b, CATALOGUE).map((entry: any) =>
      asVenue(entry.place, entry.place.familypilotId === 'barnet-common-farm' ? { babyChanging: 'unknown' } : {}),
    );
    const result = meetHalfway({ venues: candidates, mine: bushey, other: needsChanging, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 });
    const fair = result.options.find((o) => o.venue.id === 'barnet-common-farm');
    expect(fair).toBeDefined();
    expect(fair!.unresolved).toEqual([{ role: 'other', field: 'familyFacilities.babyChanging', label: 'baby changing' }]);
    expect(fair!.needsChecking).toEqual(['Baby changing isn’t confirmed at barnet-common-farm, and Hannah’s family needs it. Check before you go']);
  });

  it('their Family Fit comes only from what they shared, and never names a child', () => {
    const candidates = between.firstPass(a, b, CATALOGUE).map((entry: any) => asVenue(entry.place));
    const best = meetHalfway({ venues: candidates, mine: bushey, other: walthamstow, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 }).options[0];
    const text = [...best.reasons, ...best.toCheck].join(' ');
    expect(text).toMatch(/Hannah’s family/);
    expect(text).not.toMatch(/undefined|\bnull\b/);
  });
});

describe('older connections: routines shared as only "Home time" are treated conservatively', () => {
  const [a, b] = homes(bushey, walthamstow);
  const candidates = between.firstPass(a, b, CATALOGUE).map((entry: any) => asVenue(entry.place));
  const legacy = { ...walthamstow, routines: [{ id: 'busy-0', label: 'Home time', kind: 'nap' as const, time: '12:20', durationMinutes: 90, atHome: true }] };

  it('says "home time", never "naps", and flags the legacy share for the screen', () => {
    const result = meetHalfway({ venues: candidates, mine: bushey, other: legacy, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 });
    expect(result.otherKnown.routinesLegacy).toBe(true);
    const text = result.options.flatMap((o) => [...o.reasons, ...o.toCheck]).join(' ');
    expect(text).not.toMatch(/naps|feeds/);
  });

  it('a richer share is not flagged', () => {
    const rich = { ...walthamstow, routines: [{ id: 'nap-1', label: 'Nap', kind: 'nap' as const, time: '12:20', durationMinutes: 90, atHome: true }] };
    const result = meetHalfway({ venues: candidates, mine: bushey, other: rich, date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60 });
    expect(result.otherKnown.routinesLegacy).toBe(false);
  });
});

describe('the screen asks the catalogue between the homes, not Home', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/(tabs)/halfway.tsx'), 'utf8');

  it('feeds the engine from the between query, with Home only as a labelled fallback', () => {
    expect(source).toContain('useBetweenVenues(');
    expect(source).toMatch(/useNearbyVenues\(\{ enabled: between\.isError \}\)/);
    expect(source).toContain('const venues = between.data ??');
    expect(source).toContain('halfway-fallback');
  });
});

describe('a limit that was not given is not a limit of one', () => {
  const [a, b] = homes(bushey, walthamstow);
  it.each([undefined, null, ''])('treats %p as the default', (limit) => {
    const many = Array.from({ length: 30 }, (_, i) => stored(`p${i}`, 51.62 + (i % 5) * 0.002, -0.19 + Math.floor(i / 5) * 0.002));
    expect(between.firstPass(a, b, many, { limit }).length).toBe(30);
  });
});
