import { describe, expect, it, vi } from 'vitest';

import { snapshotForSharing, SharedFamilySnapshot } from '@/src/services/planning/connection-snapshot';
import { createPlan } from '@/src/services/planning/create-plan';
import { checksToShow, listCardMeta, otherFitProvenance } from '@/src/services/planning/halfway-view';
import { HalfwayOption, meetHalfway } from '@/src/services/planning/meet-halfway';
import { planStopFromRecord } from '@/src/services/planning/day-plan';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { PlanningFamily } from '@/src/services/planning/planner';
import { homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { FamilyProfile, Venue } from '@/src/types';
import { JourneyMatrix, SequenceFailure, StopRequest } from '@/src/types/day-sequence';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { ExternalPlaceRecord } from '@/src/types/places';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * PRIVACY: what one connected family can read about the other in Meet halfway and in the plan it hands off to.
 *
 * Two households, each with private detail (children's names and ages, must-haves, a buggy, a nap), each viewing the same
 * recommendations through what the OTHER has chosen to share: everything, everything but routines, or only a postcode.
 *
 * The rule under test: what a family shares is USED by the engine (a place that lacks a must-have is ruled out, one nobody
 * has confirmed is ranked lower, a clashing nap is planned around), but is never READ BACK to the other family. Their grade
 * is a grade, an unconfirmed need is "something they need", and nothing says which need, which child, which age or which
 * routine. Your own detail is, of course, still said to you.
 */

const OPEN: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};

// ---- two households --------------------------------------------------------------------------------------------------
const person = (id: string, name: string, role: 'parent' | 'child', age: number, dateOfBirth: string, extra: object = {}) =>
  ({ id, name, role, age, dateOfBirth, dobKnown: role === 'child', ...extra });

const ALEX: FamilyProfile = {
  id: 'alex', parentName: 'Alex Rivers',
  members: [person('a1', 'Alex', 'parent', 36, '1990-01-01'), person('a2', 'Sloane', 'child', 3, '2023-03-01', { mobility: ['walks'] }), person('a3', 'Ozzie', 'child', 0, '2026-02-01', { mobility: ['buggy'] })],
  homeLocation: 'NW3 1AB', homeLatitude: 51.5561, homeLongitude: -0.1781, mustHaveFacilities: ['toilets', 'baby_changing'], pushchair: 'Bugaboo',
  routines: [{ id: 'r1', memberId: 'a2', kind: 'nap', label: 'Sloane’s nap', time: '12:20', durationMinutes: 90, atHome: true }],
} as unknown as FamilyProfile;

const KEVIN: FamilyProfile = {
  id: 'kevin', parentName: 'Kevin Okafor',
  members: [person('k1', 'Kevin', 'parent', 38, '1988-05-05'), person('k2', 'Rowan', 'child', 4, '2022-07-09', { mobility: ['walks'] })],
  homeLocation: 'E8 3PN', homeLatitude: 51.5451, homeLongitude: -0.0602, mustHaveFacilities: ['accessible_parking', 'parking'], pushchair: null,
  routines: [{ id: 'r2', memberId: 'k2', kind: 'feed', label: 'Rowan’s lunch', time: '12:45', durationMinutes: 45, atHome: true }],
} as unknown as FamilyProfile;

/** What the other family's phone would hand over: exactly the allow-listed snapshot, as the planning family it becomes here. */
function asConnection(profile: FamilyProfile, id: string, share: 'everything' | 'no-routines' | 'postcode-only'): PlanningFamily {
  if (share === 'postcode-only') {
    const own = planningFamilyFromProfile(profile) as PlanningFamily;
    const snap = snapshotForSharing(profile);
    return { id, label: snap.label, area: snap.area, latitude: snap.latitude, longitude: snap.longitude, ages: [], pushchair: false, required: [], routines: [] };
  }
  const snap: SharedFamilySnapshot = snapshotForSharing(profile, undefined, share === 'everything');
  return {
    id, label: snap.label, area: snap.area, latitude: snap.latitude, longitude: snap.longitude, ages: snap.ages,
    ...(typeof snap.maxDriveMinutes === 'number' ? { maxDriveMinutes: snap.maxDriveMinutes } : {}),
    pushchair: snap.pushchair, required: snap.required, routines: snap.routines ?? [],
  } as PlanningFamily;
}
const own = (profile: FamilyProfile): PlanningFamily => ({ ...(planningFamilyFromProfile(profile) as PlanningFamily), id: 'mine' });

// ---- places: nothing confirmed about facilities, so every must-have is "unconfirmed" and ranked, never ruled out ------------
const facts = (id: string, over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: id, name: id, category: 'park', driveMinutes: 0, enrichmentStatus: 'verified', minRecommendedAge: 0, maxRecommendedAge: 8,
  venueAgePolicy: null, toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', blueBadgeParking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'outdoor', energyLevel: 'moderate', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown', ...over,
});
const place = (id: string, lat: number, lon: number, over: Partial<MatchableVenueFacts> = {}): Venue =>
  ({ id, name: id, category: 'park', latitude: lat, longitude: lon, driveMinutes: 0, imageUrl: '', familyScore: { score: 70, factors: {} as never, explanation: [] },
     structuredOpeningHours: OPEN, trustedFacts: facts(id, over), facilities: [], enrichmentStatus: 'verified' }) as Venue;

