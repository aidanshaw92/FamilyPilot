import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { parentObservationsFromTrust, observationLine } from '@/src/services/matching/parent-observations';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';
import type { VenueTrust } from '@/src/services/planning/feedback';
import { pickVisitQuestions } from '@/src/services/planning/visit-questions';

const require_ = createRequire(import.meta.url);
const rules = require_('../../../server/feedback/_lib/rules.js');

const NOW = Date.parse('2026-10-05T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
const rep = (user: string, ago: number, field: string, value: string) => ({
  user_id: user, visit_date: day(ago), status: 'active', created_at: `${day(ago)}T10:00:00Z`, answers: { [field]: value },
});
const claim = (fieldKey: string, valueJson: unknown, checkedAgo = 10) => ({ fieldKey, valueJson, sourceUrl: 'https://venue.example/info', checkedAt: `${day(checkedAgo)}T00:00:00Z` });
const confidence = (claims: unknown[], reports: unknown[], field = 'babyChanging', households?: Map<string, string>) =>
  rules.summarizeReports(claims, reports, NOW, households)[field].confidence;

describe('the parent-observation confidence contract', () => {
  it('nothing reported: not confirmed, no influence', () => {
    expect(confidence([], [])).toMatchObject({ basis: 'none', authoritative: false, influencesFit: false });
  });

  it('ONE parent report is a lead: never authoritative, never influences Family Fit', () => {
    const c = confidence([], [rep('a', 3, 'babyChanging', 'yes')]);
    expect(c).toMatchObject({ basis: 'parent_single', authoritative: false, influencesFit: false });
    expect(c.label).toMatch(/one family, not confirmed by the venue/);
  });

  it('two independent recent agreeing reports are corroborated: they may explain, they are never authoritative', () => {
    const c = confidence([], [rep('a', 3, 'babyChanging', 'yes'), rep('b', 6, 'babyChanging', 'yes')]);
    expect(c).toMatchObject({ basis: 'parent_corroborated', authoritative: false, influencesFit: true, families: 2 });
    expect(c.label).toMatch(/2 families, not confirmed by the venue/);
  });

  it('however many families agree, parent evidence never becomes official', () => {
    const many = Array.from({ length: 25 }, (_, i) => rep(`u${i}`, 2, 'toilets', 'yes'));
    const s = rules.summarizeReports([], many, NOW).toilets;
    expect(s.status).toBe('parent_reported');
    expect(s.confidence.authoritative).toBe(false);
    expect(s.confidence.basis).toBe('parent_corroborated');
    expect(['source_checked', 'editor_checked']).not.toContain(s.status);
  });

  it('partners are one household and count as one witness', () => {
    const hh = new Map([['a', 'a'], ['b', 'a']]);
    expect(confidence([], [rep('a', 3, 'babyChanging', 'yes'), rep('b', 4, 'babyChanging', 'yes')], 'babyChanging', hh).basis).toBe('parent_single');
    expect(confidence([], [rep('a', 3, 'babyChanging', 'yes'), rep('c', 4, 'babyChanging', 'yes')], 'babyChanging', hh).basis).toBe('parent_corroborated');
  });

  it('observations older than 90 days do not count', () => {
    expect(confidence([], [rep('a', 100, 'babyChanging', 'yes'), rep('b', 120, 'babyChanging', 'yes')]).basis).toBe('none');
  });

  it('parents who disagree with each other: needs rechecking', () => {
    const c = confidence([], [rep('a', 3, 'babyChanging', 'yes'), rep('b', 4, 'babyChanging', 'no')]);
    expect(c).toMatchObject({ basis: 'needs_recheck', authoritative: false, influencesFit: true });
  });

  it('a recent report that contradicts the official claim: needs rechecking, the claim is untouched', () => {
    const s = rules.summarizeReports([claim('familyFacilities.babyChanging', 'yes')], [rep('a', 2, 'babyChanging', 'no')], NOW).babyChanging;
    expect(s.confidence.basis).toBe('needs_recheck');
    expect(s.value).toBe('unknown');
  });

  it('an agreeing report beside an official claim leaves the official basis in charge', () => {
    const s = rules.summarizeReports([claim('familyFacilities.babyChanging', 'yes')], [rep('a', 2, 'babyChanging', 'yes'), rep('b', 3, 'babyChanging', 'yes')], NOW).babyChanging;
    expect(s.confidence).toMatchObject({ basis: 'official', authoritative: true });
  });

  it('a later source check resolves the contradiction (an older one cannot)', () => {
    const resolved = rules.summarizeReports([claim('familyFacilities.babyChanging', 'yes', 1)], [rep('a', 2, 'babyChanging', 'no')], NOW).babyChanging;
    expect(resolved.confidence.basis).toBe('official');
    const stillOpen = rules.summarizeReports([claim('familyFacilities.babyChanging', 'yes', 20)], [rep('a', 2, 'babyChanging', 'no')], NOW).babyChanging;
    expect(stillOpen.confidence.basis).toBe('needs_recheck');
  });

  it('parents cannot report on age: there is no age field, so no recommended range or policy can come from them', () => {
    expect(Object.keys(rules.FIELDS).sort()).toEqual(['babyChanging', 'cafe', 'parking', 'pushchair', 'toilets']);
    for (const key of Object.keys(rules.FIELDS)) expect(rules.FIELDS[key].claim).not.toMatch(/age/i);
    for (const bad of ['age', 'minAge', 'recommendedAge', 'ageRange']) {
      expect(() => rules.validateReport({ venueId: 'fp-x', visitDate: day(1), attended: true, answers: { [bad]: 'yes' } }, NOW)).toThrow();
    }
  });
});

const NOW_D = new Date(Date.UTC(2026, 9, 6, 9, 30));
const OPEN: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 8, minute: 0 }, close: { day: d, hour: 18, minute: 0 } })) };
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const child = (id: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({ id, name: id, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: null, mobility: ['walks'], ...extra });
const family = (members: FamilyMember[]) => ({ id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [] }) as FamilyProfile;
const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Park', category: 'park', driveMinutes: 12, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'good',
  environment: 'outdoor', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});
