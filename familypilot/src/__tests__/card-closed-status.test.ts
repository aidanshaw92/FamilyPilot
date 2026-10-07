import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch, matchCardReason, matchClosedLine, withClosedLine } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * A card says when a place is shut today, as a fact about the place, without that fact touching Family Fit. A place that
 * looks perfectly visitable must not hide that it is closed; and whether it is closed must never move the verdict, the
 * score or the ranking (suitability is not availability).
 */
const NOW = new Date(2026, 9, 6, 11, 0, 0); // a Tuesday, 11:00
const child = (id: string, name: string, age: number): FamilyMember => ({ id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: null, mobility: ['walks'] });
const profile = { id: 'f', parentName: 'Alex', members: [{ id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 }, child('c1', 'Sloane', 3)], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [] } as FamilyProfile;
const hours = (days: number[], close = 17, open = 10): OpeningHoursSchedule => ({ timezone: 'Europe/London', periods: days.map((d) => ({ open: { day: d, hour: open, minute: 0 }, close: { day: d, hour: close, minute: 0 } })) });
const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'x', name: 'Test', category: 'farm', driveMinutes: 20, enrichmentStatus: 'enriched', minRecommendedAge: 1, maxRecommendedAge: 8, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'unknown', environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});
const venue = (schedule: OpeningHoursSchedule, f: Partial<MatchableVenueFacts> = {}): Venue =>
  ({ id: 'x', name: 'Test', category: 'farm', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '', familyScore: { score: 82, factors: {} as never, explanation: [] },
    enrichmentStatus: 'enriched', structuredOpeningHours: schedule, trustedFacts: facts(f), facilities: [] }) as Venue;
const run = (v: Venue) => evaluateFamilyMatch({ venue: v, profile, score: 82, now: NOW });

const OPEN_TODAY = hours([0, 1, 2, 3, 4, 5, 6]);
const SHUT_TODAY = hours([0, 1, 3, 4, 5, 6]); // not Tuesday
const FINISHED = hours([2], 10, 8); // open 8 to 10 on the Tuesday; it is 11:00

describe('the shut-today line on a card', () => {
  it('states the fact, with when it next opens, for a place that looks perfectly visitable', () => {
    const r = run(venue(SHUT_TODAY));
    const line = matchClosedLine(r)!;
    expect(line).toMatch(/^Closed today · opens /);
    expect(withClosedLine(r, '')).toBe(line);
  });

  it('puts the fact first, so a narrow card cuts the reason, not the closure', () => {
    const r = run(venue(SHUT_TODAY));
    const withReason = withClosedLine(r, 'Toilets confirmed on site');
    expect(withReason.startsWith('Closed today')).toBe(true);
    expect(withReason).toContain('Toilets confirmed on site');
  });

  it('is said once when the card reason already carries it', () => {
    const r = run(venue(SHUT_TODAY));
    const reason = matchCardReason(r);
    const once = withClosedLine(r, reason);
    expect(once.match(/Closed today/g)?.length).toBe(1);
  });

  it('adds nothing to a place that is open today', () => {
    const r = run(venue(OPEN_TODAY));
    expect(matchClosedLine(r)).toBeNull();
    expect(withClosedLine(r, 'Toilets confirmed on site')).toBe('Toilets confirmed on site');
  });

  it('adds nothing when the opening hours are not known: unknown is not closed', () => {
    const r = run({ ...venue(OPEN_TODAY), structuredOpeningHours: undefined } as Venue);
    expect(matchClosedLine(r)).toBeNull();
  });

  it('says it for a place that has already finished for the day', () => {
    const r = run(venue(FINISHED));
    expect(matchClosedLine(r)).toMatch(/^Closed (for )?today/);
  });
});

describe('it never feeds Family Fit', () => {
  it('the verdict, reasons, to-check and children are the same shut or open', () => {
    const open = run(venue(OPEN_TODAY));
    const shut = run(venue(SHUT_TODAY));
    expect(shut.verdict).toBe(open.verdict);
    expect(shut.children).toEqual(open.children);
    expect(shut.forNames).toEqual(open.forNames);
    expect(shut.toCheck.map((l) => l.key)).toEqual(open.toCheck.map((l) => l.key));
    expect(shut.reasons.map((l) => l.key).filter((k) => k !== 'open-today')).toEqual(open.reasons.map((l) => l.key).filter((k) => k !== 'open-today'));
    expect(shut.evidence.venueFacts).toBe(open.evidence.venueFacts);
    expect(shut.availableToday).toBe(false);
    expect(open.availableToday).toBe(true);
  });

  it('the headline keeps its judgement and only says "not today" as a fact', () => {
    const shut = run(venue(SHUT_TODAY));
    expect(shut.verdict === 'good' || shut.verdict === 'excellent').toBe(true);
    expect(shut.headline).toMatch(/, but not today$/);
  });
});

describe('the cards use it', () => {
  it('both card variants route their reason through withClosedLine', async () => {
    const fs = await import('node:fs');
    const showcase = fs.readFileSync('src/components/shared/PlaceShowcaseCard.tsx', 'utf8');
    const decision = fs.readFileSync('src/components/shared/DecisionCard.tsx', 'utf8');
    expect(showcase).toMatch(/withClosedLine\(venue\.familyMatch/);
    expect(decision).toMatch(/withClosedLine\(match, matchCardReason\(match\)\)/);
    // On the Home card the fact is shown even where the card has no room for the reason.
    expect(showcase).toMatch(/cardHeight >= 380 \? matchCardReason\(venue\.familyMatch\) : ''/);
  });
});
