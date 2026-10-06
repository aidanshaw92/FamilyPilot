import { describe, expect, it, vi } from 'vitest';

import {
  CreatePlanStepId,
  MEAL_DWELL_MINUTES,
  createPlan,
  createPlanSteps,
} from '@/src/services/planning/create-plan';
import { planStopFromRecord } from '@/src/services/planning/day-plan';
import { PlanningFamily } from '@/src/services/planning/planner';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { ExternalPlaceRecord } from '@/src/types/places';
import { DayItinerary, SequenceFailure } from '@/src/types/day-sequence';
import { estimatedLeg } from '@/src/types/travel';

/**
 * What happens behind the approved Create a Plan button.
 *
 * The point of these is the failure half. A planner that says "no plan found" has thrown away the
 * only part a parent can use, and the sequencer already knows exactly what stood in the way, so each
 * reason is checked for keeping its detail and offering something to change.
 */

const record = (over: Partial<ExternalPlaceRecord> = {}): ExternalPlaceRecord => ({
  familypilotId: 'fp-google-anchor',
  name: 'Kentish Town City Farm',
  category: 'farm',
  latitude: 51.55,
  longitude: -0.15,
  provider: 'google',
  ...over,
} as ExternalPlaceRecord);

/** createPlan takes the narrowed source, so the test goes through the real adapter too. */
const venue = (over: Partial<ExternalPlaceRecord> = {}) => planStopFromRecord(record(over));

const family = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'mine', label: 'Our family', area: 'Camden',
  latitude: 51.54, longitude: -0.14, ages: [4], maxDriveMinutes: 30,
  budgetTier: 'moderate', pushchair: true, required: [], routines: [],
  ...over,
});

const draft: PlanDraft = {
  date: '2026-10-10',
  startAt: '09:30',
  partyIds: ['mine'],
  attendeeIds: null,
  visit: 90,
  returnBy: '',
  bufferMinutes: 15,
  environment: 'either',
};

const itinerary = (): DayItinerary => ({
  date: '2026-10-10',
  stops: [{
    index: 0, placeId: 'fp-google-anchor', name: 'Kentish Town City Farm', role: 'activity',
    anchor: true, arrive: 600, depart: 690, dwellMinutes: 90,
    opening: { status: 'open', reason: 'within-opening-period', closesAt: '17:00' },
  }],
  legs: [],
  families: [{ familyId: 'mine', label: 'Our family', depart: 570, home: 750, latestDeparture: 600, notes: [] }],
  unknowns: [],
  openingConfidence: { confirmed: 1, unknown: 0 },
  routineInsights: [],
  homeAfter: [],
  reasons: [],
  fairnessGap: 0,
  score: 1,
});

/** A matrix builder and sequencer that succeed, so the test is about this module's own behaviour. */
const workingDeps = (over: Record<string, unknown> = {}) => ({
  buildMatrix: vi.fn(async () => ({
    matrix: {}, provenance: { live: 1, estimated: 0 }, trafficDowngraded: false, missing: [],
  })) as never,
  sequence: vi.fn(() => ({ ok: true as const, itinerary: itinerary() })) as never,
  probe: vi.fn() as never,
  now: new Date('2026-10-10T08:00:00Z'),
  ...over,
});

const failing = (failure: SequenceFailure) =>
  workingDeps({ sequence: vi.fn(() => ({ ok: false as const, failure })) as never });

