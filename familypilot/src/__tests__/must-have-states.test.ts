import { describe, expect, it } from 'vitest';

import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { mustHaveLabel } from '@/src/services/planning/must-have-labels';
import { JourneyMatrix, StopRequest } from '@/src/types/day-sequence';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * The four states a must-have (and its neighbours) can be in, each with its own consequence:
 *
 *   confirmed MISSING explicit must-have   hard conflict: the day is refused
 *   UNKNOWN / unconfirmed explicit must-have  prominent unresolved warning: the plan is still built, and says what to check
 *   known routine clash                     advice: the plan is built, with options
 *   informational timing issue              a note
 *
 * An unconfirmed must-have is "check this", never "you cannot go". Unknown never becomes a yes and never becomes a no.
 */

const now = new Date('2026-09-20T08:00:00');

const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-farm',
  name: 'Kentish Town City Farm',
  category: 'farm',
  driveMinutes: 0,
  enrichmentStatus: 'verified',
  minRecommendedAge: 0,
  maxRecommendedAge: 12,
  venueAgePolicy: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  pushchairSuitability: 'good',
  environment: 'outdoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 90,
  estimatedSpend: 'Free',
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
  ...over,
});

const farm = (over: Partial<MatchableVenueFacts> = {}): StopRequest => ({
  placeId: 'fp-farm',
  name: 'Kentish Town City Farm',
  role: 'activity',
  anchor: true,
  dwellMinutes: 90,
  facts: facts(over),
});

const family = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'mine',
  label: 'Our family',
  area: 'Town',
  latitude: 51.5,
  longitude: -0.1,
  ages: [2],
  maxDriveMinutes: 60,
  budgetTier: 'moderate',
  pushchair: false,
  required: ['babyChanging'],
  routines: [],
  ...over,
});

const options: SequenceOptions = {
  date: '2026-09-22',
  leaveAt: '09:00',
  returnBy: '',
  bufferMinutes: 15,
  environment: 'either',
};

const matrix = (): JourneyMatrix => ({
  legs: {
    [homeKey('mine')]: { [stopKey('fp-farm')]: { minutes: 20, source: 'estimated' } },
    [stopKey('fp-farm')]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' } },
  },
});

const nap: Routine = { id: 'nap', label: 'Nap', kind: 'nap', time: '09:00', durationMinutes: 240, atHome: true };

const run = (stop: StopRequest, who: PlanningFamily[] = [family()]) => sequenceDay([stop], who, matrix(), options, now);

