import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';

import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { rankForFamily } from '@/src/services/places/home-list';
import { activityEvidenceFor, evidenceCovers } from '@/src/services/matching/activity-evidence';
import { childAgeMonths } from '@/src/services/matching/age-suitability';
import type { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import type { ExternalPlaceRecord } from '@/src/types/places';

/**
 * NOT a unit test: an investigation harness, skipped unless PILOT_FIXTURE_DIR is set. It runs the app's own ranking
 * (`rankForFamily`, the function Home uses) over the pilot fixture for several different households, in each evidence state,
 * and writes what it found to PILOT_RANK_OUT. It changes nothing and asserts nothing; docs/pilot/RANKING_INVESTIGATION.md
 * reads its output.
 */
const DIR = process.env.PILOT_FIXTURE_DIR;
const OUT = process.env.PILOT_RANK_OUT;

const adult = (id: string, name: string): FamilyMember => ({ id, name, role: 'parent', dateOfBirth: '', age: 36 });
const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra,
});
const home = (lat: number, lng: number, name: string) => ({ lat, lng, name });
const CAMDEN = home(51.539, -0.142, 'Camden');
const EALING = home(51.513, -0.305, 'Ealing');
const GREENWICH = home(51.482, 0.0, 'Greenwich');
const STRATFORD = home(51.541, 0.003, 'Stratford');

