import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { rankForFamily } from '@/src/services/places/home-list';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import type { FamilyMember, FamilyProfile } from '@/src/types';
import type { ExternalPlaceRecord } from '@/src/types/places';

/**
 * NOT a unit test: an experiment harness, skipped unless DUMP_FIXTURE_DIR and DUMP_OUT are set. Run once on main and once on a candidate
 * branch with every flag unset, then compare the two files byte for byte (docs/pilot/BETA_PLAN.md, stage 3).
 */
// Dumps what Home shows, for 14 households over the production-equivalent ("before") venue data. Run on main and on the branch with
// every flag unset: the two outputs must be identical.
const DIR = process.env.DUMP_FIXTURE_DIR; const OUT = process.env.DUMP_OUT;
const adult = (): FamilyMember => ({ id: 'p', name: 'P', role: 'parent', dateOfBirth: '', age: 36 });
const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({ id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra });
const HOMES = { C: [51.539, -0.142, 'Camden'], E: [51.513, -0.305, 'Ealing'], G: [51.482, 0.0, 'Greenwich'], S: [51.541, 0.003, 'Stratford'] } as const;
const H: Array<[string, keyof typeof HOMES, FamilyMember[], number | null, FamilyProfile['mustHaveFacilities'], string | null]> = [
  ['A', 'C', [kid('a', 'Mia', 4), kid('b', 'Leo', 0, { mobility: ['buggy'] })], 90, [], 'x'],
  ['B', 'C', [kid('b', 'Noah', 0, { mobility: ['buggy'] })], 90, [], 'x'],
  ['C', 'C', [kid('a', 'Cal', 7), kid('b', 'Dee', 10)], 90, [], null],
  ['D', 'C', [kid('a', 'Ivy', 2, { mobility: ['mobility-aid'] })], 90, ['toilets'], null],
  ['E', 'C', [kid('a', 'Ada', 2), kid('b', 'Ben', 4)], 30, [], null],
  ['F', 'E', [kid('b', 'Kit', 0, { mobility: ['carrier'], ageMonths: 6 })], 40, [], null],
  ['G', 'G', [kid('a', 'Fay', 9), kid('b', 'Gus', 12)], null, [], null],
  ['H', 'S', [kid('a', 'Hal', 3, { mobility: ['buggy'] })], 20, ['pushchair_friendly'], 'x'],
  ['I', 'E', [kid('a', 'Ida', 7, { mobility: ['mobility-aid'] })], 60, ['parking', 'toilets'], null],
  ['K', 'C', [kid('a', 'Zed', 13), kid('b', 'Mia', 5), kid('c', 'Kit', 0, { mobility: ['buggy'], ageMonths: 6 })], 60, [], 'x'],
  ['L', 'G', [kid('a', 'Ivy', 2), kid('b', 'Max', 14)], null, [], null],
];
describe.skipIf(!DIR || !OUT)('dump', () => {
  it('writes', () => {
    const out: Record<string, unknown> = {};
    for (const state of ['before', 'afterAuto']) {
      const places = JSON.parse(fs.readFileSync(path.join(DIR!, `pilot-${state}.json`), 'utf8')) as ExternalPlaceRecord[];
      for (const [key, home, kids, limit, must, push] of H) {
        const [lat, lng, name] = HOMES[home];
        const profile = { id: key, parentName: 'P', members: [adult(), ...kids], homeLocation: name, homeLatitude: lat, homeLongitude: lng, ...(limit !== null ? { maxDriveMinutes: limit } : {}), budgetTier: 'moderate', completionPercent: 90, mustHaveFacilities: must, routines: [], ...(push ? { pushchair: push } : {}) } as unknown as FamilyProfile;
        const venues = places.map((p) => mergePlaceToVenue(p, p.familyMetadata ?? null, lat, lng));
        out[`${state}:${key}`] = rankForFamily(venues, profile).map((v) => ({ id: v.id, score: v.familyScore.score, factors: v.familyScore.factors, cautions: v.familyScore.cautions ?? [], verdict: v.familyMatch?.verdict, headline: v.familyMatch?.headline, reasons: v.familyMatch?.reasons?.map((r) => r.text), toCheck: v.familyMatch?.toCheck?.map((r) => r.text) }));
      }
    }
    fs.writeFileSync(OUT!, JSON.stringify(out, null, 1));
  });
});
