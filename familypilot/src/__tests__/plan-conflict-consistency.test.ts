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

import { planTimeline } from '@/src/services/planning/plan-timeline';

const build = async (over: Partial<PlanDraft>, opts: { lunch?: boolean; accepted?: string } = {}) => {
  const draft: PlanDraft = { date: '2026-10-11', partyIds: ['mine'], attendeeIds: null, returnBy: '', bufferMinutes: 15, environment: 'either', startAt: '10:00', visit: 'not-sure', ...over } as PlanDraft;
  const outcome = await createPlan({ venue: raf, draft, families: [family()], ...(opts.lunch === false ? {} : { meal: { place: cafe, travel: [] } }), lunchAvailable: true }, deps());
  if (!outcome.ok) throw new Error(outcome.message);
  const source = opts.accepted ? { ...outcome.source, acceptedConflict: opts.accepted } : outcome.source;
  return { source, view: toPlanViewModel(source), rows: planTimeline(source) };
};

const napRow = (rows: ReturnType<typeof planTimeline>) => rows.filter((r) => r.kind === 'routine' && /nap/i.test(r.title));
const homeRow = (rows: ReturnType<typeof planTimeline>) => rows.find((r) => r.kind === 'home')!;
const allText = (rows: ReturnType<typeof planTimeline>) => rows.flatMap((r) => [r.title, ...r.lines.map((l) => l.text)]).join(' | ');

/**
 * The invariants that make the screen trustworthy, over every way of reaching a day: the answer on screen, the timeline and the
 * reassuring lines never disagree about whether the nap is run into, and a parent's "keep it" never hides it.
 */
describe('the RAF nap day says the same thing everywhere, however it was reached', () => {
  const starts = ['10:00', '10:30', '11:00'];
  const visits: PlanDraft['visit'][] = ['not-sure', 60, 90, 120, 180];
  for (const startAt of starts) {
    for (const visit of visits) {
      for (const lunch of [true, false]) {
        it(`arrive ${startAt}, visit ${String(visit)}, lunch ${lunch ? 'on' : 'off'}`, async () => {
          const { source, view, rows } = await build({ startAt, visit }, { lunch });
          const run = source.itinerary.routineInsights.some((i) => i.routineId === 'nap' && i.atHome);
          const napRun = napRow(rows).length > 0;
          // The scheduler, the timeline's nap row and the view's "the nap is overlapped" are one fact.
          expect(napRun).toBe(run);
          expect(Boolean(view.routines?.napOverlap)).toBe(run);
          // A nap only on the drive home is shown and explained (some children sleep in the car) but is not a decision to make;
          // a nap that reaches lunch or the visit is the conflict that has to be changed or kept.
          const napAdvice = view.routines?.advice.find((a) => a.id.endsWith(':nap'));
          expect(Boolean(view.routines?.conflict)).toBe(Boolean(napAdvice && napAdvice.severity === 'soft'));
          if (run) {
            expect(napRow(rows).every((r) => r.tone === 'warn')).toBe(true);
            expect(view.insight).toBeNull();
            expect(view.routines!.clear).toBe(false);
          } else {
            expect(view.routines?.conflict ?? null).toBeNull();
            // Home with room before the nap: the one place a reassuring line about the nap is allowed, and then it is true.
            const home = source.itinerary.families[0].home;
            expect(home).toBeLessThanOrEqual(13 * 60 - 15);
            expect(view.insight).toMatch(/before your nap at 13:00/);
            expect(homeRow(rows).tone).toBe('ok');
          }
          // Choosing to keep an overlap changes the view's wording and nothing about the day itself.
          if (view.routines?.conflict) {
            expect(view.routines.conflict.accepted).toBe(false);
            const kept = await build({ startAt, visit }, { lunch, accepted: view.routines!.conflict!.signature });
            expect(kept.view.routines!.conflict).toMatchObject({ accepted: true });
            expect(kept.view.insight).toBeNull();
            expect(kept.view.routines!.clear).toBe(false);
            expect(allText(kept.rows)).toBe(allText(rows));
            expect(napRow(kept.rows).map((r) => [r.time, r.until, r.tone])).toEqual(napRow(rows).map((r) => [r.time, r.until, r.tone]));
            expect(kept.source.itinerary).toEqual(source.itinerary);
          }
        });
      }
    }
  }

  it('applying the recommended change really does remove the conflict, the warning row and the banner, from either route in', async () => {
    for (const draft of [{ startAt: '10:00', visit: 120 }, { startAt: '10:30', visit: 'not-sure' }] as Partial<PlanDraft>[]) {
      const before = await build(draft);
      const alt = before.view.routines!.recommendation!.option.alternative!;
      const after = await build({ startAt: alt.arriveAt, visit: alt.visitMinutes });
      expect(after.view.routines?.conflict ?? null).toBeNull();
      expect(napRow(after.rows)).toEqual([]);
      expect(after.view.insight).toMatch(/before your nap at 13:00/);
      expect(after.source.itinerary.routineInsights).toEqual([]);
    }
  });

  it('after keeping a plan, editing it re-asks when the overlap changes and remembers when it does not', async () => {
    const original = await build({ startAt: '10:00', visit: 120 });
    const signature = original.view.routines!.conflict!.signature;
    // Same overlap (the lunch is taken out but the nap is still run into in the same way): the choice stands.
    const sameWay = await build({ startAt: '10:00', visit: 120 }, { accepted: signature });
    expect(sameWay.view.routines!.conflict!.accepted).toBe(true);
    // A longer visit makes it a different overlap: asked again, nothing assumed.
    const longer = await build({ startAt: '10:00', visit: 180 }, { accepted: signature });
    expect(longer.view.routines!.conflict).toMatchObject({ accepted: false });
    // A visit that clears it: no conflict at all, and the stale choice is simply unused.
    const fixed = await build({ startAt: '10:00', visit: 60 }, { accepted: signature });
    expect(fixed.view.routines?.conflict ?? null).toBeNull();
    expect(napRow(fixed.rows)).toEqual([]);
  });

  it('the feed reassurance is never the only thing said while the nap is run into', async () => {
    const { view, rows } = await build({ startAt: '10:00', visit: 120 });
    expect(view.routines!.homeBefore.join(' ')).toMatch(/before your feed/);
    expect(view.insight).toBeNull();
    expect(napRow(rows).length).toBeGreaterThan(0);
    expect(napRow(rows)[0].lines.map((l) => l.text).join(' ')).toMatch(/falls during/);
  });
});