const VENUES = [
  place('Fair Fields', 51.55, -0.12),
  place('Narrow Ages Park', 51.552, -0.1, { minRecommendedAge: 9, maxRecommendedAge: 14 }),
  place('Clash Common', 51.549, -0.13),
];

// ---- everything the screen can say, from the engine's output -----------------------------------------------------------------
const clock = { date: '2026-10-17', arriveAt: '10:30', today: '2026-10-12', nowMinutes: 9 * 60 };

/** Every string and structure that reaches a card, the sheet, a list row or an accessibility label about the OTHER family. */
function surfaces(option: HalfwayOption, otherLabel: string): string {
  const checks = checksToShow(option);
  // The viewer's own timing sentence is theirs to read ("A nap or feed of yours falls…"); it is not about the other household.
  const notOwnTiming = (line: string) => !/^A nap or feed of yours|^Works around the .* for your family$/.test(line);
  return [
    // what the cards and sheet render
    ...checks.needs, ...checks.others, listCardMeta(option),
    JSON.stringify(option.fits.other), JSON.stringify(otherFitProvenance(option.fits.other, otherLabel)),
    // what the engine hands to any consumer
    ...option.toCheck, ...option.needsChecking, ...option.reasons, ...option.otherNotes, JSON.stringify(option.unresolved.filter((u) => u.role === 'other')),
  ].filter(notOwnTiming).join(' | ');
}

/** What must never appear in what a viewer reads about the other household. */
const PRIVATE = {
  ALEX: [/toilets?/i, /baby changing/i, /\bbuggy\b|\bpushchair\b|\bBugaboo\b/i, /\bnap\b|\bfeeds?\b|\broutines?\b|home time/i, /Sloane|Ozzie|Rivers/, /\bwalks\b/i, /NW3|1AB/, /12:20|12:30/, /51\.55|-0\.17/, /2023|2026-02/, /\byears?[ -]old\b|\bmonths?\b|\baged?\b/i],
  KEVIN: [/blue badge|accessible parking|accessible_parking/i, /\bparking\b/i, /Rowan|Okafor/, /\bfeeds?\b|\bnap\b|\broutines?\b|lunch/i, /E8 3PN|3PN/, /12:45/, /51\.54|-0\.06/, /2022|1988/, /\byears?[ -]old\b|\bmonths?\b|\baged?\b/i, /\bwheelchair|mobility|step-free/i],
};

const direction = (viewer: 'ALEX' | 'KEVIN', share: 'everything' | 'no-routines' | 'postcode-only') => {
  const viewerProfile = viewer === 'ALEX' ? ALEX : KEVIN;
  const otherProfile = viewer === 'ALEX' ? KEVIN : ALEX;
  const other = asConnection(otherProfile, 'connected-1', share);
  const result = meetHalfway({ venues: VENUES, mine: own(viewerProfile), other, ...clock, environment: 'either' });
  return { result, other, otherKey: viewer === 'ALEX' ? ('KEVIN' as const) : ('ALEX' as const) };
};

