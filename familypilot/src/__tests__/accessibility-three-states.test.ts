import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { stepFreeOutcome, venueAccess } from '@/src/services/access/access-concepts';
import { hardConflictsFor } from '@/src/services/matching/hard-conflicts';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { CURRENT_POLICY, PROPOSED_POLICY } from '@/src/services/scoring/fit-policy';
import { familyEssentialRows } from '@/src/utils/family-essentials';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import type { Venue, VenueDetail } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import type { StopRequest } from '@/src/types/day-sequence';
import { NOW, facts, kid, profile } from './helpers/surfaces';

/**
 * A family that needs step-free access (a child uses a wheelchair or mobility aid) meets exactly three states, and every surface says
 * the same thing in each:
 *
 *   confirmed suitable      the venue's own claims say it can be visited
 *   confirmed incompatible  they say it cannot: a conflict, said plainly, never a recommendation
 *   unknown                 nobody has confirmed it: discoverable, with a prominent warning; never a verified suitable
 *                           recommendation, and a plan built around it is never presented as accessible
 *
 * Unknown is not incompatible. Nothing here reads parking, a buggy rating or a category.
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

type State = 'suitable' | 'incompatible' | 'unknown';
type Tri = 'yes' | 'no' | 'unknown';
const aid = kid('c', 'Ida', 7, { mobility: ['mobility-aid'] });
const walker = kid('w', 'Cal', 7);
const needs = profile([aid]);
const doesNotNeed = profile([walker]);

const venueOf = (f: MatchableVenueFacts): Venue =>
  ({ id: 'fp-x', name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 10, imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: [], trustedFacts: f } as unknown as Venue);

/** Everything else about the venue is as good as it gets, so only access can hold the verdict back. */
const GOOD = { toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'good', minRecommendedAge: 3, maxRecommendedAge: 12 } as const;

function plan(f: MatchableVenueFacts, who = needs) {
  const fam = planningFamilyFromProfile(who);
  if (typeof fam === 'string') throw new Error(fam);
  const near = { ...fam, maxDriveMinutes: undefined };
  const req: StopRequest = { placeId: 'fp-x', name: 'Test Place', role: 'activity', anchor: true, dwellMinutes: 90, facts: { ...f, driveMinutes: 10 } };
  const matrix = { legs: { [homeKey(near.id)]: { [stopKey('fp-x')]: { minutes: 10, source: 'estimated' as const } }, [stopKey('fp-x')]: { [homeKey(near.id)]: { minutes: 10, source: 'estimated' as const } } } };
  return sequenceDay([req], [near], matrix, { date: '2026-11-10', leaveAt: '09:00', arriveAt: '10:30', returnBy: '', bufferMinutes: 15, environment: 'either' } as SequenceOptions, NOW);
}
const viewOf = (itinerary: Parameters<typeof toPlanViewModel>[0]['itinerary']) =>
  toPlanViewModel({ itinerary, travel: { provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [] }, caveats: [], anchorName: 'Test Place' });

/** What a person would conclude from the venue's two relevant claims, written without the module under test. */
function oracle(wheelchair: Tri, stepFree: Tri): State {
  const r = [wheelchair, stepFree];
  if (r.includes('yes') && r.includes('no')) return 'unknown'; // the venue disagrees with itself: nobody picks a side
  if (r.includes('yes')) return 'suitable';
  if (r.includes('no')) return 'incompatible';
  return 'unknown';
}

const STATES: Array<[State, Tri, Tri]> = [['suitable', 'yes', 'unknown'], ['incompatible', 'no', 'unknown'], ['unknown', 'unknown', 'unknown']];

describe.each(STATES)('%s', (state, wheelchair, stepFree) => {
  const f = facts({ ...GOOD, wheelchairAccessible: wheelchair, stepFreeAccess: stepFree });
  const home = personaliseVenue(venueOf(f), needs, undefined, PROPOSED_POLICY);

  it('Home and Explore: the card says it, and the order agrees', () => {
    const cautions = (home.familyScore.cautions ?? []).join(' ');
    const warned = /isn’t confirmed/.test(cautions);
    expect(warned).toBe(state === 'unknown');
    expect(home.fitConflicts?.length ?? 0).toBe(state === 'incompatible' ? 1 : 0);
    expect(home.familyMatch?.verdict === 'poor').toBe(state === 'incompatible');
    // Never a verified suitable recommendation while it is unknown, however good the rest is.
    if (state === 'unknown') expect(['good', 'excellent']).not.toContain(home.familyMatch?.verdict);
  });

  it('Venue Detail: the essentials row, the Family Fit lines and the headline say the same thing', () => {
    const rows = Object.fromEntries(familyEssentialRows({ ...venueOf(f), photos: [], openingHours: '', description: '' } as unknown as VenueDetail).map((r) => [r.key, r.value]));
    expect(rows.wheelchair).toBe({ suitable: 'Accessible', incompatible: 'Not accessible', unknown: 'Not confirmed' }[state]);
    const fit = JSON.stringify(home.familyMatch);
    expect(/still to be checked/.test(fit)).toBe(state === 'unknown');
    expect(/Wheelchair accessible, the venue says/.test(fit)).toBe(state === 'suitable');
    expect(/is not wheelchair accessible/.test(fit)).toBe(state === 'incompatible');
  });

  it('Create a Plan: suitable builds clean, incompatible is refused, unknown builds with the warning', () => {
    const result = plan(f);
    if (state === 'incompatible') {
      expect(result.ok).toBe(false);
      return;
    }
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.unresolvedMustHaves.length).toBe(state === 'unknown' ? 1 : 0);
  });

  it('a saved plan, reopened from its stored form, says the same and never calls an unconfirmed plan accessible', () => {
    const result = plan(f);
    if (!result.ok) return;
    const stored = JSON.parse(JSON.stringify(result.itinerary));
    const lines = viewOf(stored).needsChecking;
    if (state === 'unknown') {
      expect(lines).toEqual(['Wheelchair and step-free access isn’t confirmed at Test Place, and someone in your family uses a wheelchair or mobility aid. Check before you go.']);
      // Nothing in the whole plan claims access it does not have.
      expect(JSON.stringify(viewOf(stored))).not.toMatch(/wheelchair[- ]accessible|step-free access (is )?confirmed|is accessible|fully accessible/i);
    } else {
      expect(lines).toEqual([]);
    }
  });
});

