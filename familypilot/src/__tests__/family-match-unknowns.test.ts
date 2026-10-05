import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * Unknown is not yes, and it is not no. It is mentioned only when it could matter to THIS family, never turns into a
 * positive, and never by itself makes a place a poor match. One production-shaped venue (a park whose toilets and café
 * are confirmed and whose buggy access, baby changing and parking are not) is read for six realistic families.
 */
const NOW = new Date(Date.UTC(2026, 9, 6, 9, 30)); // 10:30 in London
const OPEN: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 8, minute: 0 }, close: { day: d, hour: 18, minute: 0 } })) };

const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const child = (id: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({ id, name: id, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: null, mobility: ['walks'], ...extra });
const family = (members: FamilyMember[], extra: Partial<FamilyProfile> = {}) => ({ id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [], ...extra }) as FamilyProfile;

const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Park', category: 'park', driveMinutes: 12, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'outdoor', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});
const venue = (over: Partial<MatchableVenueFacts> = {}): Venue =>
  ({ id: 'fp-x', name: 'Test Park', category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 12, imageUrl: '', familyScore: { score: 80, factors: {} as never, explanation: [] },
    enrichmentStatus: 'enriched', structuredOpeningHours: OPEN, trustedFacts: facts(over), facilities: ['toilets', 'cafe'] }) as Venue;
const read = (p: FamilyProfile, v = venue()) => evaluateFamilyMatch({ venue: v, profile: p, score: 80, now: NOW });
const text = (lines: Array<{ text: string }>) => lines.map((l) => l.text).join(' | ');

describe('Family Fit and unknown facts', () => {
  it('a buggy toddler family is told buggy access still needs checking, and is not told it is a fit', () => {
    const r = read(family([child('Theo', 2, { mobility: ['buggy'] })]));
    expect(text(r.toCheck)).toMatch(/Buggy access still to be checked for Theo’s buggy/);
    expect(text(r.reasons)).not.toMatch(/buggy/i);
    expect(r.verdict).toBe('possible'); // an unknown hard requirement caps the verdict, it does not sink it
    expect(r.verdict).not.toBe('poor');
  });

  it('a family that walks, with older children, hears nothing about buggies or baby changing, and still gets a good verdict', () => {
    const r = read(family([child('Sloane', 7), child('Mia', 9)]));
    const everything = `${text(r.toCheck)} ${text(r.cautions)} ${r.cardNote ?? ''}`;
    expect(everything).not.toMatch(/buggy|baby changing|pushchair/i);
    expect(r.toCheck).toEqual([]);
    expect(['good', 'excellent']).toContain(r.verdict);
  });

  it('a family carrying a baby (no buggy) is asked about baby changing, softly, and about nothing buggy', () => {
    const r = read(family([child('Ada', 1, { mobility: ['carrier'], ageMonths: 13 })]));
    expect(text(r.toCheck)).toMatch(/Baby changing still to be checked for Ada/);
    expect(text(r.toCheck)).not.toMatch(/buggy/i);
    // A soft unknown stops "Excellent" but does not stop "Good".
    expect(r.verdict).toBe('good');
  });

  it('a child who needs step-free or wheelchair access: still to be checked, never assumed', () => {
    const r = read(family([child('Ada', 7, { mobility: ['mobility-aid'] })]));
    expect(text(r.toCheck)).toMatch(/Step-free and wheelchair access still to be checked/);
    expect(r.verdict).toBe('possible');
  });

  it('a stated must-have that is unknown is a hard unknown, in the family’s own words; a confirmed "no" is a breach', () => {
    const wants = family([child('Theo', 2)], { mustHaveFacilities: ['baby_changing'] });
    expect(text(read(wants).toCheck)).toMatch(/Baby changing, which you said you need, still to be checked/);
    expect(read(wants).verdict).toBe('possible');
    const denied = read(wants, venue({ babyChanging: 'no' }));
    expect(text(denied.cautions)).toMatch(/No baby changing here, and you said you need it/);
    expect(denied.verdict).toBe('poor');
  });

  it('unknown never reads as a positive: nothing unknown appears among the reasons for any of these families', () => {
    for (const p of [family([child('Theo', 2, { mobility: ['buggy'] })]), family([child('Sloane', 7)]), family([child('Ada', 1, { mobility: ['carrier'], ageMonths: 13 })]), family([child('Ada', 7, { mobility: ['mobility-aid'] })])]) {
      const reasons = text(read(p).reasons);
      expect(reasons).not.toMatch(/buggy access|baby changing|parking|age|step-free/i);
    }
  });

  it('confirming the fact removes the question and earns the line', () => {
    const buggy = family([child('Theo', 2, { mobility: ['buggy'] })]);
    const after = read(buggy, venue({ pushchairSuitability: 'good', babyChanging: 'yes' }));
    expect(text(after.toCheck)).not.toMatch(/buggy/i);
    expect(text(after.reasons)).toMatch(/Good buggy access for Theo’s buggy/);
    expect(['good', 'excellent']).toContain(after.verdict);
  });

  it('an unreviewed venue does not pretend: no verdict is claimed', () => {
    const r = evaluateFamilyMatch({ venue: { ...venue(), enrichmentStatus: 'provider_only', trustedFacts: undefined } as Venue, profile: family([child('Sloane', 7)]), score: 80, now: NOW });
    expect(r.verdict).toBe('not_reviewed');
  });
});
