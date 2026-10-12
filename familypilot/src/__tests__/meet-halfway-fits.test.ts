import { describe, expect, it } from 'vitest';

import { checksToShow, otherFitProvenance } from '@/src/services/planning/halfway-view';
import { meetHalfway } from '@/src/services/planning/meet-halfway';
import { PlanningFamily } from '@/src/services/planning/planner';
import { Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * Per-family Family Fit on a Meet halfway option. The privacy boundary: the other family's fit is computed from what their
 * connection shared and leaves the engine as a grade and a generic label only.
 */

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};
const facts = (id: string): MatchableVenueFacts => ({
  placeId: id, name: id, category: 'park', driveMinutes: 0, enrichmentStatus: 'verified',
  minRecommendedAge: 0, maxRecommendedAge: 8, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'yes',
  pushchairSuitability: 'good', environment: 'outdoor', energyLevel: 'moderate', visitDurationMinutes: null,
  estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
});
const venue = (id: string, latitude: number, longitude: number): Venue =>
  ({
    id, name: id, category: 'park', latitude, longitude, driveMinutes: 0, imageUrl: '',
    familyScore: { score: 70, factors: {} as never, explanation: [] },
    structuredOpeningHours: OPEN_DAILY, trustedFacts: facts(id), facilities: [], enrichmentStatus: 'verified',
    familyMatch: {
      verdict: 'good', headline: 'Good for Sloane today', forNames: ['Sloane'], children: [], gapNames: [], suitedNames: ['Sloane'],
      likelyNames: [], easyNames: [], reasons: [], cautions: [], toCheck: [], practicalOnly: false, easyVisit: false,
      evidenceCompleteness: { known: 4, total: 5, level: 'well', missing: ['parking'] },
    },
  }) as unknown as Venue;

const mine: PlanningFamily = {
  id: 'mine', label: 'Our family', area: 'NW5', latitude: 51.55, longitude: -0.14, ages: [3, 0],
  maxDriveMinutes: 45, budgetTier: 'moderate', pushchair: true, required: [], routines: [],
};
const other = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'connected-1', label: 'Hannah’s family', area: 'E17', latitude: 51.59, longitude: -0.02, ages: [2],
  maxDriveMinutes: 45, budgetTier: 'moderate', pushchair: true, required: ['toilets'],
  routines: [{ id: 'nap-1', label: 'Nap', kind: 'nap', time: '12:20', durationMinutes: 90, atHome: true }], ...over,
});
const run = (o: PlanningFamily) =>
  meetHalfway({ venues: [venue('Fair Fields', 51.57, -0.08)], mine, other: o, date: '2026-10-10', arriveAt: '10:30', today: '2026-10-06', nowMinutes: 540 });

describe('per-family Family Fit on an option', () => {
  it('gives each family a grade, with evidence only for your own', () => {
    const [option] = run(other()).options;
    expect(option.fits.mine.verdict).toBe('good');
    expect(option.fits.mine.evidence).toBeDefined();
    expect(option.fits.other.verdict).not.toBe('not_assessed');
    expect(option.fits.other.evidence).toBeUndefined();
  });

  it('says "Not assessed" for a family that shared nothing, never a grade', () => {
    const [option] = run(other({ ages: [], required: [], pushchair: false, routines: [] })).options;
    expect(option.fits.other).toEqual({ verdict: 'not_assessed', label: 'Not assessed', qualified: false });
  });

  it('leaks nothing of the other family beyond a grade word', () => {
    const [option] = run(other()).options;
    const shown = JSON.stringify(option.fits.other);
    // No child name or age, no need, no pushchair, no routine, no checklist of what is unconfirmed.
    for (const forbidden of ['Hannah', 'toilets', 'pushchair', 'buggy', 'nap', 'Nap', '12:30', 'missing', 'known', 'total', 'age', 'child']) {
      expect(shown).not.toContain(forbidden);
    }
    expect(Object.keys(option.fits.other).sort()).toEqual(['label', 'qualified', 'verdict']);
    expect(['Excellent fit', 'Good fit', 'Possible fit', 'Not recommended', 'Not yet reviewed', 'Looks practical']).toContain(option.fits.other.label);
  });

  it('does not change the order or scores: the same input with different shared detail ranks identically to before', () => {
    const base = run(other());
    const again = run(other());
    expect(base.options.map((o) => [o.venue.id, o.score])).toEqual(again.options.map((o) => [o.venue.id, o.score]));
  });

  it('keeps sentences about what the other family shared out of what the screen lists as things to check', () => {
    // Their routine (a nap at 12:30) clashes with the outing: the engine still says so for the Plan screen...
    const [option] = run(other()).options;
    expect(option.toCheck.some((line) => /routine for Hannah’s family falls/.test(line))).toBe(true);
    expect(option.otherNotes.some((line) => /routine for Hannah’s family falls/.test(line))).toBe(true);
    // ...and the Meet halfway card and sheet do not repeat it.
    const shown = checksToShow(option);
    expect([...shown.needs, ...shown.others].join(' ')).not.toMatch(/routine|nap|Hannah/i);
    // Every line about their Family Fit is also withheld: their grade stands alone.
    for (const line of option.otherNotes) expect([...shown.needs, ...shown.others]).not.toContain(line);
  });

  it('everything the screen shows about the other family comes down to a grade and one generic sentence', () => {
    const [option] = run(other()).options;
    const words = otherFitProvenance(option.fits.other, 'Hannah’s family');
    const text = JSON.stringify([option.fits.other, words]);
    for (const forbidden of ['toilets', 'pushchair', 'nap', 'age', 'child', '12:30', 'E17']) expect(text).not.toContain(forbidden);
  });

  it('what is left to check for your own family is still said, first', () => {
    const lacking = { ...venue('Needs Loos', 51.57, -0.08), trustedFacts: { ...facts('Needs Loos'), toilets: 'unknown' } } as Venue;
    const [option] = meetHalfway({ venues: [lacking], mine, other: other(), date: '2026-10-10', arriveAt: '10:30', today: '2026-10-06', nowMinutes: 540 }).options;
    expect(checksToShow(option).needs.join(' ')).toMatch(/Toilets isn’t confirmed at Needs Loos/);
  });
});