describe('each household viewing the same places through what the other shares: nothing private of the other is read back', () => {
  const variants = ['everything', 'no-routines', 'postcode-only'] as const;
  for (const viewer of ['ALEX', 'KEVIN'] as const) {
    for (const share of variants) {
      it(`${viewer} sees ${viewer === 'ALEX' ? 'Kevin' : 'Alex'}’s household, which shares: ${share}`, () => {
        const { result, other, otherKey } = direction(viewer, share);
        expect(result.options.length).toBeGreaterThan(0);
        for (const option of result.options) {
          const said = surfaces(option, other.label);
          for (const pattern of PRIVATE[otherKey]) expect(said, `${option.venue.id}: ${pattern}`).not.toMatch(pattern);
        }
      });
    }
  }

  it('the other household’s must-haves are still USED: a place where they are unconfirmed is flagged and ranked, never ignored', () => {
    const { result } = direction('ALEX', 'everything');
    const flagged = result.options.filter((o) => o.unresolved.some((u) => u.role === 'other'));
    expect(flagged.length).toBeGreaterThan(0);
    // The same places for a household that shares only a postcode have nothing flagged for them.
    const bare = direction('ALEX', 'postcode-only').result;
    expect(bare.options.every((o) => !o.unresolved.some((u) => u.role === 'other'))).toBe(true);
    // And using them changed the ranking score (one unconfirmed requirement costs a place its standing), as before.
    const withNeeds = direction('ALEX', 'everything').result.options.find((o) => o.venue.id === 'Fair Fields')!;
    const without = bare.options.find((o) => o.venue.id === 'Fair Fields')!;
    expect(withNeeds.score).toBeLessThan(without.score);
  });

  it('what is unconfirmed for the OTHER family reads "something they need", for yours it reads what it is', () => {
    const alexSeesKevin = direction('ALEX', 'everything');
    const fair = alexSeesKevin.result.options.find((o) => o.venue.id === 'Fair Fields')!;
    expect(fair.needsChecking).toContain('Toilets and baby changing isn’t confirmed at Fair Fields, and your family needs it. Check before you go');
    expect(fair.needsChecking).toContain('Something Kevin’s family needs isn’t confirmed at Fair Fields. Check before you go');
    const kevinSeesAlex = direction('KEVIN', 'everything');
    const fairForKevin = kevinSeesAlex.result.options.find((o) => o.venue.id === 'Fair Fields')!;
    expect(fairForKevin.needsChecking.join(' ')).toMatch(/Something Alex’s family needs isn’t confirmed at Fair Fields/);
    expect(fairForKevin.needsChecking.join(' ')).not.toMatch(/toilet|baby changing/i);
  });

  it('a household that shares only a postcode is "Not assessed", with nothing said about what it did not share beyond that', () => {
    for (const viewer of ['ALEX', 'KEVIN'] as const) {
      const { result, other } = direction(viewer, 'postcode-only');
      for (const option of result.options) {
        expect(option.fits.other).toEqual({ verdict: 'not_assessed', label: 'Not assessed', qualified: false });
        expect(otherFitProvenance(option.fits.other, other.label).headline).toBe('Not assessed');
      }
    }
  });

  it('their grade is a grade: never more than a verdict word, a qualified flag and nothing else', () => {
    for (const viewer of ['ALEX', 'KEVIN'] as const) {
      const { result } = direction(viewer, 'everything');
      for (const option of result.options) {
        expect(Object.keys(option.fits.other).sort()).toEqual(['label', 'qualified', 'verdict']);
        // Never qualified, never "Looks practical": a partly supported grade is shown one step down, without saying why.
        expect(option.fits.other.qualified).toBe(false);
        expect(['Excellent fit', 'Good fit', 'Possible fit', 'Not recommended', 'Not yet reviewed']).toContain(option.fits.other.label);
      }
    }
  });

  it('sharing routines changes whether the engine plans around them, not what is said about them', () => {
    const shared = direction('ALEX', 'everything').result.options.find((o) => o.venue.id === 'Clash Common')!;
    const notShared = direction('ALEX', 'no-routines').result.options.find((o) => o.venue.id === 'Clash Common')!;
    // The text about their timing, where there is any, is identical in kind and names no routine either way.
    for (const option of [shared, notShared]) expect([...option.toCheck, ...option.reasons].filter((l) => !/^A nap or feed of yours/.test(l)).join(' ')).not.toMatch(/Rowan|feed|lunch|12:45|routine/i);
  });

  it('the viewer’s own detail is still said to the viewer', () => {
    const { result } = direction('ALEX', 'everything');
    const fair = result.options.find((o) => o.venue.id === 'Fair Fields')!;
    expect(fair.needsChecking.join(' ')).toMatch(/Toilets and baby changing/);
    expect(fair.fits.mine.verdict).toBeDefined();
  });

  it('ranking is unchanged by the wording: the same places in the same order as before the correction would give for these inputs', () => {
    const a = direction('ALEX', 'everything').result.options.map((o) => [o.venue.id, Math.round(o.score * 100) / 100]);
    const b = direction('ALEX', 'everything').result.options.map((o) => [o.venue.id, Math.round(o.score * 100) / 100]);
    expect(a).toEqual(b);
  });
});