interface Household { key: string; label: string; home: ReturnType<typeof home>; members: FamilyMember[]; limit: number | null; budget?: FamilyProfile['budgetTier']; must?: FamilyProfile['mustHaveFacilities']; pushchair?: string | null }
const HOUSEHOLDS: Household[] = [
  { key: 'A', label: 'Preschooler (4) and baby (8m), buggy', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Mia', 4), kid('b', 'Leo', 0, { mobility: ['buggy'] })], limit: 90, pushchair: 'x' },
  { key: 'B', label: 'Baby only (8m), buggy', home: CAMDEN, members: [adult('p', 'P'), kid('b', 'Noah', 0, { mobility: ['buggy'] })], limit: 90, pushchair: 'x' },
  { key: 'C', label: 'Two school-age (7, 10)', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Cal', 7), kid('b', 'Dee', 10)], limit: 90 },
  { key: 'D', label: 'Toddler (2) with mobility aid, toilets', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Ivy', 2, { mobility: ['mobility-aid'] })], limit: 90, must: ['toilets'] },
  { key: 'E', label: 'Toddler (2) + preschooler (4), no buggy, 30-minute limit', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Ada', 2), kid('b', 'Ben', 4)], limit: 30 },
  { key: 'F', label: 'Baby (6m) in a sling only, 40-minute limit', home: EALING, members: [adult('p', 'P'), kid('b', 'Kit', 0, { mobility: ['carrier'], ageMonths: 6 })], limit: 40 },
  { key: 'G', label: 'Two older children (9, 12), Greenwich, no limit', home: GREENWICH, members: [adult('p', 'P'), kid('a', 'Fay', 9), kid('b', 'Gus', 12)], limit: null },
  { key: 'H', label: 'Pre-schooler (3), buggy must-have, Stratford, 20-minute limit', home: STRATFORD, members: [adult('p', 'P'), kid('a', 'Hal', 3, { mobility: ['buggy'] })], limit: 20, must: ['pushchair_friendly'], pushchair: 'x' },
  { key: 'I', label: 'Child (7) using a wheelchair, parking + toilets', home: EALING, members: [adult('p', 'P'), kid('a', 'Ida', 7, { mobility: ['mobility-aid'] })], limit: 60, must: ['parking', 'toilets'] },
];

const profileFor = (h: Household): FamilyProfile => ({
  id: `fam-${h.key}`, parentName: 'P', members: h.members, homeLocation: h.home.name, homeLatitude: h.home.lat, homeLongitude: h.home.lng,
  ...(h.limit !== null ? { maxDriveMinutes: h.limit } : {}), budgetTier: h.budget ?? 'moderate', completionPercent: 90, mustHaveFacilities: h.must ?? [], routines: [],
  ...(h.pushchair ? { pushchair: h.pushchair } : {}),
} as FamilyProfile);

/**
 * PROPOSALS, computed here and nowhere in the app. They change what a score would be so the result can be looked at before
 * anyone decides; nothing in src/ reads them.
 *
 *   P1  Age factor from reviewed activity evidence. Today the age factor is the neutral 75 for every venue (none carries a
 *       recommended range), so a quarter of the weight differentiates nothing. P1 raises it for a child that a permanent,
 *       age-specific provision on the venue's own pages covers, towards the 96 a stated recommended range already earns, and
 *       NEVER lowers it: a child nothing covers stays at 75, because evidence for other ages is not evidence against.
 *   P2  A confirmed conflict with a household's own stated need (a verdict of poor from a breach, such as a pushchair rule
 *       for a family whose buggy is the only way round) ranks below places without one, instead of keeping its score.
 */
const WEIGHTS = { ageSuitability: 0.25, accessibility: 0.15, distance: 0.15, budgetFit: 0.1, facilitiesMatch: 0.15 } as const;
const NEUTRAL_AGE = 75;
const blend = (f: Record<string, number | undefined>): number => {
  let sum = 0;
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const v = f[k];
    if (typeof v !== 'number') continue;
    sum += v * w;
    total += w;
  }
  return Math.round(sum / total);
};
function proposedAge(venue: Venue, profile: FamilyProfile, now: Date, ceiling = 96): { factor: number; covered: string[] } {
  // An unreviewed (provider-only) venue is capped and explained as unreviewed everywhere; evidence cannot lift it here either.
  if (venue.enrichmentStatus === 'provider_only') return { factor: venue.familyScore.factors.ageSuitability, covered: [] };
  const kids = profile.members.filter((m) => m.role === 'child');
  const evidence = activityEvidenceFor(venue.id, now).filter((e) => e.kind === 'provision');
  const covered = kids.filter((k) => evidence.some((e) => evidenceCovers(e, childAgeMonths(k))));
  if (kids.length === 0 || covered.length === 0) return { factor: NEUTRAL_AGE, covered: [] };
  return { factor: Math.round(NEUTRAL_AGE + (ceiling - NEUTRAL_AGE) * (covered.length / kids.length)), covered: covered.map((k) => k.name) };
}

describe.skipIf(!DIR || !OUT)('pilot ranking investigation', () => {
  it('ranks the pilot venues for each household in each evidence state', () => {
    const result: Record<string, unknown> = { households: HOUSEHOLDS.map(({ key, label, limit, home: h }) => ({ key, label, limit, home: h.name })), states: {} };
    for (const state of ['before', 'afterAuto', 'after'] as const) {
      const places = JSON.parse(fs.readFileSync(path.join(DIR!, `pilot-${state}.json`), 'utf8')) as ExternalPlaceRecord[];
      const perHousehold: Record<string, unknown> = {};
      for (const h of HOUSEHOLDS) {
        const venues = places.map((p) => mergePlaceToVenue(p, p.familyMetadata ?? null, h.home.lat, h.home.lng));
        const ranked = rankForFamily(venues, profileFor(h));
        perHousehold[h.key] = ranked.map((v, index) => ({
          rank: index + 1, name: v.name, score: v.familyScore.score, drive: v.driveMinutes, factors: v.familyScore.factors,
          verdict: v.familyMatch?.verdict, headline: v.familyMatch?.headline, closed: v.familyMatch?.availableToday === false,
          reasons: (v.familyMatch?.reasons ?? []).map((l) => l.text), cautions: (v.familyMatch?.cautions ?? []).map((l) => l.text),
          toCheck: (v.familyMatch?.toCheck ?? []).map((l) => l.text), enrichment: v.enrichmentStatus,
        }));
      }
      (result.states as Record<string, unknown>)[state] = perHousehold;
      const proposals: Record<string, unknown> = {};
      for (const h of HOUSEHOLDS) {
        const profile = profileFor(h);
        const venues = places.map((p) => mergePlaceToVenue(p, p.familyMetadata ?? null, h.home.lat, h.home.lng));
        const base = rankForFamily(venues, profile);
        const NOW = new Date('2026-10-08T12:00:00Z');
        const rows = base.map((v) => {
          const age = proposedAge(v, profile, NOW);
          const factors = { ...v.familyScore.factors, ageSuitability: age.factor } as Record<string, number | undefined>;
          const unreviewed = v.enrichmentStatus === 'provider_only';
          const unchanged = v.familyScore.factors.ageSuitability === NEUTRAL_AGE;
          // The replicated blend must reproduce the app's own score when the age factor is the neutral one.
          const check = unchanged && !unreviewed && blend(v.familyScore.factors as unknown as Record<string, number | undefined>) !== v.familyScore.score;
          const breach = v.familyMatch?.verdict === 'poor' && (v.familyMatch?.cautions ?? []).length > 0;
          const lowFactors = { ...v.familyScore.factors, ageSuitability: proposedAge(v, profile, NOW, 85).factor } as Record<string, number | undefined>;
          return { name: v.name, base: v.familyScore.score, p1low: unreviewed ? v.familyScore.score : blend(lowFactors), p1: unreviewed ? v.familyScore.score : blend(factors), covered: age.covered, breach, drive: v.driveMinutes, verdict: v.familyMatch?.verdict, blendMismatch: check };
        });
        const order = (key: 'base' | 'p1' | 'p1p2') =>
          [...rows]
            .map((r) => ({ ...r, p1p2: r.p1 }))
            .sort((a, b) => (key === 'p1p2' ? Number(a.breach) - Number(b.breach) : 0) || b[key === 'base' ? 'base' : 'p1'] - a[key === 'base' ? 'base' : 'p1'] || a.drive - b.drive)
            .map((r, i) => ({ rank: i + 1, name: r.name, score: key === 'base' ? r.base : r.p1, covered: r.covered, breach: r.breach, verdict: r.verdict }));
        const topOf = (key: 'p1low' | 'p1') => [...rows].filter((r) => !r.breach).sort((a, b) => b[key] - a[key] || a.drive - b.drive)[0]?.name;
        proposals[h.key] = { sensitivity: { top96: topOf('p1'), top85: topOf('p1low'), maxGain96: Math.max(...rows.map((r) => r.p1 - r.base)), maxGain85: Math.max(...rows.map((r) => r.p1low - r.base)) }, base: order('base').slice(0, 5), p1: order('p1').slice(0, 5), p1p2: order('p1p2').slice(0, 5), blendMismatches: rows.filter((r) => r.blendMismatch).length };
      }
      (result as Record<string, unknown>)[`proposals_${state}`] = proposals;
    }
    fs.mkdirSync(path.dirname(OUT!), { recursive: true });
    fs.writeFileSync(OUT!, JSON.stringify(result, null, 1));
  });
});
