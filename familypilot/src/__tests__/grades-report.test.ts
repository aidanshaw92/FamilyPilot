import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { it } from 'vitest';

import { STORED_VENUES } from './fixtures/stored-venues';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';

/**
 * The before/after report behind docs/FAMILY_FIT_GRADING.md: every stored venue in the fixture, for four households, as
 * Family Fit grades it. Run with GOLDEN_WRITE=1 GRADES_TAG=<tag> to write golden/grades-<tag>.json; run on the pre-change
 * commit for "before" and on this branch for "after". Asserts nothing: the grading tests are in family-fit-grading.test.ts.
 */
const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({ id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 7 : null, mobility: ['walks'], ...extra });
const parent: FamilyMember = { id: 'p', name: 'Sarah', role: 'parent', dateOfBirth: '', age: 36 };
const household = (kids: FamilyMember[]): FamilyProfile => ({ id: 'f', parentName: 'Sarah', members: [parent, ...kids], homeLocation: 'Camden', homeLatitude: 51.539, homeLongitude: -0.142, budgetTier: 'moderate', maxDriveMinutes: 60, mustHaveFacilities: [], routines: [], memberships: [], travelCot: null } as unknown as FamilyProfile);
export const REPORT_HOUSEHOLDS: [string, FamilyProfile][] = [
  ['3-year-old and a baby in a buggy', household([kid('c1', 'Sloane', 3), kid('c2', 'Ozzie', 0, { mobility: ['buggy'] })])],
  ['3-year-old and a baby who is carried', household([kid('c1', 'Sloane', 3), kid('c2', 'Ozzie', 0, { mobility: ['carrier'] })])],
  ['one 5-year-old', household([kid('c1', 'Sloane', 5)])],
  ['8- and 10-year-old', household([kid('c1', 'Alfie', 8), kid('c2', 'Bea', 10)])],
];

export function gradeStored(profile: FamilyProfile, key: keyof typeof STORED_VENUES) {
  const r = STORED_VENUES[key];
  const drive = estimateDriveMinutes(51.539, -0.142, r.latitude, r.longitude);
  const facts = extractMatchableFacts(r.id, r.name, r.category, drive, 'enriched', r.metadata, true);
  const venue = { id: r.id, name: r.name, category: r.category, latitude: r.latitude, longitude: r.longitude, driveMinutes: drive, imageUrl: '', familyScore: { score: 0, factors: {}, explanation: [] }, enrichmentStatus: 'enriched', facilities: r.metadata.facilities, trustedFacts: facts } as unknown as Venue;
  return personaliseVenue(venue, profile);
}

it('writes the grades report when asked', () => {
  if (process.env.GOLDEN_WRITE !== '1') return;
  const out: Record<string, Record<string, { verdict: string; score: number; headline: string }>> = {};
  for (const [label, profile] of REPORT_HOUSEHOLDS) {
    out[label] = {};
    for (const key of Object.keys(STORED_VENUES) as (keyof typeof STORED_VENUES)[]) {
      const v = gradeStored(profile, key);
      out[label][STORED_VENUES[key].name] = { verdict: v.familyMatch!.verdict, score: v.familyScore.score, headline: v.familyMatch!.headline };
    }
  }
  writeFileSync(join(__dirname, 'golden', `grades-${process.env.GRADES_TAG ?? 'after'}.json`), `${JSON.stringify(out, null, 2)}\n`);
});
