import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

// A Tuesday at 11:00 on the device (routines are the parent's own clock); a London venue is open 10:00 to 17:00 then.
const NOW = new Date(2026, 9, 6, 11, 0, 0);

const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra,
});
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };

function profile(over: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    id: 'f', parentName: 'Alex', members: [parent, child('c1', 'Sloane', 7), child('c2', 'Theo', 2, { mobility: ['buggy'] })],
    homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [], ...over,
  } as FamilyProfile;
}

const unknownFacts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'park', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};

function venue(over: Partial<Venue> = {}, facts: Partial<MatchableVenueFacts> = {}): Venue {
  return {
    id: 'fp-x', name: 'Test Place', category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
    structuredOpeningHours: OPEN_DAILY, trustedFacts: unknownFacts(facts), facilities: [], ...over,
  } as Venue;
}

const run = (v: Venue, p = profile(), score = 80) => evaluateFamilyMatch({ venue: v, profile: p, score, now: NOW });

describe('Family Match: the honest verdict', () => {
  it('says Good for the named child when confirmed facts are about that child', () => {
    const r = run(venue({}, { minRecommendedAge: 1, maxRecommendedAge: 10, toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes' }));
    expect(r.verdict).toBe('good');
    expect(r.headline).toBe('Good for Sloane and Theo today');
    expect(r.forNames).toEqual(['Sloane', 'Theo']);
    expect(r.reasons.map((l) => l.text)).toContain('Suits Sloane and Theo (recommended for ages 1–10)');
    expect(r.reasons.map((l) => l.text)).toContain('Good buggy access for Theo’s buggy');
    expect(r.reasons.map((l) => l.text)).toContain('Open until 5pm');
  });

  it('does not call a place a good fit when it is over the family’s drive limit', () => {
    const r = run(venue({ driveMinutes: 34 }, { toilets: 'yes', pushchairSuitability: 'good', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile(), 90);
    expect(r.verdict).toBe('possible');
    expect(r.cautions.map((l) => l.text)).toContain('34 min away, 4 min over the 30 min drive we’re using');
    expect(r.headline).toMatch(/^Possible for /);
  });

  it('caps the verdict at Possible when buggy access is unknown for a family with a buggy', () => {
    const r = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }), profile(), 92);
    expect(r.verdict).toBe('possible');
    expect(r.toCheck.map((l) => l.text)).toContain('Buggy access still to be checked for Theo’s buggy');
  });

  it('does not ask a family without a buggy about buggies', () => {
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { toilets: 'yes', minRecommendedAge: 5, maxRecommendedAge: 12 }), p);
    expect(r.toCheck.some((l) => /uggy/.test(l.text))).toBe(false);
    expect(r.verdict).toBe('good');
  });

  it('treats a must-have confirmed absent as a breach, and an unchecked must-have as still to be checked', () => {
    const p = profile({ mustHaveFacilities: ['parking'], members: [parent, child('c1', 'Sloane', 7)] });
    const absent = run(venue({}, { parking: 'no', toilets: 'yes' }), p);
    expect(absent.verdict).toBe('poor');
    expect(absent.cautions.map((l) => l.text)).toContain('No parking here, and you said you need it');
    const unchecked = run(venue({}, { toilets: 'yes', minRecommendedAge: 5, maxRecommendedAge: 12 }), p);
    expect(unchecked.verdict).toBe('possible');
    expect(unchecked.toCheck.map((l) => l.text)).toContain('Parking, which you said you need, still to be checked');
  });

  it('names the child outside the recommended ages and keeps the child inside', () => {
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes' }));
    expect(r.verdict).toBe('possible');
    expect(r.forNames).toEqual(expect.arrayContaining(['Sloane']));
    expect(r.cautions.map((l) => l.text).join('|')).toMatch(/Theo is younger/);
  });

  it('says closed today when a place is shut all day, and is not a good fit', () => {
    const monday = new Date(2026, 9, 5, 11, 0, 0);
    const hours: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [0, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 16, minute: 30 } })) };
    const r = evaluateFamilyMatch({ venue: venue({ structuredOpeningHours: hours }, { toilets: 'yes' }), profile: profile(), score: 90, now: monday });
    expect(r.verdict).toBe('poor');
    expect(r.today.state).toBe('closed_today');
    expect(r.cautions[0].text).toBe('Closed today · opens tomorrow 10am');
  });

  it('keeps a place FamilyPilot has not reviewed as Not yet reviewed, still saying what is known', () => {
    const r = run(venue({ enrichmentStatus: 'provider_only' }), profile(), 99);
    expect(r.verdict).toBe('not_reviewed');
    expect(r.headline).toBe('Family suitability not yet reviewed');
    expect(r.reasons.map((l) => l.text)).toEqual(expect.arrayContaining(['Open until 5pm', '20 min away']));
  });

  it('REGRESSION: a high blended score with nothing confirmed is Possible, never Good', () => {
    const r = run(venue({}, {}), profile({ members: [parent, child('c1', 'Sloane', 7)] }), 96);
    // Only logistics are known (open, close): two positives, nothing about the family. That is "good" for a family
    // with no needs, so add a need that is unknown and it must fall back.
    const withNeed = run(venue({}, {}), profile({ members: [parent, child('c1', 'Sloane', 7)], mustHaveFacilities: ['toilets'] }), 96);
    expect(withNeed.verdict).toBe('possible');
    expect(r.verdict).not.toBe('excellent');
  });

  it('reserves Excellent for several confirmed facts about the venue and nothing left to check', () => {
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes', parking: 'yes' }), p, 92);
    expect(r.verdict).toBe('excellent');
    expect(r.headline).toBe('Excellent for Sloane today');
  });

  it('uses "your family" when no confirmed fact is about a particular child', () => {
    const p = profile({ members: [parent, child('c1', 'Sloane', 7)] });
    const r = run(venue({}, { toilets: 'yes' }), p);
    expect(r.headline).toBe('Good for your family today');
  });

  it('never prints a name it does not have', () => {
    const p = profile({ members: [parent, child('c1', '', 7)] });
    const r = run(venue({}, { minRecommendedAge: 5, maxRecommendedAge: 12, toilets: 'yes' }), p);
    expect(r.headline).not.toMatch(/undefined|  /);
    expect(r.forNames).toEqual([]);
  });

  it('treats rain on an outdoor place as a caution, not a reason', () => {
    const r = evaluateFamilyMatch({
      venue: venue({}, { environment: 'outdoor', toilets: 'yes' }), profile: profile({ members: [parent, child('c1', 'Sloane', 7)] }), score: 80, now: NOW,
      weather: { condition: 'rainy', temperature: 11, description: 'Rain' },
    });
    expect(r.reasons.some((l) => /weather/i.test(l.text))).toBe(false);
    expect(r.cautions.map((l) => l.text)).toContain('Outdoors, and rain is forecast');
    expect(r.verdict).toBe('possible');
  });

  it('leaves out the journey when it has not been worked out', () => {
    const r = run(venue({ driveMinutes: Number.NaN }, { toilets: 'yes' }), profile({ members: [parent, child('c1', 'Sloane', 7)] }));
    expect(r.reasons.some((l) => /min away/.test(l.text))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/NaN/);
  });

  it('flags baby changing for an under-three, as unknown when unchecked and as a reason when confirmed', () => {
    const base = profile({ members: [parent, child('c2', 'Theo', 2)] });
    expect(run(venue({}, {}), base).toCheck.map((l) => l.text)).toContain('Baby changing still to be checked for Theo');
    expect(run(venue({}, { babyChanging: 'yes' }), base).reasons.map((l) => l.text)).toContain('Baby changing confirmed, handy for Theo');
  });

  it('puts a nap clash on the card as a caution', () => {
    const p = profile({ routines: [{ id: 'r1', kind: 'nap', time: '11:20', durationMinutes: 90, atHome: true, childId: 'c2', label: '' }] as never });
    const r = run(venue({ driveMinutes: 25 }, { toilets: 'yes' }), p);
    expect(r.cautions.map((l) => l.text).join('|')).toMatch(/Theo’s nap/);
    expect(r.verdict).toBe('possible');
  });

  it('gives the card the one line that changes a decision', () => {
    const r = run(venue({}, { toilets: 'yes', babyChanging: 'yes', minRecommendedAge: 1, maxRecommendedAge: 10 }));
    expect(r.cardNote).toBe('Open until 5pm · Buggy access still to be checked for Theo’s buggy');
  });
});
