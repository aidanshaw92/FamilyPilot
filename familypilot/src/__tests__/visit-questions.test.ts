import { describe, expect, it } from 'vitest';

import { pickVisitQuestions, relevanceFor } from '@/src/services/planning/visit-questions';
import { FamilyMember, FamilyProfile } from '@/src/types';

const { summarizeReports } = require('../../../server/feedback/_lib/rules');

const NOW = Date.parse('2026-10-05T12:00:00Z');
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const child = (id: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({ id, name: id, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: null, mobility: ['walks'], ...extra });
const family = (members: FamilyMember[], extra: Partial<FamilyProfile> = {}) => ({ id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities: [], routines: [], ...extra }) as FamilyProfile;

const claim = (key: string, value: string, daysAgo = 3) => ({ fieldKey: key, valueJson: value, checkedAt: new Date(NOW - daysAgo * 86400000).toISOString().slice(0, 10), sourceUrl: 'https://v.example' });
const fields = (claims: unknown[] = [], reports: unknown[] = []) => summarizeReports(claims, reports, NOW);
const keys = (p: Array<{ key: string }>) => p.map((q) => q.key);

describe('post-visit questions: short, adaptive, family-relevant', () => {
  const buggyToddler = family([child('theo', 2, { mobility: ['buggy'] })]);
  const walkingTeens = family([child('jonah', 14)]);
  const mixed = family([child('sloane', 7), child('theo', 2, { mobility: ['buggy'] })], { mustHaveFacilities: ['baby_changing'] });

  it('asks a buggy toddler family about baby changing and the buggy first when both are unknown', () => {
    expect(keys(pickVisitQuestions(fields(), buggyToddler))).toEqual(['babyChanging', 'pushchair', 'toilets']);
  });

  it('does not ask a family with teenagers and no buggy about buggies or baby changing', () => {
    const picked = keys(pickVisitQuestions(fields(), walkingTeens));
    expect(picked).not.toContain('pushchair');
    expect(picked).not.toContain('babyChanging');
    expect(picked).toEqual(['toilets', 'cafe', 'parking']);
  });

  it('skips a field that is confirmed and fresh, and asks what is genuinely open', () => {
    const f = fields([claim('familyFacilities.babyChanging', 'yes'), claim('familyFacilities.toilets', 'yes')]);
    expect(keys(pickVisitQuestions(f, mixed))).toEqual(['pushchair', 'cafe', 'parking']);
  });

  it('puts a disputed field before an unknown one', () => {
    const f = fields([claim('familyFacilities.toilets', 'yes')], [{ user_id: 'u', visit_date: '2026-10-04', answers: { toilets: 'unavailable' }, status: 'active', created_at: '2026-10-04T12:00:00Z' }]);
    expect(keys(pickVisitQuestions(f, mixed))[0]).toBe('toilets');
  });

  it('puts a stale source before a single parent report', () => {
    const f = fields([claim('familyFacilities.parking', 'yes', 90)], [{ user_id: 'u', visit_date: '2026-10-04', answers: { cafe: 'yes' }, status: 'active', created_at: '2026-10-04T12:00:00Z' }]);
    const picked = keys(pickVisitQuestions(f, walkingTeens, 5));
    expect(picked.indexOf('parking')).toBeLessThan(picked.indexOf('cafe'));
  });

  it('asks nothing when the venue is fully confirmed, and never more than three', () => {
    const all = fields(['familyFacilities.babyChanging', 'pushchairSuitability', 'familyFacilities.toilets', 'familyFacilities.parking', 'familyFacilities.cafe'].map((k) => claim(k, k === 'pushchairSuitability' ? 'good' : 'yes')));
    expect(pickVisitQuestions(all, mixed)).toEqual([]);
    expect(pickVisitQuestions(fields(), mixed).length).toBeLessThanOrEqual(3);
  });

  it('works with no server answer and no profile: every answerable field is "unknown"', () => {
    expect(keys(pickVisitQuestions(null, null))).toEqual(['babyChanging', 'pushchair', 'toilets']);
  });

  it('says why each question is being asked, in plain words', () => {
    const picked = pickVisitQuestions(fields([claim('familyFacilities.parking', 'yes', 90)]), buggyToddler, 5);
    expect(picked.find((q) => q.key === 'babyChanging')?.why).toBe('Nobody has confirmed this yet');
    expect(picked.find((q) => q.key === 'parking')?.why).toBe('The last check was a while ago');
  });

  it('relevance is decided on the device from what it already knows', () => {
    expect(relevanceFor('pushchair', walkingTeens)).toBe(0);
    expect(relevanceFor('babyChanging', buggyToddler)).toBe(2);
    expect(relevanceFor('parking', family([child('a', 8)], { vehicle: 'Golf' } as never))).toBe(2);
  });
});
