import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch, matchBadgeText } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * The Royal Air Force Museum London, as the hosted catalogue holds it: nine approved claims, ALL practical (baby changing,
 * toilets, parking, a café, a playground, wheelchair access, good pushchair access), and no recommended-age claim at all.
 * A parent saw "Good fit" on its cards and detail screen while the same screen's headline said the activity was not
 * confirmed for the older child. These pin that the badge, the headline and the to-check line say the same thing, whichever
 * household is looking. Under docs/FAMILY_FIT_GRADING.md the museum's CONFIRMED playground makes it "likely good" for a child
 * of playground age, said as an inference with the exhibits still to check; a museum with no child-specific fact at all is a
 * Possible fit.
 */
const NOW = new Date(2026, 9, 14, 10, 0, 0);
const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 7 : null, mobility: ['walks'], ...extra,
});
const parent: FamilyMember = { id: 'p', name: 'Aidan', role: 'parent', dateOfBirth: '', age: 38 };

const RAF_FACTS = {
  placeId: 'fp-raf', name: 'Royal Air Force Museum London', category: 'museum', driveMinutes: 22, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'yes', parking: 'yes', freeParking: 'no', pushchairSuitability: 'good', cafe: 'yes', playground: 'yes',
  wheelchairAccessible: 'yes', accessibleToilet: 'yes', environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null,
  estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'open',
} as MatchableVenueFacts;

const venue = (facts: Partial<MatchableVenueFacts> = {}) => ({
  id: 'fp-raf', name: 'RAF', category: 'museum', latitude: 51.598, longitude: -0.238, driveMinutes: 22, imageUrl: '',
  familyScore: { score: 82, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
  structuredOpeningHours: { timezone: 'Europe/London', periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })) },
  trustedFacts: { ...RAF_FACTS, ...facts }, facilities: [],
}) as unknown as Venue;

const household = (kids: FamilyMember[]) => ({ id: 'f', parentName: 'Aidan', members: [parent, ...kids], homeLocation: 'Bushey', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: ['baby_changing'], routines: [] }) as unknown as FamilyProfile;
const read = (kids: FamilyMember[], v = venue()) => evaluateFamilyMatch({ venue: v, profile: household(kids), score: 82, now: NOW });

describe('Family Fit never says a bare "Good fit" where no child is confirmed', () => {
  it('a four-year-old and a baby with a buggy: the playground makes it likely good for the older child, the baby is easy, the exhibits are the check', () => {
    const r = read([child('c1', 'Sloane', 4), child('c2', 'Ozzie', 0, { mobility: ['buggy'] })]);
    expect(r.verdict).toBe('good');
    expect(matchBadgeText(r)).toBe('Likely good for Sloane');
    expect(r.headline).toBe('Likely good for Sloane, and easy to visit with Ozzie');
    expect(r.reasons.find((l) => l.inferred)?.text).toBe('A children’s playground is confirmed here, which usually suits a 4-year-old like Sloane');
    expect(r.toCheck.map((l) => l.text)).toContain('We haven’t yet confirmed whether the exhibits suit Sloane');
    expect(r.verdict).not.toBe('excellent');
  });

  it.each([
    ['a four-year-old and a baby who is carried', [child('c1', 'Sloane', 4), child('c2', 'Ozzie', 0, { mobility: ['carrier'] })]],
    ['a six-year-old and a two-year-old', [child('c1', 'Sloane', 6), child('c2', 'Ozzie', 2)]],
  ])('%s: with no playground on record nobody is confirmed, so the badge, the headline and the check line agree at Possible', (_label, kids) => {
    const r = read(kids, venue({ playground: 'unknown' }));
    expect(r.practicalOnly).toBe(true);
    expect(r.verdict).toBe('possible');
    for (const width of [18, 12, 40]) expect(matchBadgeText(r, width)).toBe('Possible fit');
    expect(r.headline).toBe('Looks practical, but we haven’t yet confirmed whether the exhibits suit Sloane and Ozzie');
    expect(r.toCheck.map((l) => l.text)).toEqual(['We haven’t yet confirmed whether the exhibits suit Sloane and Ozzie']);
  });

  it('one child with only the playground confirmed is likely good, with the exhibits named as the check, never a bare Good fit', () => {
    const r = read([child('c1', 'Sloane', 6)]);
    expect(matchBadgeText(r)).toBe('Likely good for Sloane');
    expect(r.headline).toBe('Likely good for Sloane');
    expect(r.toCheck.map((l) => l.text)).toEqual(['We haven’t yet confirmed whether the exhibits suit Sloane']);
  });

  it('confirmed recommended ages earn the plain wording (Excellent with everything practical confirmed), and a child they exclude is still the gap', () => {
    const suited = read([child('c1', 'Sloane', 6)], venue({ minRecommendedAge: 3, maxRecommendedAge: 12 }));
    expect(suited.practicalOnly).toBe(false);
    expect(suited.verdict).toBe('excellent');
    expect(matchBadgeText(suited)).toBe('Excellent for Sloane');
    // Ages 3 to 12 exclude a seven-month-old: that is a real caution, so the verdict is Possible, not Good.
    const excluded = read([child('c1', 'Sloane', 6), child('c2', 'Ozzie', 0, { mobility: ['buggy'] })], venue({ minRecommendedAge: 3, maxRecommendedAge: 12 }));
    expect(excluded.verdict).toBe('possible');
    expect(matchBadgeText(excluded)).toBe('Possible fit');
    // Ages 0 to 12 cover both, so it is plainly for both.
    const both = read([child('c1', 'Sloane', 6), child('c2', 'Ozzie', 0, { mobility: ['buggy'] })], venue({ minRecommendedAge: 0, maxRecommendedAge: 12 }));
    expect(matchBadgeText(both)).toBe('Excellent for Sloane and Ozzie');
  });

  it('a household of babies is still "Easy visit": the visit is the activity', () => {
    const r = read([child('c1', 'Ozzie', 0, { mobility: ['buggy'] })]);
    expect(matchBadgeText(r)).toBe('Easy visit');
    expect(r.practicalOnly).toBe(false);
  });

  it('a museum’s playground never makes it Excellent: the exhibits are unjudged, so a six- and a two-year-old stop at Good', () => {
    const r = read([child('c1', 'Sloane', 6), child('c2', 'Ozzie', 2)]);
    expect(r.verdict).toBe('good');
    expect(r.likelyNames).toEqual(['Sloane', 'Ozzie']);
  });
});

describe('a single child nobody has confirmed the place for', () => {
  it('the badge, the headline and the check line all say the same thing, and none says "promising" or "good"', () => {
    const r = read([child('c1', 'Sloane', 5)], venue({ playground: 'unknown' }));
    expect(r.practicalOnly).toBe(true);
    expect(r.verdict).toBe('possible');
    expect(matchBadgeText(r)).toBe('Possible fit');
    expect(r.headline).toBe('Looks practical, but we haven’t yet confirmed whether the exhibits suit Sloane');
    expect(r.toCheck.map((c) => c.text).join(' ')).toMatch(/exhibits suit Sloane/);
  });
});