describe('the current policy keeps its behaviour exactly', () => {
  it('the original warning is still shown for every venue (it ships off)', () => {
    for (const w of ['yes', 'no', 'unknown'] as const) {
      const v = personaliseVenue(venueOf(facts({ ...GOOD, wheelchairAccessible: w })), needs, undefined, CURRENT_POLICY);
      expect((v.familyScore.cautions ?? []).join(' ')).toContain('Wheelchair and mobility-aid access isn’t confirmed here');
    }
  });
});

describe('every combination of the two access claims agrees across all surfaces', () => {
  const TRI: Tri[] = ['yes', 'no', 'unknown'];
  it('9 combinations: module, Home, planner and the saved plan all follow the oracle', () => {
    const wrong: string[] = [];
    for (const wheelchair of TRI) for (const stepFree of TRI) {
      const f = facts({ ...GOOD, wheelchairAccessible: wheelchair, stepFreeAccess: stepFree });
      const expected = oracle(wheelchair, stepFree);
      const moduleState: State = ({ met: 'suitable', unmet: 'incompatible', unknown: 'unknown' } as const)[stepFreeOutcome(venueAccess(f))];
      const home = personaliseVenue(venueOf(f), needs, undefined, PROPOSED_POLICY);
      const homeState: State = (home.fitConflicts?.length ?? 0) > 0 ? 'incompatible' : /isn’t confirmed/.test((home.familyScore.cautions ?? []).join(' ')) ? 'unknown' : 'suitable';
      const result = plan(f);
      const planState: State = !result.ok ? 'incompatible' : result.itinerary.unresolvedMustHaves.length ? 'unknown' : 'suitable';
      const savedState: State = !result.ok ? 'incompatible' : viewOf(JSON.parse(JSON.stringify(result.itinerary))).needsChecking.length ? 'unknown' : 'suitable';
      for (const [surface, got] of Object.entries({ moduleState, homeState, planState, savedState })) {
        if (got !== expected) wrong.push(`wheelchair ${wheelchair}, step-free ${stepFree}: ${surface} said ${got}, expected ${expected}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('only a family that needs it is told anything, and nothing is inferred from parking', () => {
  it('a family with no mobility aid sees no access warning, conflict or plan note in any state', () => {
    for (const w of ['yes', 'no', 'unknown'] as const) {
      const f = facts({ ...GOOD, wheelchairAccessible: w });
      const v = personaliseVenue(venueOf(f), doesNotNeed, undefined, PROPOSED_POLICY);
      expect((v.familyScore.cautions ?? []).join(' ')).not.toMatch(/wheelchair|mobility/i);
      expect(hardConflictsFor(f, doesNotNeed)).toEqual([]);
      const r = plan(f, doesNotNeed);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.itinerary.unresolvedMustHaves).toEqual([]);
    }
  });

  it('a general-parking "no" or "yes" never changes the access state of a wheelchair household', () => {
    for (const parking of ['yes', 'no', 'unknown'] as const) {
      const f = facts({ ...GOOD, parking, wheelchairAccessible: 'unknown' });
      expect(hardConflictsFor(f, needs)).toEqual([]);
      const r = plan(f);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.itinerary.unresolvedMustHaves.map((u) => u.field)).toEqual(['accessibility.wheelchairAccessible']);
    }
  });

  it('a wheelchair household that did not ask for parking is never told parking is a need', () => {
    const v = personaliseVenue(venueOf(facts({ ...GOOD, parking: 'no', wheelchairAccessible: 'yes' })), needs, undefined, PROPOSED_POLICY);
    expect(JSON.stringify(v.familyMatch)).not.toMatch(/you said you need/);
    expect(v.fitConflicts ?? []).toEqual([]);
  });
});
