import { describe, expect, it } from 'vitest';

import { REVIEWED_ACTIVITY_EVIDENCE } from '@/src/data/reviewed-activity-evidence';
import { activityEvidenceFor } from '@/src/services/matching/activity-evidence';
import { evaluateFamilyMatch, matchBadgeText } from '@/src/services/matching/family-match';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { FamilyMember, FamilyProfile, Venue, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * Excellent, second rule (docs/EXCELLENT_RULE_V2.md): what a venue's own pages say children of an age can do there.
 *
 *   permanent provision for an age  names the child and can support Excellent
 *   programme on set days           names the child, never supports Excellent
 *   logistics                       never cover a child
 *   every child of a year or more   must be covered (venue-wide range or provision) for Excellent
 *   ranking                         unchanged: nothing here reaches the score
 */
const NOW = new Date(2026, 9, 8, 11, 0, 0);

const RAF = 'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc';
const BECKENHAM = 'fp-google-ChIJRfXNwPoBdkgRqdTuM7Baxuw';
const CHISWICK = 'fp-osm-679119297';
const DISCOVER = 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk';

const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 2 : null, mobility: ['walks'], ...extra,
});
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const profile = (members: FamilyMember[]): FamilyProfile =>
  ({ id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', completionPercent: 100, mustHaveFacilities: [], routines: [] }) as unknown as FamilyProfile;

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};
/** Everything practical confirmed: on logistics alone this place would have been Excellent before. */
const RICH: Partial<MatchableVenueFacts> = { toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'good', cafe: 'yes' };
const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'museum', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'open', ...RICH, ...over,
});
const venue = (id: string, f: Partial<MatchableVenueFacts> = {}): Venue =>
  ({ id, name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 90, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
    structuredOpeningHours: OPEN_DAILY, trustedFacts: facts(f), facilities: ['cafe'] }) as Venue;
const run = (id: string, members: FamilyMember[], now = NOW, f: Partial<MatchableVenueFacts> = {}) =>
  evaluateFamilyMatch({ venue: venue(id, f), profile: profile(members), score: 92, now });

const kit = () => child('k', 'Kit', 4);
const maya = () => child('m', 'Maya', 7);
const tom = () => child('t', 'Tom', 13);
const ozzie = () => child('o', 'Ozzie', 0, { mobility: ['buggy'] });

describe('permanent provision for an age', () => {
  it('names every child it covers and can make the place Excellent for them', () => {
    const r = run(RAF, [kit(), maya()]);
    expect(r.verdict).toBe('excellent');
    expect(r.forNames.sort()).toEqual(['Kit', 'Maya']);
    expect(r.reasons[0].text).toBe('Hands-on activities and exhibits for toddlers to teens, for Kit and Maya’s ages');
    expect(r.reasons[0].aspect).toBe('activity');
    expect(r.children.every((c) => c.basis === 'activity')).toBe(true);
  });

  it('covers a teenager when the page says teens', () => {
    expect(run(RAF, [tom()]).verdict).toBe('excellent');
  });

  it('a provision for younger children says nothing against an older one, and is never their activity line', () => {
    const r = run(CHISWICK, [maya()]);
    expect(r.reasons.some((l) => /under-7s/i.test(l.text))).toBe(false);
    expect([...r.cautions, ...r.toCheck].some((l) => /under-7s|playground/i.test(l.text))).toBe(false);
    expect(r.verdict).toBe('good');
  });

  it('covering one child of two keeps the other as the gap, and the place at Good', () => {
    const r = run(CHISWICK, [kit(), maya()]);
    expect(r.reasons.find((l) => l.key.startsWith('activity'))?.text).toBe('Under-7s playground, for Kit’s age');
    expect(r.forNames).toEqual(['Kit']);
    expect(r.verdict).toBe('good');
    expect(r.gapNames).toEqual(['Maya']);
  });

  it('a baby-and-toddler space covers no 7-year-old', () => {
    const r = run(DISCOVER, [maya()]);
    expect(r.forNames).toEqual([]);
    expect(r.verdict).toBe('good');
  });
});

describe('a programme on set days', () => {
  it('names the child, says it is on set days, and never makes the place Excellent', () => {
    const r = run(BECKENHAM, [maya()]);
    expect(r.reasons[0].text).toBe('Junior parkrun for ages 4 to 14 (on set days), for Maya’s age');
    expect(r.forNames).toEqual(['Maya']);
    expect(r.verdict).toBe('good');
  });
});

describe('logistics never cover a child', () => {
  it('a place with every practical fact confirmed and no activity evidence stops at Good for a child of a year or more', () => {
    const r = run('fp-no-evidence', [kit()]);
    expect(r.verdict).toBe('good');
    expect(r.forNames).toEqual([]);
  });

  it('under a year the visit is the activity: Excellent stands, and the badge says it is an easy visit', () => {
    const r = run('fp-no-evidence', [ozzie()]);
    expect(r.verdict).toBe('excellent');
    expect(r.easyVisit).toBe(true);
    expect(matchBadgeText(r)).toBe('Excellent · easy visit');
  });

  it('a toddler with a baby needs the toddler covered; the baby needs nothing', () => {
    expect(run('fp-no-evidence', [child('s', 'Sloane', 3), ozzie()]).verdict).toBe('good');
    const r = run(RAF, [child('s', 'Sloane', 3), ozzie()]);
    expect(r.verdict).toBe('excellent');
    expect(r.easyVisit).toBe(false);
    expect(matchBadgeText(r)).toBe('Excellent for Sloane');
  });

  it('a whole-venue recommended range still covers a child, as before', () => {
    expect(run('fp-no-evidence', [kit()], NOW, { minRecommendedAge: 2, maxRecommendedAge: 8 }).verdict).toBe('excellent');
  });
});

describe('freshness: reviewed evidence is never extended', () => {
  it('counts for 90 days from its reading, then stops until a person reads the page again', () => {
    expect(activityEvidenceFor(RAF, new Date('2026-12-31T12:00:00Z'))).toHaveLength(1);
    expect(activityEvidenceFor(RAF, new Date('2027-01-01T12:00:00Z'))).toHaveLength(0);
    expect(run(RAF, [maya()], new Date('2027-01-15T12:00:00Z')).verdict).toBe('good');
  });
});

describe('ranking is unchanged', () => {
  it('the score does not read activity evidence', () => {
    const p = profile([kit(), maya()]);
    const detail = (id: string) => ({ ...venue(id), photos: [], openingHours: [], description: '' }) as unknown as VenueDetail;
    const withEvidence = calculateFamilyScore(detail(RAF), p);
    const without = calculateFamilyScore(detail('fp-no-evidence'), p);
    expect(withEvidence.score).toBe(without.score);
    expect(withEvidence.factors).toEqual(without.factors);
  });
});

describe('the reviewed file', () => {
  it('holds only own-page evidence with a quotation, a reading date and a sane age band', () => {
    for (const e of REVIEWED_ACTIVITY_EVIDENCE) {
      expect(['venue_own_subtree', 'venue_named_page']).toContain(e.evidence.subjectScope);
      expect(e.evidence.excerpt.trim().length).toBeGreaterThan(10);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(e.evidence.retrievedAt)).toBe(true);
      expect(e.minMonths).toBeGreaterThanOrEqual(0);
      expect(e.maxMonthsExclusive).toBeGreaterThan(e.minMonths);
      expect(e.maxMonthsExclusive).toBeLessThanOrEqual(216);
      // Logistics are never activity evidence.
      expect(e.label).not.toMatch(/toilet|parking|car park|café|cafe|baby changing|step-free|wheelchair/i);
    }
  });
});