describe('the generating steps describe real work', () => {
  it('names the venue and the restaurant rather than saying it is thinking', () => {
    const steps = createPlanSteps({
      venueName: 'Kentish Town City Farm',
      meal: {
        place: venue({ name: 'The Moat Cafe' }),
        travel: [estimatedLeg('walk', 5)],
      },
    });
    expect(steps.map((s) => s.label)).toEqual([
      'Checking Kentish Town City Farm fits your family',
      // "about", not "within": the 5 is a straight-line estimate, and a progress line that promises
      // "within a 5-minute walk" makes the claim the Plan itself refuses to make.
      'Finding lunch about a 5-minute walk away',
      'Working out travel and parking',
      'Fitting the day around your family',
    ]);
    // No chatbot language anywhere.
    const joined = steps.map((s) => s.label).join(' ').toLowerCase();
    for (const word of ['thinking', 'ai ', 'generating', 'magic', 'hold on']) {
      expect(joined).not.toContain(word);
    }
  });

  it('names the restaurant when the walk is not known', () => {
    expect(createPlanSteps({ venueName: 'X', meal: { place: venue({ name: 'The Moat Cafe' }) } })[1].label)
      .toBe('Adding lunch at The Moat Cafe');
  });

  it('offers no lunch step at all when there is none cached', () => {
    // An earlier version of this showed "Checking for lunch nearby", which this button never does:
    // a restaurant search is a billable call, so with nothing cached no restaurant is looked at.
    // A step for work that will not happen is a progress bar for nothing.
    const steps = createPlanSteps({ venueName: 'X' });
    expect(steps.map((s) => s.id)).toEqual(['venue', 'travel', 'timing']);
    expect(steps.map((s) => s.label).join(' ')).not.toContain('lunch');
  });

  it('reports each step as it happens, in order', async () => {
    const seen: CreatePlanStepId[] = [];
    await createPlan(
      { venue: venue(), draft, families: [family()], meal: { place: venue({ familypilotId: 'fp-google-cafe', name: 'The Moat Cafe', category: 'cafe' }) } },
      { ...workingDeps(), onStep: (id) => seen.push(id) },
    );
    expect(seen).toEqual(['venue', 'lunch', 'travel', 'timing']);
  });

  it('reports only the steps it offered when there is no lunch to add', async () => {
    const seen: CreatePlanStepId[] = [];
    await createPlan({ venue: venue(), draft, families: [family()] },
      { ...workingDeps(), onStep: (id) => seen.push(id) });
    // Exactly the ids `createPlanSteps` returns for the same input, so no step is ever reported that
    // the screen has no line for, and no line is left waiting for a step that never arrives.
    expect(seen).toEqual(createPlanSteps({ venueName: 'Kentish Town City Farm' }).map((s) => s.id));
  });
});

describe('lunch is never bought twice', () => {
  it('builds a day with no meal stop when nothing is cached', async () => {
    const sequence = vi.fn(() => ({ ok: true as const, itinerary: itinerary() }));
    await createPlan({ venue: venue(), draft, families: [family()] },
      workingDeps({ sequence: sequence as never }));
    // The sequencer is handed one stop: a restaurant search inside a button press would be a second
    // billable Google call for something Venue Detail already paid for.
    const stops = (sequence.mock.calls[0] as unknown[])[0] as unknown[];
    expect(stops).toHaveLength(1);
  });

  it('uses the meal the caller already holds, at the table length the planner uses', async () => {
    const sequence = vi.fn(() => ({ ok: true as const, itinerary: itinerary() }));
    await createPlan(
      { venue: venue(), draft, families: [family()], meal: { place: venue({ familypilotId: 'fp-google-cafe', name: 'The Moat Cafe', category: 'cafe' }) } },
      workingDeps({ sequence: sequence as never }),
    );
    const stops = (sequence.mock.calls[0] as unknown[])[0] as Array<{ role: string; dwellMinutes: number }>;
    expect(stops).toHaveLength(2);
    expect(stops[1]).toMatchObject({ role: 'meal', dwellMinutes: MEAL_DWELL_MINUTES });
  });
});

describe('a missing lunch stop says which kind of missing it is', () => {
  const caveats = async (over: Record<string, unknown>) => {
    const outcome = await createPlan(
      { venue: venue(), draft, families: [family()], ...over },
      workingDeps(),
    );
    if (!outcome.ok) throw new Error('expected a plan');
    return outcome.view.caveats;
  };

  it('blames our lookup when the lookup failed and there is no meal', async () => {
    // Before this, a failed lookup and an empty neighbourhood produced the same plan, and a parent
    // could only read the silence as "there is nowhere to eat near here".
    expect(await caveats({ mealLookupFailed: true })).toContain(
      'We could not check what is nearby, so this day has no lunch stop. This is about our lookup, not about the area.',
    );
  });

  it('says nothing when the neighbourhood simply has nothing mapped', async () => {
    expect((await caveats({})).join(' ')).not.toContain('lunch stop');
  });

  it('says nothing when the lookup failed but a meal was found anyway', async () => {
    // A retry that succeeds after one error still produced a lunch stop. Warning about a lookup whose
    // result is sitting in the plan would contradict the plan.
    const lines = await caveats({
      mealLookupFailed: true,
      meal: { place: venue({ familypilotId: 'fp-google-cafe', name: 'The Moat Cafe', category: 'cafe' }) },
    });
    expect(lines.join(' ')).not.toContain('lunch stop');
  });
});