// ---- the plan this hands off to ----------------------------------------------------------------------------------------------
describe('the plan it hands off to does not read the other family’s requirements back either', () => {
  const stop = (over: Partial<MatchableVenueFacts> = {}): StopRequest => ({ placeId: 'fp-farm', name: 'Kentish Town City Farm', role: 'activity', anchor: true, dwellMinutes: 90, facts: { ...facts('fp-farm'), name: 'Kentish Town City Farm', ...over } });
  const matrix = (): JourneyMatrix => ({
    legs: {
      [homeKey('mine')]: { [stopKey('fp-farm')]: { minutes: 20, source: 'estimated' } },
      [homeKey('connected-1')]: { [stopKey('fp-farm')]: { minutes: 25, source: 'estimated' } },
      [stopKey('fp-farm')]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' }, [homeKey('connected-1')]: { minutes: 25, source: 'estimated' } },
    },
  });
  const options = { date: '2026-10-17', leaveAt: '09:00', returnBy: '', bufferMinutes: 15, environment: 'either' as const };
  const view = (who: PlanningFamily[]) => {
    const result = sequenceDay([stop()], who, matrix(), options, new Date('2026-10-12T08:00:00'));
    if (!result.ok) throw new Error('expected a plan');
    return toPlanViewModel({ itinerary: result.itinerary, travel: { provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [] }, caveats: [], anchorName: 'Kentish Town City Farm' });
  };

  it('"Needs checking" says that something they need is unconfirmed, not what; yours says what', () => {
    const lines = view([own(ALEX), asConnection(KEVIN, 'connected-1', 'everything')]).needsChecking;
    expect(lines).toContain('Something Kevin’s family needs isn’t confirmed at Kentish Town City Farm. Check before you go.');
    expect(lines.join(' ')).toMatch(/Toilets and baby changing|Toilets/i);
    expect(lines.filter((l) => /Kevin/.test(l)).join(' ')).not.toMatch(/parking|blue badge|accessible|wheelchair|mobility/i);
  });

  it('is the same sentence whether they need one thing or several', () => {
    const one = asConnection(KEVIN, 'connected-1', 'everything');
    const several: PlanningFamily = { ...one, required: ['toilets', 'babyChanging', 'parking', 'blueBadgeParking'] };
    const a = view([own(ALEX), { ...one, required: ['blueBadgeParking'] }]).needsChecking.filter((l) => /Kevin/.test(l));
    const b = view([own(ALEX), several]).needsChecking.filter((l) => /Kevin/.test(l));
    expect(a).toEqual(b);
  });

  it('a requirement the place is confirmed to lack, for the OTHER family, is refused without naming it or calling it yours', async () => {
    const failure: SequenceFailure = {
      reason: 'requirement-unmet', message: 'Kentish Town City Farm does not meet what Kevin’s family requires.', stopIndex: 0, placeId: 'fp-google-anchor',
      familyId: 'connected-1', familyLabel: 'Kevin’s family', unmet: [{ field: 'accessibility.accessibleParking', outcome: 'unsuitable' }],
    };
    const record = { familypilotId: 'fp-google-anchor', name: 'Kentish Town City Farm', category: 'farm', latitude: 51.55, longitude: -0.15, provider: 'google' } as ExternalPlaceRecord;
    const deps = { buildMatrix: vi.fn(async () => ({ matrix: {}, provenance: { live: 1, estimated: 0 }, trafficDowngraded: false, missing: [] })) as never, sequence: vi.fn(() => ({ ok: false as const, failure })) as never, probe: vi.fn() as never, now: new Date('2026-10-10T08:00:00Z') };
    const draft = { date: '2026-10-17', startAt: '09:30', partyIds: ['mine', 'connected-1'], attendeeIds: null, visit: 90 as const, returnBy: '', bufferMinutes: 15, environment: 'either' as const };
    const outcome = await createPlan({ venue: planStopFromRecord(record), draft, families: [own(ALEX), asConnection(KEVIN, 'connected-1', 'everything')] }, deps);
    if (outcome.ok) throw new Error('expected a failure');
    const text = [outcome.title, outcome.message, ...outcome.suggestions].join(' ');
    expect(text).toMatch(/Kevin’s family/);
    expect(text).not.toMatch(/Blue Badge|parking|your family needs|your must-haves/i);
  });
});

