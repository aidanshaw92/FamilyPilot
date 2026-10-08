import { describe, expect, it } from 'vitest';

import { evaluateVenueRules, ruleAppliesOn } from '@/src/services/matching/venue-rules';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { PlanningFamily, familyRequest } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { createPlan } from '@/src/services/planning/create-plan';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { JourneyMatrix, StopRequest } from '@/src/types/day-sequence';
import type { VenueRule } from '@/src/types/venue-rules';

/**
 * The rules are real sentences from the ten pilot venues (docs/pilot/profiles), written as the reviewer would approve them.
 * What is being proven is the line between block, warn and say nothing: a closed date is never scheduled; a pushchair
 * restriction stops only a household that depends on a pushchair and warns one that merely brings one; a step-free gap speaks
 * only to a party that needs step-free; nothing here changes a score.
 */

const DISCOVER_PUSHCHAIRS: VenueRule = {
  id: 'pushchair-play-areas', kind: 'pushchair', scope: 'area', area: 'storytelling and play areas', coversCoreVisit: true,
  text: 'Pushchairs and buggies are not allowed in any storytelling or play area. Buggy parking is on the ground floor; bring a sling for a smaller baby.',
};
const SCIENCE_CLOSED: VenueRule = {
  id: 'closed-2026-10-09', kind: 'closure', scope: 'venue', from: '2026-10-09', until: '2026-10-09',
  text: 'Closed on 9 October.',
};
const NHM_GALLERY: VenueRule = {
  id: 'closed-nature-gallery', kind: 'closure', scope: 'area', area: 'Nature Gallery', until: '2027-02-05',
  text: 'The Nature Gallery and Nature Discovery Den are closed until 5 February 2027.',
};
const MUDCHUTE_MONDAYS: VenueRule = {
  id: 'courtyard-mondays', kind: 'closure', scope: 'area', area: 'Main courtyard', weekdays: [1], affectsFacilities: ['toilets', 'babyChanging'],
  text: 'The main courtyard, with the toilets and baby changing, is closed on Mondays outside school holidays.',
};
const SCIENCE_MEZZANINE: VenueRule = {
  id: 'mezzanine-step-free', kind: 'step_free', scope: 'area', area: 'Mezzanine',
  text: 'No step-free access to the mezzanine in Making the Modern World and Flight.',
};
const BUSY: VenueRule = { id: 'queue', kind: 'caution', scope: 'venue', text: 'Weekends and school holidays can mean a queue to enter.' };

const visit = (over: Partial<Parameters<typeof evaluateVenueRules>[1]> = {}) => ({
  date: '2026-10-10', usesPushchair: false, requiresPushchair: false, needsStepFree: false, ...over,
});

describe('which date a rule is in force', () => {
  it('reads from and until inclusively, and weekdays narrow further', () => {
    expect(ruleAppliesOn(SCIENCE_CLOSED, '2026-10-09')).toBe(true);
    expect(ruleAppliesOn(SCIENCE_CLOSED, '2026-10-10')).toBe(false);
    expect(ruleAppliesOn(NHM_GALLERY, '2027-02-05')).toBe(true);
    expect(ruleAppliesOn(NHM_GALLERY, '2027-02-06')).toBe(false);
    expect(ruleAppliesOn(MUDCHUTE_MONDAYS, '2026-10-12')).toBe(true); // a Monday
    expect(ruleAppliesOn(MUDCHUTE_MONDAYS, '2026-10-13')).toBe(false);
  });
});