describe('a day that cannot be built still helps', () => {
  const run = (failure: SequenceFailure) =>
    createPlan({ venue: venue(), draft, families: [family()] }, failing(failure));

  it('says "isn’t open then" when the place is open that day but not at that time', async () => {
    const outcome = await run({ reason: 'venue-closed', message: 'Not open at that time.', stopIndex: 0, placeId: 'fp-google-anchor', date: '2026-10-10', why: 'outside-opening-period' });
    expect(outcome).toMatchObject({ ok: false, title: 'Kentish Town City Farm isn’t open then' });
    if (!outcome.ok) expect(outcome.suggestions).toContain('Try a different start');
  });

  it('says which venue is shut and offers another date', async () => {
    const outcome = await run({ reason: 'venue-closed', message: 'Closed on Saturdays.', stopIndex: 0, placeId: 'fp-google-anchor', date: '2026-10-10' });
    expect(outcome).toMatchObject({
      ok: false,
      title: 'Kentish Town City Farm is closed that day',
      suggestions: ['Try another date', 'Pick a different place'],
    });
  });

  it('quotes the closing time when the visit would overrun it', async () => {
    const outcome = await run({ reason: 'venue-closes-during-visit', message: 'x', stopIndex: 0, placeId: 'a', closesAt: '16:00' });
    expect(outcome).toMatchObject({ ok: false, title: 'The visit would run past closing' });
    if (!outcome.ok) expect(outcome.message).toContain('16:00');
  });

  it('names the routine it clashed with', async () => {
    const outcome = await run({ reason: 'routine-conflict', message: 'x', familyId: 'mine', routineLabel: 'Leo’s afternoon nap' });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.message).toBe('This day would run into Leo’s afternoon nap.');
    expect(outcome.suggestions).toContain('Start earlier');
  });

  it('quotes both the journey and the limit', async () => {
    const outcome = await run({ reason: 'travel-infeasible', message: 'x',
      from: { kind: 'home', familyId: 'mine' }, to: { kind: 'stop', index: 0, placeId: 'a' },
      travelMinutes: 48, limitMinutes: 30 });
    if (outcome.ok) throw new Error('expected a failure');
    // No provenance on the failure means we do not know, and not knowing is worded as an estimate.
    expect(outcome.message).toBe('That leg is about 48 minutes, and your limit is 30.');
  });

  it('hedges a journey the matrix only estimated', async () => {
    const outcome = await run({ reason: 'travel-infeasible', message: 'x',
      from: { kind: 'home', familyId: 'mine' }, to: { kind: 'stop', index: 0, placeId: 'a' },
      travelMinutes: 48, limitMinutes: 30, travelSource: 'estimated' });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.message).toBe('That leg is about 48 minutes, and your limit is 30.');
  });

  it('states a routed journey plainly, because hedging a measurement is also a lie', async () => {
    // The direction nobody checks for. This message is what stops a plan, and a parent deciding
    // whether to raise their limit is owed the difference between "we measured 48" and "we guessed
    // 48". Before the leg carried its provenance, every failure said "about" regardless.
    const outcome = await run({ reason: 'travel-infeasible', message: 'x',
      from: { kind: 'home', familyId: 'mine' }, to: { kind: 'stop', index: 0, placeId: 'a' },
      travelMinutes: 48, limitMinutes: 30, travelSource: 'live' });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.message).toBe('That leg is 48 minutes, and your limit is 30.');
    expect(outcome.message).not.toContain('about');
  });

  it('converts the return-by clash into clock times', async () => {
    const outcome = await run({ reason: 'return-by-exceeded', message: 'x', familyId: 'mine', homeAt: 18 * 60 + 40, returnBy: 17 * 60 });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.message).toBe('This day gets you home about 18:40, after the 17:00 you asked for.');
  });

  it('reports the closest miss rather than the fact that everything failed', async () => {
    // "No feasible sequence" on its own tells a parent nothing they can change.
    const outcome = await run({
      reason: 'no-feasible-sequence', message: 'x', attempts: 240,
      nearest: { reason: 'return-by-exceeded', message: 'y', familyId: 'mine', homeAt: 19 * 60, returnBy: 18 * 60 },
    });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.title).toBe('You would get home too late');
    expect(outcome.message).toContain('19:00');
  });

  it('falls back to a plain explanation when there is no closest miss', async () => {
    const outcome = await run({ reason: 'no-feasible-sequence', message: 'x', attempts: 12 });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.title).toBe('No day fits yet');
    expect(outcome.suggestions.length).toBeGreaterThan(0);
  });

  it('distinguishes an unavailable travel service from an impossible day', async () => {
    const outcome = await createPlan({ venue: venue(), draft, families: [family()] },
      workingDeps({ buildMatrix: vi.fn(async () => { throw new Error('probe down'); }) as never }));
    expect(outcome).toMatchObject({ ok: false, title: 'Travel times are unavailable', suggestions: ['Try again in a moment'] });
  });

  it('refuses a day with nobody in it', async () => {
    const outcome = await createPlan({ venue: venue(), draft, families: [] }, workingDeps());
    expect(outcome).toMatchObject({ ok: false, title: 'Nobody is coming yet' });
  });
});

