import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch, matchBadgeText, matchCardReason } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * THE SEMANTIC CONTRACT: activity fit and visit logistics are different claims.
 *
 *   Activity fit    evidence the PLACE suits a child. Today only the venue's own recommended ages including them.
 *   Visit logistics evidence taking a child is PRACTICAL: buggy access, baby changing, toilets, parking, a café.
 *
 * Logistics may say "Easy to visit with Ozzie". It may never say "Good for Ozzie". These tests try to break that from every
 * side: every combination of practical facts, every household shape, and age-adjacent data that must not count.
 */
const NOW = new Date(2026, 9, 6, 11, 0, 0);

const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 2 : null, mobility: ['walks'], ...extra,
});
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const profile = (members: FamilyMember[], over: Partial<FamilyProfile> = {}): FamilyProfile =>
  ({ id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [], ...over }) as FamilyProfile;

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};
const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'museum', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});
const venue = (f: Partial<MatchableVenueFacts> = {}, over: Partial<Venue> = {}): Venue =>
  ({ id: 'fp-x', name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
    structuredOpeningHours: OPEN_DAILY, trustedFacts: facts(f), facilities: ['cafe'], ...over }) as Venue;
const run = (v: Venue, p: FamilyProfile, score = 85) => evaluateFamilyMatch({ venue: v, profile: p, score, now: NOW });

const sloane = () => child('c1', 'Sloane', 3);
const ozzie = () => child('c2', 'Ozzie', 0, { mobility: ['buggy'] });
const maya = () => child('c3', 'Maya', 9);

const households: Array<[string, FamilyProfile]> = [
  ['baby only', profile([ozzie()])],
  ['toddler only', profile([child('c1', 'Sloane', 3, { mobility: ['buggy'] })])],
  ['toddler and baby', profile([child('c1', 'Sloane', 3, { mobility: ['buggy'] }), ozzie()])],
  ['school child and baby', profile([maya(), ozzie()])],
  ['three children', profile([sloane(), ozzie(), maya()])],
  ['buggy and carrier', profile([child('c1', 'Sloane', 3, { mobility: ['buggy'] }), child('c2', 'Ozzie', 0, { mobility: ['buggy', 'carrier'] })])],
];

// Every practical fact a venue can confirm, in every confirmed combination. None of them is an age.
const tri = ['yes', 'unknown'] as const;
const logisticsGrid: Array<Partial<MatchableVenueFacts>> = [];
for (const babyChanging of tri) for (const toilets of tri) for (const parking of ['yes', 'no', 'unknown'] as const)
  for (const pushchairSuitability of ['excellent', 'good', 'mixed', 'unknown'] as const)
    for (const freeParking of ['yes', undefined] as const)
      logisticsGrid.push({ babyChanging, toilets, parking, pushchairSuitability, ...(freeParking ? { freeParking } : {}) } as Partial<MatchableVenueFacts>);

describe('logistics can never become activity fit', () => {
  it('no combination of practical facts, in any household, makes a child "suited", names them in forNames or says "Good for <child>"', () => {
    let checked = 0;
    for (const [shape, p] of households) {
      const kidNames = p.members.filter((m) => m.role === 'child').map((m) => m.name);
      for (const f of logisticsGrid) {
        const r = run(venue(f), p);
        const label = `${shape} / ${JSON.stringify(f)}`;
        expect(r.forNames, label).toEqual([]);
        expect(r.children.filter((c) => c.basis === 'activity'), label).toEqual([]);
        expect(r.reasons.filter((l) => l.aspect === 'activity'), label).toEqual([]);
        for (const name of kidNames) {
          expect(r.headline, label).not.toMatch(new RegExp(`(Good|Excellent|Could work|Possible) for [^,]*\\b${name}\\b`));
          expect(r.headline, label).not.toMatch(new RegExp(`Suits [^,]*\\b${name}\\b`));
          expect(matchBadgeText(r), label).not.toMatch(new RegExp(`for [^·]*${name}`));
        }
        // A child with only practical facts is said to be "easy to visit with", and the headline never claims suitability.
        if (r.verdict === 'good' || r.verdict === 'excellent') expect(r.headline, label).not.toMatch(/^(Good|Excellent) for/);
        checked += 1;
      }
    }
    expect(checked).toBe(households.length * logisticsGrid.length);
  });

  it('a verdict word is never used as a claim about a child without a recommended age range behind it', () => {
    const r = run(venue({ babyChanging: 'yes', toilets: 'yes', parking: 'yes', pushchairSuitability: 'excellent' }), households[2][1], 95);
    expect(r.verdict).toBe('excellent');
    expect(r.headline).toMatch(/^Easy to visit with Sloane and Ozzie/);
    expect(r.headline).not.toMatch(/Excellent for/);
  });

  it('a baby with baby changing and a buggy is "easy to visit with", and the other child is said to be uncertain', () => {
    const r = run(venue({ babyChanging: 'yes', pushchairSuitability: 'good', toilets: 'yes' }), households[3][1]);
    expect(r.children.map((c) => [c.name, c.basis])).toEqual([['Maya', null], ['Ozzie', 'logistics']]);
    expect(r.headline).toBe('Easy to visit with Ozzie, but we’re less certain about Maya: no age range is recorded for this place yet');
  });

  it('only a recommended age range that includes the child makes the place "good for" them', () => {
    const p = households[4][1]; // Sloane 3, Ozzie 2 months, Maya 9
    const r = run(venue({ minRecommendedAge: 2, maxRecommendedAge: 5, babyChanging: 'yes', pushchairSuitability: 'good', toilets: 'yes' }), p);
    expect(r.forNames).toEqual(['Sloane']);
    expect(r.children.map((c) => [c.name, c.basis])).toEqual([['Sloane', 'activity'], ['Ozzie', null], ['Maya', null]]);
    // Ozzie and Maya are outside the range, said as cautions about the range, never as a fit.
    expect(r.cautions.map((l) => l.text).join(' ')).toMatch(/Ozzie/);
    expect(r.headline).not.toMatch(/Good for [^,]*(Ozzie|Maya)/);
  });

  it('a recommended range that includes every child makes the place good for each of them, by name', () => {
    const r = run(venue({ minRecommendedAge: 0, maxRecommendedAge: 6, babyChanging: 'yes', pushchairSuitability: 'good', toilets: 'yes' }), households[2][1]);
    expect(r.children.map((c) => [c.name, c.basis])).toEqual([['Sloane', 'activity'], ['Ozzie', 'activity']]);
    expect(r.headline).toBe('Excellent for Sloane and Ozzie');
    expect(r.forNames).toEqual(['Sloane', 'Ozzie']);
  });

  it('a range that includes the toddler but not the baby is a caution for the baby, not a claim about either kind of fit', () => {
    const r = run(venue({ minRecommendedAge: 2, maxRecommendedAge: 6, babyChanging: 'yes', pushchairSuitability: 'good', toilets: 'yes' }), households[2][1]);
    expect(r.children.map((c) => [c.name, c.state, c.basis])).toEqual([['Sloane', 'works', 'activity'], ['Ozzie', 'check', null]]);
    expect(r.forNames).toEqual(['Sloane']);
    expect(r.headline).toBe('Could work for Sloane, but check age range for Ozzie');
    expect(r.headline).not.toMatch(/Good for [^,]*Ozzie/);
  });

  it('being outside the recommended range is a caution about the activity, and never a fit', () => {
    const r = run(venue({ minRecommendedAge: 6, maxRecommendedAge: null, babyChanging: 'yes', pushchairSuitability: 'good' }), households[2][1]);
    expect(r.forNames).toEqual([]);
    expect(r.cautions.some((l) => l.aspect === 'activity')).toBe(true);
    expect(r.headline).not.toMatch(/Good for/);
  });
});