describe('confirmed missing explicit must-have: a hard conflict', () => {
  it('refuses the day, naming the family, the stop and the field', () => {
    const result = run(farm({ babyChanging: 'no' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const { failure } = result;
    expect(failure.reason).toBe('requirement-unmet');
    if (failure.reason !== 'requirement-unmet') return;
    expect(failure.familyId).toBe('mine');
    expect(failure.placeId).toBe('fp-farm');
    expect(failure.unmet).toEqual([{ field: 'familyFacilities.babyChanging', outcome: 'unsuitable' }]);
  });

  it('does not let a confirmed miss hide behind an unknown one: only the miss is a failure', () => {
    const result = run(farm({ babyChanging: 'no', toilets: 'unknown' }), [family({ required: ['babyChanging', 'toilets'] })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const { failure } = result;
    if (failure.reason !== 'requirement-unmet') throw new Error('expected requirement-unmet');
    expect(failure.unmet.every((u) => u.outcome === 'unsuitable')).toBe(true);
  });
});

describe('unknown explicit must-have: a prominent unresolved warning, not a blocker', () => {
  const result = run(farm({ babyChanging: 'unknown' }));

  it('still builds the plan', () => {
    expect(result.ok).toBe(true);
  });

  it('carries the unresolved must-have for the family and the stop', () => {
    if (!result.ok) throw new Error('expected a plan');
    expect(result.itinerary.unresolvedMustHaves).toEqual([
      expect.objectContaining({ familyId: 'mine', placeId: 'fp-farm', stopName: 'Kentish Town City Farm', field: 'familyFacilities.babyChanging' }),
    ]);
  });

  it('is listed among what is unconfirmed, never as a confirmed yes', () => {
    if (!result.ok) throw new Error('expected a plan');
    expect(result.itinerary.unknowns.join(' ').toLowerCase()).toContain('baby changing');
  });

  it('a confirmed yes leaves nothing to check', () => {
    const confirmed = run(farm({ babyChanging: 'yes' }));
    if (!confirmed.ok) throw new Error('expected a plan');
    expect(confirmed.itinerary.unresolvedMustHaves).toEqual([]);
  });

  it('only a must-have the family actually stated is unresolved: an unknown they did not ask for is not', () => {
    const noMustHaves = run(farm({ babyChanging: 'unknown' }), [family({ required: [] })]);
    if (!noMustHaves.ok) throw new Error('expected a plan');
    expect(noMustHaves.itinerary.unresolvedMustHaves).toEqual([]);
  });

  it('reports each family separately when two families need the same unconfirmed thing', () => {
    const two = [family({ id: 'a', label: 'Our family' }), family({ id: 'b', label: 'Hannah’s family' })];
    const m: JourneyMatrix = {
      legs: {
        [homeKey('a')]: { [stopKey('fp-farm')]: { minutes: 20, source: 'estimated' } },
        [homeKey('b')]: { [stopKey('fp-farm')]: { minutes: 25, source: 'estimated' } },
        [stopKey('fp-farm')]: { [homeKey('a')]: { minutes: 20, source: 'estimated' }, [homeKey('b')]: { minutes: 25, source: 'estimated' } },
      },
    };
    const both = sequenceDay([farm({ babyChanging: 'unknown' })], two, m, options, now);
    if (!both.ok) throw new Error('expected a plan');
    expect(both.itinerary.unresolvedMustHaves.map((u) => u.familyId).sort()).toEqual(['a', 'b']);
  });
});

describe('what the parent reads for an unresolved must-have', () => {
  const build = (over: Partial<MatchableVenueFacts>, who: PlanningFamily[] = [family()]) => {
    const result = run(farm(over), who);
    if (!result.ok) throw new Error('expected a plan');
    return toPlanViewModel({ itinerary: result.itinerary, travel: { provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [] }, caveats: [], anchorName: 'Kentish Town City Farm' });
  };

  it('says what to check, in the parent’s words, and that it is unconfirmed rather than missing', () => {
    const view = build({ babyChanging: 'unknown' });
    expect(view.needsChecking).toEqual([
      'Baby changing isn’t confirmed at Kentish Town City Farm, and you said you need it. Check before you go.',
    ]);
    expect(view.needsChecking.join(' ')).not.toMatch(/familyFacilities|undefined/);
  });

  it('is empty when everything the family needs is confirmed', () => {
    expect(build({ babyChanging: 'yes' }).needsChecking).toEqual([]);
  });

  it('has a parent-facing name for every field a family can require', () => {
    for (const field of ['familyFacilities.toilets', 'familyFacilities.babyChanging', 'familyFacilities.parking', 'pushchairSuitability']) {
      expect(mustHaveLabel(field)).toBeTruthy();
    }
  });
});

describe('known routine clash: advice, and it does not disturb the must-have state', () => {
  it('builds the plan, with the clash as an insight, and keeps the unresolved must-have too', () => {
    const result = run(farm({ babyChanging: 'unknown' }), [family({ routines: [nap] })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.routineInsights.some((i) => i.routineId === 'nap')).toBe(true);
    expect(result.itinerary.unresolvedMustHaves).toHaveLength(1);
  });

  it('a clash alone is not an unresolved must-have', () => {
    const result = run(farm({ babyChanging: 'yes' }), [family({ routines: [nap] })]);
    if (!result.ok) throw new Error('expected a plan');
    expect(result.itinerary.routineInsights.length).toBeGreaterThan(0);
    expect(result.itinerary.unresolvedMustHaves).toEqual([]);
  });
});

describe('an explicit indoor/outdoor request that the venue cannot confirm is not silently dropped', () => {
  const asked = (setting: 'indoor' | 'outdoor') =>
    sequenceDay([farm({ environment: 'unknown' })], [family({ required: [] })], matrix(), { ...options, environment: setting }, now);

  it('still builds the plan, and says so prominently', () => {
    const result = asked('indoor');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.unresolvedMustHaves.map((u) => u.field)).toEqual(['environment']);
    const view = toPlanViewModel({ itinerary: result.itinerary, travel: { provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [] }, caveats: [], anchorName: 'Kentish Town City Farm' });
    expect(view.needsChecking).toEqual(['Whether Kentish Town City Farm is indoors or outdoors isn’t confirmed, and you asked for a particular setting today. Check before you go.']);
  });

  it('a venue confirmed to be the wrong setting is still a hard conflict, and "either" asks for nothing', () => {
    const wrong = sequenceDay([farm({ environment: 'outdoor' })], [family({ required: [] })], matrix(), { ...options, environment: 'indoor' }, now);
    expect(wrong.ok).toBe(false);
    const either = sequenceDay([farm({ environment: 'unknown' })], [family({ required: [] })], matrix(), options, now);
    if (!either.ok) throw new Error('expected a plan');
    expect(either.itinerary.unresolvedMustHaves).toEqual([]);
  });
});

describe('a day saved before this release still renders', () => {
  it('has no unresolved must-haves, routine insights or home-after list, and none are needed', () => {
    const itinerary: any = {
      date: '2026-10-10',
      stops: [{ index: 0, placeId: 'p', name: 'Farm', role: 'activity', anchor: true, arrive: 600, depart: 690, dwellMinutes: 90, opening: { status: 'open', reason: 'within-opening-period', closesAt: '17:00' } }],
      legs: [],
      families: [{ familyId: 'mine', label: 'Our family', depart: 570, home: 750, latestDeparture: 600, notes: [] }],
      unknowns: ['baby changing'],
      openingConfidence: { confirmed: 1, unknown: 0 },
      reasons: [],
      fairnessGap: 0,
      score: 1,
    };
    const view = toPlanViewModel({ itinerary, travel: { provenance: { live: 1, estimated: 0 }, trafficDowngraded: false, missing: [] }, caveats: [], anchorName: 'Farm' } as never);
    expect(view.needsChecking).toEqual([]);
    expect(view.stops).toHaveLength(1);
  });
});
