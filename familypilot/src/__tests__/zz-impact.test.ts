// Impact harness for Family Fit changes. Copy to src/__tests__/zz-impact.test.ts, then:
//   CATALOGUE=<compact export> OUT=<json path> npx vitest run src/__tests__/zz-impact.test.ts
// The catalogue export is read-only production data (ids, category, location, reviewed facts) and is never committed.
import { it, vi } from 'vitest';
import fs from 'node:fs';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { estimateDriveMinutes } from '@/src/services/places/geo-utils';

const tri = (c: string) => (c === 'y' ? 'yes' : c === 'n' ? 'no' : undefined);
const rows = fs.readFileSync(process.env.CATALOGUE as string, 'utf8').trim().split('\n').map((line) => {
  const [id, category, lat, lng, status, f, pushchair, env, energy, terrain, min, max] = line.split('|');
  return { id, category, lat: Number(lat), lng: Number(lng), status, f, pushchair, env, energy, terrain, min, max };
});

const HOMES: Record<string, [number, number]> = {
  'N1 Islington': [51.5362, -0.103], 'E17 Walthamstow': [51.5886, -0.0196], 'SW4 Clapham': [51.462, -0.138],
  'W5 Ealing': [51.513, -0.305], 'SE10 Greenwich': [51.4826, 0.0077], 'NW7 Mill Hill': [51.615, -0.245],
  'BR1 Bromley': [51.406, 0.014], 'HA1 Harrow': [51.579, -0.337],
};
const child = (id: string, name: string, age: number, mob: string[] = ['walks']) => ({ id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 2 : null, mobility: mob });
const parent = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const FAMILIES: Record<string, any[]> = {
  'baby+toddler': [child('a', 'Sloane', 3, ['buggy']), child('b', 'Ozzie', 0, ['buggy'])],
  toddler: [child('a', 'Sloane', 3, ['buggy'])],
  school: [child('a', 'Maya', 7)],
  baby: [child('b', 'Ozzie', 0, ['buggy'])],
  'two kids': [child('a', 'Kit', 4), child('b', 'Maya', 7)],
};
const profileFor = (home: [number, number], kids: any[]): any => ({
  id: 'f', parentName: 'Alex', members: [parent, ...kids], homeLocation: 'x', homeLatitude: home[0], homeLongitude: home[1],
  budgetTier: 'moderate', maxDriveMinutes: Number(process.env.DRIVE ?? 30), completionPercent: 100, mustHaveFacilities: [], routines: [],
});
const hours = (days: number[]) => ({ timezone: 'Europe/London', periods: days.map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })) });
const ALL = [0, 1, 2, 3, 4, 5, 6];

function venueFor(r: (typeof rows)[number], home: [number, number], schedule: any) {
  const drive = estimateDriveMinutes(home[0], home[1], r.lat, r.lng);
  const reviewed = r.status === 'enriched' || r.status === 'verified';
  const meta: any = reviewed ? {
    enrichmentStatus: 'enriched',
    familyFacilities: { toilets: tri(r.f[0]), babyChanging: tri(r.f[1]), parking: tri(r.f[2]), freeParking: tri(r.f[3]), cafe: tri(r.f[4]) },
    pushchairSuitability: r.pushchair === '-' ? undefined : r.pushchair,
    environment: r.env === '-' ? undefined : r.env, energyLevel: r.energy === '-' ? undefined : r.energy,
    extendedTerrain: r.terrain === '-' ? undefined : r.terrain,
    minRecommendedAge: r.min === '' ? null : Number(r.min), maxRecommendedAge: r.max === '' ? null : Number(r.max),
  } : null;
  const facts = extractMatchableFacts(r.id, r.id, r.category, drive, reviewed ? 'enriched' : 'provider_only', meta, undefined);
  return {
    id: r.id, name: r.id, category: r.category, latitude: r.lat, longitude: r.lng, driveMinutes: drive, imageUrl: '',
    familyScore: { score: 0, factors: {}, explanation: [] }, enrichmentStatus: reviewed ? 'enriched' : 'provider_only',
    structuredOpeningHours: schedule, trustedFacts: facts, facilities: [],
    estimatedSpend: undefined,
  } as any;
}

// Conditions: the clock (Tuesday 6 Oct 2026, London), the day's hours, and the weather.
const CONDITIONS: Record<string, { at: string; days: number[]; weather: any }> = {
  base: { at: '2026-10-06T10:30:00+01:00', days: ALL, weather: null },
  'open, sun': { at: '2026-10-06T10:30:00+01:00', days: ALL, weather: { condition: 'sunny', temperature: 20, description: 'Sun' } },
  'open, rain': { at: '2026-10-06T10:30:00+01:00', days: ALL, weather: { condition: 'rainy', temperature: 11, description: 'Rain' } },
  'closing soon': { at: '2026-10-06T16:20:00+01:00', days: ALL, weather: null },
  'finished for today': { at: '2026-10-06T18:30:00+01:00', days: ALL, weather: null },
  'closed all day today': { at: '2026-10-06T10:30:00+01:00', days: [0, 1, 3, 4, 5, 6], weather: null },
};

it('impact', () => {
  const out: any = { conditions: {}, base: {} };
  const verdicts = ['excellent', 'good', 'possible', 'poor', 'not_reviewed'];
  for (const [cname, c] of Object.entries(CONDITIONS)) {
    vi.useFakeTimers(); vi.setSystemTime(new Date(c.at));
    const agg = { pairs: 0, verdictChanged: 0, scoreChanged: 0, top10Jaccard: [] as number[], excludedFromList: 0, dist: Object.fromEntries(verdicts.map((v) => [v, 0])) as Record<string, number> };
    for (const [hname, home] of Object.entries(HOMES)) for (const [fname, kids] of Object.entries(FAMILIES)) {
      const profile = profileFor(home, kids);
      const run = (cond: (typeof c)) => rows.map((r) => {
        const v = personaliseVenue(venueFor(r, home, hours(cond.days)), profile, cond.weather);
        return { id: r.id, score: v.familyScore.score, verdict: v.familyMatch?.verdict ?? 'none' };
      });
      vi.setSystemTime(new Date(CONDITIONS.base.at));
      const base = run(CONDITIONS.base);
      vi.setSystemTime(new Date(c.at));
      const cur = run(c);
      const key = `${hname}|${fname}`;
      if (cname === 'base') out.base[key] = base.slice().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 10).map((x) => x.id);
      cur.forEach((x, i) => {
        agg.pairs += 1; agg.dist[x.verdict] = (agg.dist[x.verdict] ?? 0) + 1;
        if (x.verdict !== base[i].verdict) agg.verdictChanged += 1;
        if (x.score !== base[i].score) agg.scoreChanged += 1;
      });
      const top = (list: typeof cur) => new Set(list.slice().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 10).map((x) => x.id));
      const a = top(base), b = top(cur);
      const inter = [...a].filter((x) => b.has(x)).length;
      agg.top10Jaccard.push(inter / (a.size + b.size - inter));
    }
    vi.useRealTimers();
    out.conditions[cname] = {
      pairs: agg.pairs, verdictChangedPct: +(100 * agg.verdictChanged / agg.pairs).toFixed(2), scoreChangedPct: +(100 * agg.scoreChanged / agg.pairs).toFixed(2),
      meanTop10Overlap: +(agg.top10Jaccard.reduce((s, x) => s + x, 0) / agg.top10Jaccard.length).toFixed(3), dist: agg.dist,
    };
  }
  fs.writeFileSync(process.env.OUT as string, JSON.stringify(out, null, 1));
  console.log('IMPACT_WRITTEN');
}, 600000);