// ---- the screen only reads the safe projections -----------------------------------------------------------------------------
describe('the Meet halfway screen reads only the viewer-safe projections of an option', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const files = ['src/components/together/MeetHalfwayView.tsx', 'src/components/halfway/ListCard.tsx', 'src/components/halfway/Sheet.tsx', 'src/components/halfway/parts.tsx', 'src/components/halfway/States.tsx', 'src/components/halfway/EditSheet.tsx', 'src/components/halfway/chrome.tsx'];
  const code = (file: string) => readFileSync(join(__dirname, '..', '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, '');

  it('never reads the engine’s free-text or structured lists directly (toCheck, needsChecking, reasons, otherNotes, unresolved)', () => {
    // (parts.tsx's FamilyFitMine reads YOUR OWN venue.familyMatch lines: your own household, said to you.)
    const partsWithoutMine = code('src/components/halfway/parts.tsx').replace(/export function FamilyFitMine[\s\S]*?\n\}\n/, '');
    for (const file of files) expect(file === 'src/components/halfway/parts.tsx' ? partsWithoutMine : code(file), file).not.toMatch(/\.(toCheck|needsChecking|reasons|otherNotes|unresolved)\b/);
  });

  it('what it lists to check goes through checksToShow, and the other family’s grade through otherFitProvenance', () => {
    expect(code('src/components/halfway/ListCard.tsx')).toContain('checksToShow(option)');
    expect(code('src/components/halfway/Sheet.tsx')).toContain('checksToShow(option)');
    expect(code('src/components/halfway/parts.tsx')).toContain('otherFitProvenance(fit, label)');
  });

  it('says nothing about how the other family’s routines were shared (no "home time" note)', () => {
    for (const file of files) expect(code(file), file).not.toMatch(/routinesLegacy|legacy-routines|shared when they/);
  });

  it('the other family’s Family Fit card shows a grade, a generic sentence, and nothing read from their snapshot', () => {
    const parts = code('src/components/halfway/parts.tsx');
    const start = parts.indexOf('export function FamilyFitOther');
    const other = parts.slice(start, parts.indexOf('\n}\n', start));
    expect(other).not.toMatch(/evidence|missing|ages|required|pushchair|routines|children|familyMatch/);
  });
});