describe('what a rule is allowed to do', () => {
  it('refuses only the closed date', () => {
    expect(evaluateVenueRules([SCIENCE_CLOSED], visit({ date: '2026-10-09' })).closedAllDay?.id).toBe('closed-2026-10-09');
    expect(evaluateVenueRules([SCIENCE_CLOSED], visit({ date: '2026-10-10' })).closedAllDay).toBeNull();
  });

  it('never rules a venue out for ever on an undated closure: it warns instead', () => {
    const undated: VenueRule = { id: 'closed', kind: 'closure', scope: 'venue', text: 'Closed for refurbishment.' };
    const verdict = evaluateVenueRules([undated], visit());
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.notes.map((n) => n.severity)).toEqual(['important']);
  });

  it('an area closure informs and does not block', () => {
    const verdict = evaluateVenueRules([NHM_GALLERY], visit());
    expect(verdict.closedAllDay).toBeNull();
    expect(verdict.blocksHousehold).toBeNull();
    expect(verdict.notes).toEqual([{ ruleId: 'closed-nature-gallery', severity: 'info', text: NHM_GALLERY.text }]);
  });

  it('a closure that takes away a must-have facility is prominent only for a household that listed it', () => {
    const monday = visit({ date: '2026-10-12' });
    expect(evaluateVenueRules([MUDCHUTE_MONDAYS], { ...monday, requiredFacilities: ['toilets'] }).notes[0].severity).toBe('important');
    expect(evaluateVenueRules([MUDCHUTE_MONDAYS], monday).notes[0].severity).toBe('info');
  });

  it('a pushchair restriction blocks a household that depends on one, warns one that brings one, and ignores one that does not', () => {
    expect(evaluateVenueRules([DISCOVER_PUSHCHAIRS], visit({ usesPushchair: true, requiresPushchair: true })).blocksHousehold?.id).toBe('pushchair-play-areas');
    const warns = evaluateVenueRules([DISCOVER_PUSHCHAIRS], visit({ usesPushchair: true }));
    expect(warns.blocksHousehold).toBeNull();
    expect(warns.notes).toEqual([{ ruleId: 'pushchair-play-areas', severity: 'important', text: DISCOVER_PUSHCHAIRS.text }]);
    expect(evaluateVenueRules([DISCOVER_PUSHCHAIRS], visit())).toEqual({ closedAllDay: null, blocksHousehold: null, notes: [] });
  });

  it('a pushchair restriction the reviewer did not mark as covering the visit never blocks', () => {
    const corner: VenueRule = { ...DISCOVER_PUSHCHAIRS, id: 'soft-play-corner', coversCoreVisit: false };
    const verdict = evaluateVenueRules([corner], visit({ usesPushchair: true, requiresPushchair: true }));
    expect(verdict.blocksHousehold).toBeNull();
    expect(verdict.notes[0].severity).toBe('important');
  });

  it('a step-free gap speaks only to a party that needs step-free', () => {
    expect(evaluateVenueRules([SCIENCE_MEZZANINE], visit()).notes).toEqual([]);
    expect(evaluateVenueRules([SCIENCE_MEZZANINE], visit({ usesPushchair: true })).notes).toEqual([]);
    expect(evaluateVenueRules([SCIENCE_MEZZANINE], visit({ needsStepFree: true })).notes[0].severity).toBe('important');
  });

  it('puts what needs action before what is merely worth knowing', () => {
    const notes = evaluateVenueRules([BUSY, DISCOVER_PUSHCHAIRS], visit({ usesPushchair: true })).notes;
    expect(notes.map((n) => n.severity)).toEqual(['important', 'info']);
  });

  it('a venue with no rules returns nothing, which is not a statement that none apply', () => {
    expect(evaluateVenueRules(undefined, visit())).toEqual({ closedAllDay: null, blocksHousehold: null, notes: [] });
    expect(evaluateVenueRules([], visit())).toEqual({ closedAllDay: null, blocksHousehold: null, notes: [] });
  });
});

const baseFacts = (rules?: VenueRule[]): MatchableVenueFacts => ({
  placeId: 'fp-v', name: 'Discover Children’s Story Centre', category: 'museum', driveMinutes: 20, enrichmentStatus: 'verified',
  minRecommendedAge: 0, maxRecommendedAge: 8, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'unknown',
  pushchairSuitability: 'good', environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: 120, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'unknown', ...(rules ? { rules } : {}),
});

const family = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'a', label: 'Family A', area: 'Town', latitude: 51.5, longitude: -0.1, ages: [1], maxDriveMinutes: 45,
  pushchair: true, required: [], routines: [], ...over,
});