const venue = (over: Partial<MatchableVenueFacts> = {}): Venue =>
  ({ id: 'fp-x', name: 'Test Park', category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 12, imageUrl: '', familyScore: { score: 80, factors: {} as never, explanation: [] },
    enrichmentStatus: 'enriched', structuredOpeningHours: OPEN, trustedFacts: facts(over), facilities: ['toilets'] }) as Venue;

const toddler = family([child('Theo', 2, { mobility: ['buggy'] })]);
const trustWith = (fields: Record<string, unknown>): Pick<VenueTrust, 'fields'> => ({ fields } as never);
const field = (over: Record<string, unknown>) => ({ label: 'x', question: 'q', status: 'unknown', value: 'unknown', sourceUrl: null, checkedAt: null, reportCount: 0, lastReportedAt: null, observations: [], ...over });
const corroboratedYes = (n = 2) => trustWith({ babyChanging: field({ status: 'parent_reported', reportCount: n, observations: ['yes'], agreement: 'corroborated', confidence: rules.confidenceOf({ status: 'parent_reported', agreement: 'corroborated', reportCount: n }) }) });
const text = (lines: Array<{ text: string }>) => lines.map((l) => l.text).join(' | ');

describe('Family Fit with parent observations', () => {
  const fit = (trust: Pick<VenueTrust, 'fields'> | null, v: Venue = venue(), profile: FamilyProfile = toddler) =>
    evaluateFamilyMatch({ venue: v, profile, score: 80, now: NOW_D, parentObservations: parentObservationsFromTrust(trust) });

  it('with no observations the baby-changing unknown is the plain "still to be checked"', () => {
    expect(text(fit(null).toCheck)).toMatch(/Baby changing still to be checked for Theo/);
  });

  it('one report never reaches Family Fit', () => {
    const single = trustWith({ babyChanging: field({ status: 'parent_reported', reportCount: 1, observations: ['yes'], agreement: 'single', confidence: rules.confidenceOf({ status: 'parent_reported', agreement: 'single', reportCount: 1 }) }) });
    expect(parentObservationsFromTrust(single)).toEqual({});
    expect(text(fit(single).toCheck)).toMatch(/still to be checked/);
  });

  it('corroborated reports are explained as parent-reported, stay an unknown, and never become a reason or raise the verdict', () => {
    const without = fit(null);
    const withObs = fit(corroboratedYes());
    expect(text(withObs.toCheck)).toMatch(/Baby changing: 2 families report it is available \(parent-reported, not confirmed by the venue\)/);
    expect(withObs.reasons.some((r) => /baby changing/i.test(r.text))).toBe(false);
    expect(withObs.verdict).toBe(without.verdict);
    expect(withObs.evidence.positives).toBe(without.evidence.positives);
    expect(withObs.evidence.parentReported).toBe(1);
  });

  it('a contradicted official fact is withdrawn and says it needs rechecking', () => {
    const v = venue({ babyChanging: 'yes' });
    expect(fit(null, v).reasons.some((r) => /baby changing/i.test(r.text))).toBe(true);
    const contradicted = trustWith({ babyChanging: field({ status: 'needs_recheck', sourceUrl: 'https://v', checkedAt: '2026-09-01', reportCount: 1, observations: ['unavailable'], confidence: rules.confidenceOf({ status: 'needs_recheck', reportCount: 1 }) }) });
    const after = fit(contradicted, v);
    expect(after.reasons.some((r) => /baby changing/i.test(r.text))).toBe(false);
    expect(text(after.toCheck)).toMatch(/Baby changing needs rechecking: recent parent reports differ from the venue’s own information/);
  });

  it('a family that does not need the fact is not told about it', () => {
    const walker = family([child('Ella', 7)]);
    const r = fit(corroboratedYes(3), venue(), walker);
    expect(text([...r.toCheck, ...r.cautions, ...r.reasons])).not.toMatch(/baby changing/i);
  });

  it('observationLine never says "confirmed" for a parent report', () => {
    const line = observationLine('toilets', { basis: 'parent_corroborated', families: 4, observed: ['yes'], hadOfficial: false });
    expect(line.replace(/not confirmed/gi, '')).not.toMatch(/confirmed/i);
    expect(line).toMatch(/parent-reported/);
  });
});