describe('a day that works', () => {
  it('returns the approved view model, not the planner’s own shape', async () => {
    const outcome = await createPlan({ venue: venue(), draft, families: [family()] }, workingDeps());
    if (!outcome.ok) throw new Error(`expected success, got ${outcome.title}`);
    expect(outcome.view.summary).toBe('A 3-hour Saturday');
    expect(outcome.view.sections.map((s) => s.label)).toEqual(['Day plan', 'Who’s coming', 'Travel & parking']);
    expect(outcome.view.stops[0].period).toBe('Morning');
  });
});

describe('the plan’s parking comes from the venue, not from the view', () => {
  /**
   * The approved section is "Travel & parking", and the sequencer has no opinion on parking. These
   * check it is read from the same facts the day was matched on, so the section cannot reassure a
   * parent about parking the day never checked.
   */
  const withParking = (over: Partial<ExternalPlaceRecord>) =>
    venue({
      enrichmentStatus: 'enriched',
      familyMetadata: {
        familypilotPlaceId: 'fp-google-anchor',
        enrichmentStatus: 'enriched',
        provenance: {},
        updatedAt: '2026-09-01',
        ...(over.familyMetadata ?? {}),
      },
      ...over,
    } as Partial<ExternalPlaceRecord>);

  it('reports confirmed free parking from the venue’s own claims', async () => {
    const outcome = await createPlan(
      {
        venue: withParking({
          familyMetadata: { familyFacilities: { parking: 'yes', freeParking: 'yes' } },
        } as Partial<ExternalPlaceRecord>),
        draft,
        families: [family()],
      },
      workingDeps(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.view.travel.parking[0].value).toBe('On site, free');
  });

  it('says unconfirmed for a venue nobody has reviewed', async () => {
    const outcome = await createPlan({ venue: venue(), draft, families: [family()] }, workingDeps());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.view.travel.parking[0].unconfirmed).toBe(true);
    }
  });

  it('passes the venue’s reviewed parking prose through untouched', async () => {
    const outcome = await createPlan(
      { venue: venue(), draft, families: [family()], parkingInfo: 'Free car park, 40 spaces' },
      workingDeps(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.view.travel.parking.at(-1)).toEqual({
        label: 'Details',
        value: 'Free car park, 40 spaces',
      });
    }
  });
});

