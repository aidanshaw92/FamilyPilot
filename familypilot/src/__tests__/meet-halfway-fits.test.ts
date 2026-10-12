import { describe, expect, it } from 'vitest';

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
  routines: [{ label: 'Nap', start: '12:30', end: '14:00', kind: 'nap' }] as never, ...over,
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
});
