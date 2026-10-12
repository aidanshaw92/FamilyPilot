import { describe, expect, it, vi } from 'vitest';
import { createPlan } from '@/src/services/planning/create-plan';
import { PlanStopSource } from '@/src/services/planning/day-plan';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import { JourneyMatrix } from '@/src/types/day-sequence';

const RAF = 'fp-raf', CAFE = 'fp-osm-cafe';
const hours = { timezone: 'Europe/London', periods: [0,1,2,3,4,5,6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })) };
const raf: PlanStopSource = { placeId: RAF, name: 'Royal Air Force Museum London', category: 'museum', latitude: 51.598, longitude: -0.238, openingHours: hours as any, facts: { placeId: RAF, name: 'RAF', category: 'museum', driveMinutes: 0, enrichmentStatus: 'enriched', minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'good', environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'open' } as any };
const cafe: PlanStopSource = { placeId: CAFE, name: 'Cafe near RAF', category: 'cafe', latitude: 51.599, longitude: -0.237 };
const nap: Routine = { id: 'nap', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 90, atHome: true };
const feed: Routine = { id: 'feed', label: 'Feed', kind: 'feed', time: '15:00', durationMinutes: 30, atHome: true };
const family = (): PlanningFamily => ({ id: 'mine', label: 'Our family', area: 'Bushey', latitude: 51.643, longitude: -0.368, ages: [4, 0], maxDriveMinutes: 60, pushchair: true, required: [], routines: [nap, feed] });
const matrix = (): JourneyMatrix => ({ legs: { [homeKey('mine')]: { [stopKey(RAF)]: { minutes: 25, source: 'estimated' }, [stopKey(CAFE)]: { minutes: 26, source: 'estimated' } }, [stopKey(RAF)]: { [homeKey('mine')]: { minutes: 25, source: 'estimated' }, [stopKey(CAFE)]: { minutes: 3, source: 'estimated' } }, [stopKey(CAFE)]: { [homeKey('mine')]: { minutes: 26, source: 'estimated' }, [stopKey(RAF)]: { minutes: 3, source: 'estimated' } } } });
const deps = () => ({ buildMatrix: vi.fn(async () => ({ matrix: matrix(), provenance: { live: 0, estimated: 4 }, trafficDowngraded: false, missing: [] })) as unknown as typeof buildJourneyMatrix, now: new Date('2026-10-10T08:00:00Z') });

const plan = async (over: Partial<PlanDraft>, accepted?: string) => {
  const draft: PlanDraft = { date: '2026-10-11', partyIds: ['mine'], attendeeIds: null, returnBy: '', bufferMinutes: 15, environment: 'either', startAt: '10:00', visit: 'not-sure', ...over } as PlanDraft;
  const outcome = await createPlan({ venue: raf, draft, families: [family()], meal: { place: cafe, travel: [] }, lunchAvailable: true }, deps());
  if (!outcome.ok) throw new Error(outcome.message);
  const source = accepted ? { ...outcome.source, acceptedConflict: accepted } : outcome.source;
  return { outcome, source, view: toPlanViewModel(source) };
};