describe('Sloane stays uncertain without age evidence', () => {
  it('a toddler with only practical facts is not claimed as suited, and the uncertainty is on the venue page', () => {
    const r = run(venue({ pushchairSuitability: 'good', toilets: 'yes' }), households[1][1]);
    expect(r.headline).toBe('Easy to visit with Sloane');
    expect(r.toCheck.map((l) => l.text)).toContain('We’re less certain how well it suits Sloane: no age range is recorded for this place yet');
  });

  it('the uncertainty is not invented from the child’s age or the kind of place', () => {
    for (const category of ['park', 'museum', 'soft_play', 'farm', 'zoo'] as const) {
      const r = run(venue({ category, pushchairSuitability: 'good', toilets: 'yes' }, { category } as Partial<Venue>), households[1][1]);
      expect(r.forNames, category).toEqual([]);
      expect(r.children[0].basis, category).toBe('logistics');
    }
  });

  it('a baby under a year old is led by logistics: no activity gap is raised for them', () => {
    const r = run(venue({ babyChanging: 'yes', pushchairSuitability: 'good', toilets: 'yes' }), households[0][1]);
    expect(r.headline).toBe('Easy to visit with Ozzie');
    expect(r.toCheck.map((l) => l.text).join(' ')).not.toMatch(/less certain how well it suits Ozzie/);
  });

  it('a child a year old or more is not treated as logistics-led', () => {
    const r = run(venue({ babyChanging: 'yes', pushchairSuitability: 'good' }), profile([child('c9', 'Isla', 1, { mobility: ['buggy'] })]));
    expect(r.toCheck.map((l) => l.text).join(' ')).toMatch(/less certain how well it suits Isla/);
  });

  it('never raises the uncertainty for a place nobody has reviewed', () => {
    const r = run(venue({}, { enrichmentStatus: 'provider_only', trustedFacts: undefined } as Partial<Venue>), households[1][1]);
    expect(r.verdict).toBe('not_reviewed');
    expect(r.toCheck.map((l) => l.text).join(' ')).not.toMatch(/less certain how well it suits/);
  });
});

describe('what the change does NOT touch', () => {
  it('leaves the verdict exactly as it was: only the words changed', () => {
    const f = { babyChanging: 'yes', toilets: 'yes', parking: 'yes', pushchairSuitability: 'good' } as const;
    expect(run(venue(f), households[1][1], 85).verdict).toBe('excellent');
    expect(run(venue(f), households[1][1], 75).verdict).toBe('good');
    expect(run(venue(f), households[1][1], 40).verdict).toBe('poor');
    expect(run(venue({ ...f, pushchairSuitability: 'difficult' }), households[1][1], 90).verdict).toBe('poor');
  });

  it('never puts the uncertainty line on a card', () => {
    const r = run(venue({ toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes', parking: 'yes' }), households[1][1], 65);
    expect(r.verdict).toBe('possible');
    expect(matchCardReason(r)).not.toMatch(/less certain how well it suits/);
  });

  it('a badge for logistics alone carries no child’s name', () => {
    const r = run(venue({ toilets: 'yes', pushchairSuitability: 'good', babyChanging: 'yes', parking: 'yes' }), households[1][1], 85);
    expect(['good', 'excellent']).toContain(r.verdict);
    expect(matchBadgeText(r)).toMatch(/^(Good|Excellent) fit$/);
  });
});