describe('the matcher and the sequencer honour a hard rule', () => {
  it('a household that requires buggy access is refused a venue where pushchairs are not allowed in the core visit', () => {
    const required = family({ required: ['pushchair'] });
    const match = matchVenueToDayRequest(baseFacts([DISCOVER_PUSHCHAIRS]), familyRequest(required, 'either', '2026-10-10'));
    expect(match.eligible).toBe(false);
    expect(match.evaluations.find((e) => e.field === 'venueRules')).toMatchObject({ strength: 'required', outcome: 'unsuitable', detail: DISCOVER_PUSHCHAIRS.text });
  });

  it('the same venue stays eligible for a household that merely brings a pushchair, and for one without', () => {
    expect(matchVenueToDayRequest(baseFacts([DISCOVER_PUSHCHAIRS]), familyRequest(family(), 'either', '2026-10-10')).eligible).toBe(true);
    expect(matchVenueToDayRequest(baseFacts([DISCOVER_PUSHCHAIRS]), familyRequest(family({ pushchair: false }), 'either', '2026-10-10')).evaluations.some((e) => e.field === 'venueRules')).toBe(false);
  });

  it('recording a rule changes no score: eligible households score the same with and without it', () => {
    const without = matchVenueToDayRequest(baseFacts(), familyRequest(family(), 'either', '2026-10-10'));
    const withRule = matchVenueToDayRequest(baseFacts([DISCOVER_PUSHCHAIRS, NHM_GALLERY, BUSY]), familyRequest(family(), 'either', '2026-10-10'));
    expect(withRule.preferredPoints).toBe(without.preferredPoints);
    expect(withRule.preferredUnknowns).toBe(without.preferredUnknowns);
    expect(withRule.preferredUnsuitable).toBe(without.preferredUnsuitable);
    expect(withRule.fit).toBe(without.fit);
  });

  const request = (rules: VenueRule[]): StopRequest => ({
    placeId: 'fp-v', name: 'Discover Children’s Story Centre', role: 'activity', anchor: true, dwellMinutes: 90, facts: baseFacts(rules),
  });
  const matrix: JourneyMatrix = { legs: {
    [homeKey('a')]: { [stopKey('fp-v')]: { minutes: 20, source: 'estimated' } },
    [stopKey('fp-v')]: { [homeKey('a')]: { minutes: 20, source: 'estimated' } },
  } };
  const options = (date: string): SequenceOptions => ({ date, leaveAt: '09:00', arriveAt: '10:30', returnBy: '', bufferMinutes: 15, environment: 'either' } as SequenceOptions);
  const now = new Date('2026-10-08T08:00:00');

  it('does not schedule a venue on a date a reviewed rule closes it, even when the provider hours say open', () => {
    const closed = sequenceDay([request([SCIENCE_CLOSED])], [family()], matrix, options('2026-10-09'), now);
    expect(closed.ok).toBe(false);
    if (!closed.ok) {
      const failure = closed.failure.reason === 'no-feasible-sequence' && closed.failure.nearest ? closed.failure.nearest : closed.failure;
      expect(failure).toMatchObject({ reason: 'venue-closed', why: 'closed-that-day', message: 'Closed on 9 October.' });
    }
    expect(sequenceDay([request([SCIENCE_CLOSED])], [family()], matrix, options('2026-10-10'), now).ok).toBe(true);
  });

  it('refuses a buggy-dependent household with the venue’s own sentence, not a paraphrase', () => {
    const result = sequenceDay([request([DISCOVER_PUSHCHAIRS])], [family({ required: ['pushchair'] })], matrix, options('2026-10-10'), now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const failure = result.failure.reason === 'no-feasible-sequence' && result.failure.nearest ? result.failure.nearest : result.failure;
      expect(failure).toMatchObject({ reason: 'requirement-unmet' });
      expect(JSON.stringify(failure)).toContain('venueRules');
    }
  });
});

describe('createPlan carries the venue’s warnings into the saved plan', () => {
  const draft: PlanDraft = { date: '2026-10-10', startAt: '10:30', partyIds: ['mine'], attendeeIds: null, visit: 90, returnBy: '', bufferMinutes: 15, environment: 'either' };
  const stop = (rules?: VenueRule[]) => ({
    placeId: 'fp-v', name: 'Discover Children’s Story Centre', category: 'museum' as const, latitude: 51.54, longitude: -0.0,
    facts: baseFacts(rules),
  });
  const matrixBuilder = (async () => ({
    matrix: { legs: {
      [homeKey('mine')]: { [stopKey('fp-v')]: { minutes: 20, source: 'estimated' } },
      [stopKey('fp-v')]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' } },
    } },
    provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [],
  })) as never;
  const deps = { buildMatrix: matrixBuilder, now: new Date('2026-10-08T08:00:00') };

  it('puts a pushchair restriction at the top for a family that brings one, and keeps it on the saved source', async () => {
    const outcome = await createPlan({ venue: stop([DISCOVER_PUSHCHAIRS, BUSY]) as never, draft, families: [family({ id: 'mine' })] }, deps);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.view.needsChecking).toContain(DISCOVER_PUSHCHAIRS.text);
    expect(outcome.view.caveats).toContain(BUSY.text);
    // Re-rendering the saved source later shows the same warnings.
    const reopened = toPlanViewModel(JSON.parse(JSON.stringify(outcome.source)));
    expect(reopened.needsChecking).toContain(DISCOVER_PUSHCHAIRS.text);
    expect(reopened.caveats).toContain(BUSY.text);
  });

  it('does not mention a pushchair restriction to a family with no pushchair', async () => {
    const outcome = await createPlan({ venue: stop([DISCOVER_PUSHCHAIRS]) as never, draft, families: [family({ id: 'mine', pushchair: false })] }, deps);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.view.needsChecking.join(' ')).not.toContain('Pushchairs');
  });

  it('refuses to build the day for a household that requires buggy access, and says why in the venue’s words', async () => {
    const outcome = await createPlan({ venue: stop([DISCOVER_PUSHCHAIRS]) as never, draft, families: [family({ id: 'mine', required: ['pushchair'] })] }, deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('Pushchairs and buggies are not allowed in any storytelling or play area');
  });
});