// The reproduction from the post-launch review: a baby who naps 13:00-14:30 at home and feeds at 15:00, a museum that opens
// at 10:00, a 45-minute lunch and a 25-minute drive each way. It used to build a day with lunch and the drive home inside
// the nap, a "home before your 15:00 feed" tick beside it, and a shorter visit offered only as an aside.
describe('the Royal Air Force Museum day with a 13:00 nap at home', () => {
  it('"not sure" how long: FamilyPilot picks the visit that gets home with room before the nap, and says so', async () => {
    const { source, view } = await plan({});
    const home = source.itinerary.families[0].home;
    expect(home).toBeLessThanOrEqual(13 * 60 - 15);
    expect(source.itinerary.routineInsights).toEqual([]);
    expect(source.visit).toMatchObject({ basis: 'routine-limited', minutes: 60, unshortenedMinutes: 120 });
    expect(view.routines!.conflict).toBeNull();
    expect(view.routines!.restoreVisit).toEqual({ minutes: 120, label: 'Stay 2 hr' });
    expect(view.routines!.visitNote).toMatch(/^We’ve allowed 1 hr, which gets you home before your nap at 13:00/);
  });

  it('a 2-hour visit the parent chose is not shortened for them: the clash stays, with the shorter visit as the recommendation', async () => {
    const { source, view } = await plan({ visit: 120 });
    expect(source.visit).toMatchObject({ basis: 'chosen', minutes: 120 });
    expect(source.itinerary.stops.map((s) => s.name)[0]).toMatch(/Air Force/);
    expect(source.itinerary.routineInsights.length).toBeGreaterThan(0);
    const routines = view.routines!;
    expect(routines.conflict).toMatchObject({ accepted: false });
    expect(routines.conflict!.lines[0]).toMatch(/Your nap · 13:00–14:30 begins during lunch and runs into the drive home/);
    expect(routines.recommendation!.title).toBe('Best option: stay 1 hr instead');
    expect(routines.recommendation!.lines).toContain('You’d have 1 hr at Royal Air Force Museum London instead of 2 hr.');
  });

  it('never ticks "home before the feed" while the nap is run into', async () => {
    const { view } = await plan({ visit: 120 });
    expect(view.insight).toBeNull();
    expect(view.routines!.clear).toBe(false);
    // The fact is still stated, for anyone who wants it; the screen draws it without a tick beside an open clash.
    expect(view.routines!.homeBefore).toEqual(['You’re home around 13:44, before your feed at 15:00.']);
  });

  it('arriving at 10:30 leaves no single fix, so a combined one is offered as a choice and not applied', async () => {
    const { source, view } = await plan({ startAt: '10:30' });
    expect(source.visit).toMatchObject({ basis: 'category-typical', minutes: 120 });
    expect(source.itinerary.stops[0].arrive).toBe(10 * 60 + 30);
    expect(source.alternatives).toEqual([
      { kind: 'combined', arriveAt: '10:00', visitMinutes: 60, resolves: [{ familyId: 'mine', routineId: 'nap' }] },
    ]);
    expect(view.routines!.conflict).toMatchObject({ accepted: false });
    expect(view.routines!.recommendation!.title).toBe('Best option: arrive around 10:00 and stay 1 hr');
    expect(view.routines!.recommendation!.option.label).toBe('Arrive at 10:00, stay 1 hr');
  });

  it('applying the combined option really does give a day home before the nap', async () => {
    const { source } = await plan({ startAt: '10:00', visit: 60 });
    expect(source.itinerary.routineInsights).toEqual([]);
    expect(source.itinerary.families[0].home).toBeLessThanOrEqual(13 * 60 - 15);
  });

  it('three hours: nothing quick clears it, and the plan says the choice is the parent’s', async () => {
    const { source, view } = await plan({ visit: 180 });
    expect(source.alternatives).toEqual([]);
    expect(view.routines!.headline).toBe('This plan runs into your nap');
    expect(view.routines!.conflict!.hint).toMatch(/Change when you arrive or how long you stay, or keep the plan as it is/);
    expect(view.insight).toBeNull();
  });

  it('"Keep it as planned" is remembered for that overlap, stays visible and is not a green light', async () => {
    const first = await plan({ visit: 120 });
    const signature = first.view.routines!.conflict!.signature;
    const kept = await plan({ visit: 120 }, signature);
    expect(kept.view.routines!.conflict).toMatchObject({ accepted: true, signature });
    expect(kept.view.routines!.headline).toBe('You’re keeping this plan, with your nap during the day');
    expect(kept.view.routines!.clear).toBe(false);
    expect(kept.view.insight).toBeNull();
    // The options are still there for a parent who changes their mind.
    expect(kept.view.routines!.recommendation).not.toBeNull();
  });

  it('a choice to keep one overlap does not carry over to a different one', async () => {
    const twoHours = await plan({ visit: 120 });
    const threeHours = await plan({ visit: 180 }, twoHours.view.routines!.conflict!.signature);
    expect(threeHours.view.routines!.conflict).toMatchObject({ accepted: false });
    expect(threeHours.view.routines!.headline).toBe('This plan runs into your nap');
  });

  it('changing arrival, length or lunch recalculates the times and the warnings', async () => {
    const base = await plan({ visit: 120 });
    const later = await plan({ visit: 120, startAt: '10:30' });
    expect(later.source.itinerary.families[0].home).toBe(base.source.itinerary.families[0].home + 30);
    const shorter = await plan({ visit: 60 });
    expect(shorter.view.routines!.conflict).toBeNull();
    expect(shorter.view.insight).toBe('You’re home around 12:44, before your nap at 13:00.');
  });
});