describe('post-visit question selection is unchanged by the confidence contract', () => {
  const buggyToddler = family([child('Theo', 2, { mobility: ['buggy'] })]);
  const walkers = family([child('Ella', 9)]);
  const keys = (p: Array<{ key: string }>) => p.map((q) => q.key);

  it('still asks only what this family can answer: no buggy question without a buggy, no baby question without a baby', () => {
    const f = rules.summarizeReports([], [], NOW);
    expect(keys(pickVisitQuestions(f, walkers))).not.toContain('pushchair');
    expect(keys(pickVisitQuestions(f, walkers))).not.toContain('babyChanging');
    expect(keys(pickVisitQuestions(f, buggyToddler))).toEqual(['babyChanging', 'pushchair', 'toilets']);
  });

  it('still orders disputed, then unknown, then a single report, then a corroborated one, and never asks a fresh official fact', () => {
    const f = rules.summarizeReports(
      [claim('familyFacilities.toilets', 'yes', 5), claim('familyFacilities.cafe', 'yes', 5)],
      [rep('a', 2, 'toilets', 'unavailable'), rep('b', 3, 'parking', 'yes'), rep('c', 3, 'pushchair', 'good'), rep('d', 4, 'pushchair', 'good')],
      NOW,
    );
    expect(f.toilets.priority).toBe(0); // contradicted
    expect(f.babyChanging.priority).toBe(1); // unknown
    expect(f.parking.priority).toBe(3); // one report
    expect(f.pushchair.priority).toBe(4); // corroborated
    expect(f.cafe.priority).toBe(9); // confirmed and fresh: not asked
    expect(rules.selectQuestions(f)).toEqual(['toilets', 'babyChanging', 'parking']); // the single report is asked before the corroborated one
  });
});
