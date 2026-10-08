import { describe, expect, it } from 'vitest';

import { REVIEWED_ACTIVITY_EVIDENCE } from '@/src/data/reviewed-activity-evidence';
import { activityEvidenceFor } from '@/src/services/matching/activity-evidence';
import { EASY_VISIT_LABEL, evaluateFamilyMatch, matchBadgeText, matchClassification } from '@/src/services/matching/family-match';
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

const BURGESS = 'fp-google-ChIJYfO01G0DdkgR4H52YH-11gw';
// Rejected in the final review: a marketing heading, whole-venue copy, an audience with no age.
const RAF = 'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc';
const HOBBLEDOWN = 'fp-google-ChIJqfua7FhzdkgRqSRaMoloxR0';
const SWANLEY = 'fp-google-ChIJ9bI_ApKt2EcRDyvcMDwpxvE';
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
    const r = run(BURGESS, [kit(), maya()]);
    expect(r.verdict).toBe('excellent');
    expect(r.forNames.sort()).toEqual(['Kit', 'Maya']);
    expect(r.reasons[0].text).toBe('Play and climbing equipment for children up to 14, for Kit and Maya’s ages');
    expect(r.reasons[0].aspect).toBe('activity');
    expect(r.children.every((c) => c.basis === 'activity')).toBe(true);
  });

  it('covers a 13-year-old when the page states an age that includes them ("up to 14 years old")', () => {
    expect(run(BURGESS, [tom()]).verdict).toBe('excellent');
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

  it('under a year the badge says Easy visit: it never says Excellent, which would claim an activity was judged', () => {
    const r = run('fp-no-evidence', [ozzie()]);
    expect(r.easyVisit).toBe(true);
    expect(matchBadgeText(r)).toBe(EASY_VISIT_LABEL);
    expect(matchBadgeText(r)).not.toMatch(/excellent|good/i);
    expect(matchClassification(r)).toBe('Easy visit');
    expect(r.headline).toBe('Easy to visit with Ozzie');
    expect(r.forNames).toEqual([]);
    expect(r.children.every((c) => c.basis !== 'activity')).toBe(true);
  });

  it('easy visit applies to a household of babies only: a toddler in the household brings the activity question back', () => {
    const withToddler = run('fp-no-evidence', [child('s', 'Sloane', 3), ozzie()]);
    expect(withToddler.easyVisit).toBe(false);
    expect(matchBadgeText(withToddler)).not.toBe(EASY_VISIT_LABEL);
    expect(matchClassification(withToddler)).not.toBe(EASY_VISIT_LABEL);
    // Twin babies are still babies only.
    const twins = run('fp-no-evidence', [ozzie(), child('p', 'Pip', 0, { mobility: ['buggy'] })]);
    expect(twins.easyVisit).toBe(true);
    expect(matchBadgeText(twins)).toBe(EASY_VISIT_LABEL);
  });

  it('a baby at exactly twelve months is a child of a year, not a baby: no Easy visit label', () => {
    const oneYear = child('y', 'Yan', 1, { ageMonths: 12 });
    const r = run('fp-no-evidence', [oneYear]);
    expect(r.easyVisit).toBe(false);
    expect(matchBadgeText(r)).not.toBe(EASY_VISIT_LABEL);
  });

  it('a place that is not easy to visit with a baby is not labelled Easy visit', () => {
    const r = run('fp-no-evidence', [ozzie()], NOW, { pushchairSuitability: 'difficult' });
    expect(matchBadgeText(r)).not.toBe(EASY_VISIT_LABEL);
    expect(matchClassification(r)).not.toBe(EASY_VISIT_LABEL);
  });

  it('Easy visit does not move Family Fit: the verdict and the score are the ones the ranking already used', () => {
    const r = run('fp-no-evidence', [ozzie()]);
    expect(['good', 'excellent']).toContain(r.verdict);
  });

  it('a toddler with a baby needs the toddler covered; the baby needs nothing', () => {
    expect(run('fp-no-evidence', [child('s', 'Sloane', 3), ozzie()]).verdict).toBe('good');
    const r = run(BURGESS, [child('s', 'Sloane', 3), ozzie()]);
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
    // Burgess Park was read on 1 October 2026.
    expect(activityEvidenceFor(BURGESS, new Date('2026-12-30T12:00:00Z'))).toHaveLength(1);
    expect(activityEvidenceFor(BURGESS, new Date('2026-12-31T12:00:00Z'))).toHaveLength(0);
    expect(run(BURGESS, [maya()], new Date('2027-01-15T12:00:00Z')).verdict).toBe('good');
  });
});

describe('ranking is unchanged', () => {
  it('the score does not read activity evidence', () => {
    const p = profile([kit(), maya()]);
    const detail = (id: string) => ({ ...venue(id), photos: [], openingHours: [], description: '' }) as unknown as VenueDetail;
    const withEvidence = calculateFamilyScore(detail(BURGESS), p);
    const without = calculateFamilyScore(detail('fp-no-evidence'), p);
    expect(withEvidence.score).toBe(without.score);
    expect(withEvidence.factors).toEqual(without.factors);
  });
});

describe('headings, whole-venue copy and ageless audiences are not activity evidence', () => {
  it('a marketing heading over an ageless permanent offer covers no child (RAF Museum London)', () => {
    expect(activityEvidenceFor(RAF, NOW)).toEqual([]);
    const r = run(RAF, [kit(), maya()]);
    expect(r.forNames).toEqual([]);
    expect(r.verdict).toBe('good');
  });

  it('copy about the whole venue covers no child (Hobbledown Heath)', () => {
    expect(activityEvidenceFor(HOBBLEDOWN, NOW)).toEqual([]);
    expect(run(HOBBLEDOWN, [kit()]).verdict).toBe('good');
  });

  it('"older children" with no age covers no child (Swanley Park)', () => {
    expect(activityEvidenceFor(SWANLEY, NOW)).toEqual([]);
    expect(run(SWANLEY, [maya()]).verdict).toBe('good');
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