// ---- Family Fit and Home -------------------------------------------------------------------------------------------
import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

describe('Family Fit reads the venue’s rules without moving any score', () => {
  const NOW = new Date(2026, 9, 9, 11, 0, 0); // Friday 9 October 2026, 11:00
  const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
  const child = (id: string, name: string, age: number, mobility: FamilyMember['mobility'] = ['walks']): FamilyMember => ({
    id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: null, mobility,
  });
  const profile = (members: FamilyMember[]): FamilyProfile => ({
    id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30,
    completionPercent: 100, mustHaveFacilities: [], routines: [],
  } as FamilyProfile);
  const OPEN: OpeningHoursSchedule = {
    timezone: 'Europe/London',
    periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
  };
  const venueWith = (rules?: VenueRule[]): Venue => ({
    id: 'fp-v', name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
    structuredOpeningHours: OPEN, facilities: [],
    trustedFacts: { ...baseFacts(rules), minRecommendedAge: 0, maxRecommendedAge: 8 },
  } as Venue);

  it('shows Closed today when a reviewed rule closes the venue today, whatever the weekly hours say', () => {
    const match = evaluateFamilyMatch({ venue: venueWith([SCIENCE_CLOSED]), profile: profile([child('c', 'Sloane', 4)]), score: 80, now: NOW });
    expect(match.availableToday).toBe(false);
    expect(match.today).toMatchObject({ state: 'closed_today', label: 'Closed today' });
    // The fit itself is untouched by the day.
    const open = evaluateFamilyMatch({ venue: venueWith(), profile: profile([child('c', 'Sloane', 4)]), score: 80, now: NOW });
    expect(match.verdict).toBe(open.verdict);
    expect(open.availableToday).toBe(true);
  });

  it('says the pushchair rule as a breach for a child whose buggy is the only way round, and as a caution for one who can be carried', () => {
    const buggyOnly = evaluateFamilyMatch({ venue: venueWith([DISCOVER_PUSHCHAIRS]), profile: profile([child('c', 'Theo', 1, ['buggy'])]), score: 80, now: NOW });
    expect(buggyOnly.cautions.map((l) => l.text)).toContain(DISCOVER_PUSHCHAIRS.text);
    expect(buggyOnly.verdict).toBe('poor');
    const carried = evaluateFamilyMatch({ venue: venueWith([DISCOVER_PUSHCHAIRS]), profile: profile([child('c', 'Theo', 1, ['buggy', 'carrier'])]), score: 80, now: NOW });
    expect(carried.cautions.map((l) => l.text)).toContain(DISCOVER_PUSHCHAIRS.text);
    expect(carried.verdict).not.toBe('poor');
  });

  it('is silent about pushchairs to a family that has none, and never changes the score input', () => {
    const none = evaluateFamilyMatch({ venue: venueWith([DISCOVER_PUSHCHAIRS]), profile: profile([child('c', 'Sloane', 4)]), score: 80, now: NOW });
    expect([...none.cautions, ...none.toCheck].some((l) => l.text === DISCOVER_PUSHCHAIRS.text)).toBe(false);
    expect(none.verdict).toBe(evaluateFamilyMatch({ venue: venueWith(), profile: profile([child('c', 'Sloane', 4)]), score: 80, now: NOW }).verdict);
  });
});