describe('an unmet requirement is explained, and absence is never read as a fact', () => {
  /**
   * The single most likely dead end in the real journey: a parent whose profile says they must have
   * baby changing, at a venue nobody has reviewed. What they must not be told is that the venue has
   * none -- FamilyPilot has no evidence for that, and it is the kind of claim that stops a family
   * going somewhere perfectly suitable.
   *
   * The field names are the matcher's own, namespaced. A bare `toilets` would silently never match
   * its label and every one of these would collapse into one generic sentence.
   */
  const unmet = (over: Array<{ field: string; outcome: 'unsuitable' | 'unknown' }>): SequenceFailure => ({
    reason: 'requirement-unmet',
    message: 'Kentish Town City Farm does not meet what Our family requires.',
    stopIndex: 0,
    placeId: 'fp-google-anchor',
    familyId: 'mine',
    familyLabel: 'Our family',
    unmet: over,
  });

  const describe_ = async (failure: SequenceFailure) => {
    const outcome = await createPlan({ venue: venue(), draft, families: [family()] }, failing(failure));
    if (outcome.ok) throw new Error('expected a failure');
    return outcome;
  };

  it('says nobody has confirmed the facility, not that the venue lacks it', async () => {
    const outcome = await describe_(unmet([{ field: 'familyFacilities.babyChanging', outcome: 'unknown' }]));
    // "does not fit Our family yet" is the chip label dropped into prose. A household the parent
    // named keeps its name; the signed-in one becomes "your family".
    expect(outcome.title).toBe('Kentish Town City Farm does not fit your family yet');
    expect(outcome.message).toBe(
      'Nobody has confirmed baby changing at Kentish Town City Farm, and your family needs it.',
    );
    expect(outcome.message).not.toContain('does not have');
    expect(outcome.suggestions).toContain('Check with the venue before you go');
  });

  it('says the venue does not have it where that is the evidence', async () => {
    const outcome = await describe_(unmet([{ field: 'familyFacilities.toilets', outcome: 'unsuitable' }]));
    expect(outcome.message).toBe('Kentish Town City Farm does not have toilets, and your family needs it.');
    // Checking with the venue cannot change a recorded absence, so it is not offered.
    expect(outcome.suggestions).not.toContain('Check with the venue before you go');
  });

  it('names every unmet requirement rather than only the first', async () => {
    const outcome = await describe_(unmet([
      { field: 'familyFacilities.toilets', outcome: 'unsuitable' },
      { field: 'familyFacilities.parking', outcome: 'unknown' },
    ]));
    expect(outcome.message).toContain('does not have toilets');
    expect(outcome.message).toContain('Nobody has confirmed parking');
  });

  it('keeps the pushchair wording about difficulty, not about a missing facility', async () => {
    expect((await describe_(unmet([{ field: 'pushchairSuitability', outcome: 'unsuitable' }]))).message)
      .toBe('Kentish Town City Farm is recorded as difficult with a pushchair, and your family needs it to work.');
    expect((await describe_(unmet([{ field: 'pushchairSuitability', outcome: 'unknown' }]))).message)
      .toBe('Nobody has confirmed whether Kentish Town City Farm works with a pushchair, and your family needs it to.');
  });

  it('keeps a household the parent named, in their own words', async () => {
    const outcome = await describe_({
      ...unmet([{ field: 'familyFacilities.toilets', outcome: 'unsuitable' }]),
      familyLabel: 'The Hills',
    } as SequenceFailure);
    expect(outcome.title).toBe('Kentish Town City Farm does not fit The Hills yet');
  });

  it('falls back to the sequencer’s own sentence rather than printing a field name', async () => {
    const outcome = await describe_(unmet([{ field: 'someFutureConstraint', outcome: 'unsuitable' }]));
    expect(outcome.message).toBe('Kentish Town City Farm does not meet what Our family requires.');
    expect(outcome.message).not.toContain('someFutureConstraint');
  });
});

describe('a journey nobody could time is never called too long', () => {
  // Same harness as the describe above: the planner is given a sequencer that fails this one way.
  const run = (failure: SequenceFailure) =>
    createPlan({ venue: venue(), draft, families: [family()] }, failing(failure));

  /**
   * Found by rendering, not by reading. With no travel time available the Plan screen said "The
   * journey is too long", then "No travel time is known", then advised raising the travel limit --
   * three statements, two of them false. The sequencer had filed an unknown leg under
   * `travel-infeasible` because that was the only travel reason there was.
   */
  const unknown = {
    reason: 'travel-unknown' as const,
    message: 'No travel time is known between Our family and Kew Gardens.',
    from: { kind: 'home' as const, familyId: 'mine' },
    to: { kind: 'stop' as const, index: 0, placeId: 'a' },
  };

  it('says the journey could not be worked out, not that it is too long', async () => {
    const outcome = await run(unknown);
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.title).toBe('We could not work out the journey');
    expect(outcome.title.toLowerCase()).not.toContain('too long');
  });

  it('does not advise raising a limit that was never the problem', async () => {
    const outcome = await run(unknown);
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.suggestions.join(' ')).not.toMatch(/raise/i);
    expect(outcome.suggestions.join(' ')).not.toMatch(/closer/i);
    // What would actually help: a retry, or a home location that geocodes.
    expect(outcome.suggestions.some((s) => /try again/i.test(s))).toBe(true);
    expect(outcome.suggestions.some((s) => /home location/i.test(s))).toBe(true);
  });

  it('turns the household label into prose, as every other sentence does', async () => {
    const outcome = await run(unknown);
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.message).toBe('No travel time is known between your family and Kew Gardens.');
  });

  it('leaves a genuinely over-limit journey worded exactly as before', async () => {
    // The fix must not blur the two cases back together from the other side.
    const outcome = await run({ reason: 'travel-infeasible', message: 'x',
      from: { kind: 'home', familyId: 'mine' }, to: { kind: 'stop', index: 0, placeId: 'a' },
      travelMinutes: 48, limitMinutes: 30, travelSource: 'live' });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.title).toBe('The journey is too long');
    expect(outcome.message).toBe('That leg is 48 minutes, and your limit is 30.');
  });
});
