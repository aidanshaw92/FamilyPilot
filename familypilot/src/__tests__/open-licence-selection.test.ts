import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAPPABLE_PROVIDERS, canPlotOnOwnMap } from '@/src/utils/map-compliance';
import { OGL_URL, OS_CREDIT, creditsForPlaces, externalCreditFor } from '@/src/services/places/attribution';

/**
 * Venues served from sources that are not OpenStreetMap: OS Open Greenspace (Open Government Licence v3.0) and Wikidata (CC0). Synthetic fixtures only.
 * What matters here: the registry accepts exactly these sources with exactly their licences and keeps each in its own file; the app credits the Ordnance
 * Survey where its licence asks and nobody for CC0; the map may draw them; and the selector never writes a reviewer, a Google id or a stored name.
 */
const root = join(__dirname, '../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identities = require(join(root, 'server/places/lib/independent-identities.js')) as any;

const osEntry = (over: Record<string, unknown> = {}) => ({
  familypilotId: 'fp-os-0a1b2c3d-0000-0000-0000-000000000001',
  name: 'Brockwell Park',
  category: 'park',
  identity: { source: 'os-greenspace', url: 'https://www.ordnancesurvey.co.uk/products/os-open-greenspace', retrievedAt: '2026-10-14', licence: 'OGL-3.0', externalId: '0a1b2c3d-0000-0000-0000-000000000001' },
  location: { latitude: 51.451, longitude: -0.1066, source: 'os-greenspace', licence: 'OGL-3.0' },
  reviewedBy: 'aidan',
  reviewedAt: '2026-10-20',
  ...over,
});
const wdEntry = (over: Record<string, unknown> = {}) => ({
  familypilotId: 'fp-wd-q1234',
  name: 'Horniman Museum',
  category: 'museum',
  identity: { source: 'wikidata', url: 'https://www.wikidata.org/wiki/Q1234', retrievedAt: '2026-10-14', licence: 'CC0-1.0', externalId: 'Q1234' },
  location: { latitude: 51.4412, longitude: -0.0611, source: 'wikidata', licence: 'CC0-1.0' },
  website: 'https://www.horniman.ac.uk/',
  reviewedBy: 'aidan',
  reviewedAt: '2026-10-20',
  ...over,
});

// ---------------------------------------------------------------- the selector library
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lib: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cli: any;
async function load() {
  lib ??= await import(join(root, 'scripts/lib/open-licence.mjs'));
  cli ??= await import(join(root, 'scripts/select-open-licence-batch.mjs'));
}

/** A square of `side` metres with its south-west corner at (lat, lng). */
function square(lat: number, lng: number, side: number) {
  const dLat = side / 110540;
  const dLng = side / (111320 * Math.cos((lat * Math.PI) / 180));
  return { type: 'Polygon', coordinates: [[[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat], [lng, lat]]] };
}
/** A feature identifier in the dataset's own shape (OS uses uppercase GUIDs), made deterministically from a readable label. */
const guid = (label: string) => {
  const h = Buffer.from(label).toString('hex').padEnd(32, '0').slice(0, 32).toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const feature = (id: string, fn: string, name: string | null, geometry: unknown) => ({ type: 'Feature', properties: { id: guid(id), function: fn, distName1: name }, geometry });

describe('geometry', () => {
  it('measures a 100 m square as one hectare, to within one per cent', async () => {
    await load();
    expect(lib.areaHa(square(51.5, -0.1, 100))).toBeGreaterThan(0.99);
    expect(lib.areaHa(square(51.5, -0.1, 100))).toBeLessThan(1.01);
  });

  it('puts the point of a C-shaped park inside it, where the centroid is not', async () => {
    await load();
    const d = 0.002;
    const c = { type: 'Polygon', coordinates: [[[0, 0], [3 * d, 0], [3 * d, d], [d, d], [d, 2 * d], [3 * d, 2 * d], [3 * d, 3 * d], [0, 3 * d], [0, 0]].map(([x, y]) => [-0.1 + x, 51.5 + y])] };
    const p = lib.interiorPoint(c);
    expect(lib.pointInGeometry(p.lat, p.lng, c)).toBe(true);
  });
});

describe('candidates', () => {
  const grid = {
    features: [
      feature('P1', 'Public Park Or Garden', 'Larch Park', square(51.5, -0.1, 400)), // 16 ha
      feature('P1b', 'Public Park Or Garden', 'Larch Park', square(51.5, -0.0935, 150)), // the other half, across a road
      feature('P2', 'Public Park Or Garden', 'Tiny Green', square(51.52, -0.1, 60)),
      feature('P3', 'Public Park Or Garden', null, square(51.53, -0.1, 400)),
      feature('P4', 'Public Park Or Garden', 'Pocket Park', square(51.54, -0.1, 100)), // 1 ha
      feature('S4', 'Play Space', null, square(51.5405, -0.0995, 20)), // a mapped play space inside Pocket Park
      feature('G1', 'Playing Field', 'Cranford School Playing Field', square(51.55, -0.1, 400)),
      feature('C1', 'Cemetery', 'Old Cemetery', square(51.56, -0.1, 400)),
    ],
  };

  it('keeps named public parks, joins a park drawn as two parts, and says whether a play space is mapped inside', async () => {
    await load();
    const parks = lib.osParks(grid);
    const names = parks.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['Larch Park', 'Pocket Park', 'Tiny Green']);
    const larch = parks.find((p: { name: string }) => p.name === 'Larch Park');
    expect(larch.parts).toBe(2);
    expect(larch.ha).toBeGreaterThan(17);
    expect(parks.find((p: { name: string }) => p.name === 'Pocket Park').play).toBe(true);
    expect(larch.play).toBe(false);
  });

  it('holds back the small, the private-use and the generic, with a reason each, and lets a real destination through', async () => {
    await load();
    const parks = lib.osParks(grid);
    const by = Object.fromEntries(parks.map((p: { name: string }) => [p.name, lib.holdReason(p)]));
    expect(by['Larch Park']).toBeNull();
    expect(by['Pocket Park']).toBeNull(); // 1 ha but a mapped play space of at least half a hectare
    expect(by['Tiny Green']).toMatch(/too small/);
    expect(lib.holdReason({ source: 'os-greenspace', kind: 'park', name: 'The Green', ha: 9, play: false })).toMatch(/names no particular place/);
    expect(lib.holdReason({ source: 'os-greenspace', kind: 'park', name: 'St Mary Churchyard', ha: 9, play: false })).toMatch(/burial ground|allotments|club/);
    expect(lib.holdReason({ source: 'os-greenspace', kind: 'park', name: 'Wanstead Golf Course', ha: 90, play: false })).toMatch(/golf/);
  });

  it('turns Wikidata items into candidates only for the classes the app serves', async () => {
    await load();
    const row = (q: string, label: string, cls: string, extra: Record<string, string> = {}) => ({
      item: { value: `http://www.wikidata.org/entity/${q}` }, itemLabel: { value: label }, coord: { value: 'Point(-0.1 51.5)' }, classLabel: { value: cls },
      ...(extra.website ? { website: { value: extra.website } } : {}), ...(extra.sitelinks ? { sitelinks: { value: extra.sitelinks } } : {}),
    });
    const c = lib.wikidataCandidates([{ results: { bindings: [row('Q1', 'Test Museum', 'museum', { website: 'https://example.org/', sitelinks: '9' }), row('Q2', 'Test Station', 'railway station'), row('Q3', 'Q3', 'museum'), row('Q4', 'Test Zoo', 'zoo'), row('Q4', 'Test Zoo', 'tourist attraction')] } }]);
    expect(c.map((x: { q: string }) => x.q).sort()).toEqual(['Q1', 'Q4']);
    expect(c.find((x: { q: string }) => x.q === 'Q4').category).toBe('zoo');
    expect(c.find((x: { q: string }) => x.q === 'Q1')).toMatchObject({ website: 'https://example.org/', sitelinks: 9, category: 'museum' });
  });

  it('classes a castle, house or dungeon that Wikidata files under museum as an attraction, says why, and holds a barrow or an arts centre back', async () => {
    await load();
    const row = (q: string, label: string) => ({
      item: { value: `http://www.wikidata.org/entity/${q}` }, itemLabel: { value: label }, coord: { value: 'Point(-0.1 51.5)' }, classLabel: { value: 'museum' },
      website: { value: 'https://example.org/' }, sitelinks: { value: '9' },
    });
    const c = lib.wikidataCandidates([{ results: { bindings: [row('Q1', 'Kenwood House'), row('Q2', 'Horniman Museum and Gardens'), row('Q3', 'Coldrum Long Barrow'), row('Q4', 'Barbican Centre'), row('Q5', 'Dulwich Picture Gallery'), row('Q6', 'London Dungeon')] } }]);
    const by = Object.fromEntries(c.map((x: { q: string }) => [x.q, x]));
    expect(by.Q1).toMatchObject({ category: 'attraction' });
    expect(by.Q1.reclassified).toMatch(/classed as an attraction/);
    expect(by.Q6.category).toBe('attraction');
    expect(by.Q2.category).toBe('museum'); // the name says museum
    expect(by.Q5.category).toBe('museum'); // the name says gallery
    expect(lib.holdReason(by.Q3)).toMatch(/prehistoric monument/);
    expect(lib.holdReason(by.Q4)).toMatch(/arts or events venue/);
    // the reclassification is a note shown with the record, not a doubt that holds it back
    expect(lib.doubts(by.Q1)).toEqual([]);
    expect(lib.scoreCandidate(by.Q1).signals.join(' ')).toMatch(/classed as an attraction/);
  });

  it('writes entries that are never reviewed and that the registry accepts once a person has signed', async () => {
    await load();
    const parks = lib.osParks(grid);
    const e = lib.entryFromOs(parks[0], { version: '2026-10-14' });
    expect(e.reviewedBy).toMatch(/^UNREVIEWED/);
    expect(identities.problemWith(e)).toMatch(/unreviewed/);
    expect(identities.problemWith({ ...e, reviewedBy: 'aidan', reviewedAt: '2026-10-20' })).toBeNull();
    const w = lib.entryFromWikidata({ q: 'Q1', name: 'Test Museum', category: 'museum', lat: 51.5, lng: -0.1, website: 'http://insecure.example/' }, { version: '2026-10-14' });
    expect(w.website).toBeUndefined(); // the registry takes https only
    expect(identities.problemWith({ ...w, reviewedBy: 'aidan', reviewedAt: '2026-10-20' })).toBeNull();
  });
});

describe('continuing a venue we already hold', () => {
  const parks = () => {
    const ps = lib.osParks({ features: [{ type: 'Feature', properties: { id: guid('P1'), function: 'Public Park Or Garden', distName1: 'Larch Park' }, geometry: square(51.5, -0.1, 400) }] });
    return ps;
  };
  const stored = (over: Record<string, unknown> = {}) => ({ id: 'fp-google-X', name: 'Larch Park', category: 'park', lat: 51.5015, lng: -0.0985, ...over });

  it('matches a stored park by name and by lying inside the polygon, and calls it confident', async () => {
    await load();
    const { os } = lib.matchStored(stored(), { parks: parks(), wikidata: [] });
    expect(os).not.toBeNull();
    expect(os.inside).toBe(true);
    expect(lib.judgeMatch(stored(), os)).toEqual({ confident: true, flags: [] });
  });

  it('never lets a park continue a farm that happens to sit inside it', async () => {
    await load();
    const { os } = lib.matchStored(stored({ name: 'Larch Park Farm', category: 'farm' }), { parks: parks(), wikidata: [] });
    expect(os).toBeNull();
  });

  it('asks a person to compare when the names differ', async () => {
    await load();
    const woods = lib.osParks({ features: [{ type: 'Feature', properties: { id: guid('P9'), function: 'Public Park Or Garden', distName1: 'Larch Hill Wood' }, geometry: square(51.5, -0.1, 400) }] });
    const s = stored({ name: 'Larch Hill' });
    const { os } = lib.matchStored(s, { parks: woods, wikidata: [] });
    expect(os).not.toBeNull();
    const verdict = lib.judgeMatch(s, os);
    expect(verdict.confident).toBe(false);
    expect(verdict.flags.join(' ')).toMatch(/names differ/);
  });

  it('does not match a name that shares only the word park', async () => {
    await load();
    const { os } = lib.matchStored(stored({ name: 'Larch Park Gardens' }), { parks: parks(), wikidata: [] });
    expect(os).toBeNull();
  });

  it('matches a museum to a Wikidata item within 250 m, and a venue of another category only with a near-exact name', async () => {
    await load();
    const wd = [{ source: 'wikidata', q: 'Q7', name: 'Test Museum', lat: 51.5, lng: -0.1, category: 'museum', classes: ['museum'], website: null, sitelinks: 5 }];
    const s = { id: 'fp-google-M', name: 'Test Museum', category: 'attraction', lat: 51.5008, lng: -0.1 };
    const { wd: hit } = lib.matchStored(s, { parks: [], wikidata: wd });
    expect(hit.candidate.q).toBe('Q7');
    expect(lib.judgeMatch(s, hit).flags.join(' ')).toMatch(/category differs/);
    expect(lib.judgeMatch(s, hit).confident).toBe(true); // similarity 1
    expect(lib.judgeMatch({ ...s, name: 'The Test Museum Shop' }, { ...hit, sim: 0.82 }).confident).toBe(false);
  });
});

describe('what the selector writes', () => {
  function run() {
    const parks = lib.osParks({
      features: [
        { type: 'Feature', properties: { id: guid('AAAA0001'), function: 'Public Park Or Garden', distName1: 'Larch Park' }, geometry: square(51.5, -0.1, 400) },
        { type: 'Feature', properties: { id: guid('AAAA0002'), function: 'Public Park Or Garden', distName1: 'Elm Meadows' }, geometry: square(51.6, -0.2, 500) },
      ],
    });
    const wikidata = lib.wikidataCandidates([{ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q77' }, itemLabel: { value: 'Elm Meadows Museum' }, coord: { value: 'Point(-0.3 51.45)' }, classLabel: { value: 'museum' }, website: { value: 'https://example.org/elm' }, sitelinks: { value: '12' } }] } }]);
    const stored = [{ id: 'fp-google-ChIJsecret', name: 'Larch Park', category: 'park', lat: 51.5015, lng: -0.0985 }, { id: 'fp-google-ChIJother', name: 'Some Stored Soft Play', category: 'soft_play', lat: 51.4, lng: -0.3 }];
    const r = cli.buildOpenLicenceBatch({ parks, wikidata, stored, version: '2026-10-14', target: 20 });
    const out = mkdtempSync(join(tmpdir(), 'ol-pub-'));
    const priv = mkdtempSync(join(tmpdir(), 'ol-priv-'));
    cli.writeOpenLicenceOutputs(out, r, { privateOut: priv });
    return { r, out, priv };
  }
  const readAll = (dir: string) => readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

  it('continues the matched park, proposes the museum as new, and reports the soft-play venue as having no independent candidate', async () => {
    await load();
    const { r, out, priv } = run();
    try {
      expect(r.rows.map((x: { candidate: { name: string } }) => x.candidate.name)).toEqual(['Larch Park']);
      expect(r.picked.map((p: { c: { name: string } }) => p.c.name).sort()).toEqual(['Elm Meadows', 'Elm Meadows Museum']);
      expect(r.unmatched.map((u: { id: string }) => u.id)).toEqual(['fp-google-ChIJother']);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(priv, { recursive: true, force: true });
    }
  });

  it('keeps Google ids and stored names out of every public file, puts them only in the private folder, and writes no map from a stored id to an entry', async () => {
    await load();
    const { out, priv } = run();
    try {
      const pub = readAll(out);
      expect(pub).toMatch(/Larch Park/);
      expect(pub).not.toMatch(/fp-google|ChIJ|Some Stored Soft Play/);
      const priv_ = readAll(priv);
      expect(priv_).toMatch(/fp-google-ChIJother/); // a stored venue with no candidate is listed for the reviewer
      expect(priv_).not.toMatch(/fp-google-ChIJsecret/); // a matched venue's id is written nowhere: there is no map
      expect(readdirSync(priv).some((f) => /alias|keyed/i.test(f))).toBe(false);
      const publicEntries = JSON.parse(readFileSync(join(out, 'A1.entries.UNREVIEWED.json'), 'utf8'));
      expect(publicEntries[0].familypilotId).toMatch(/^fp-os-/);
      for (const e of [...publicEntries, ...JSON.parse(readFileSync(join(out, 'A2.entries.UNREVIEWED.json'), 'utf8'))]) expect(e.reviewedBy).toMatch(/^UNREVIEWED/);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(priv, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------- the review pack
describe('the first-batch review pack', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pack: any;
  async function loadPack() {
    await load();
    pack ??= await import(join(root, 'scripts/build-first-batch.mjs'));
  }

  const batchMeta = { source: 'OpenStreetMap, Greater London extract (Geofabrik)', version: '2026-10-14', licence: 'ODbL-1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright' };
  const osmCandidate = (n: number, over: Record<string, unknown> = {}) => ({
    familypilot_place_id: `fp-osm-way-${n}`, source_record_id: `way/${n}@v1`, name: `Bowl Centre ${n}`, group_id: 'play', subtype: 'bowling_alley',
    lat: 51.5 + n * 0.01, lng: -0.1 - n * 0.01, website: 'https://example.org/bowl', source_tags: {}, operating_status: 'unknown', area_ha: null, playground_inside: null, wikidata_id: null, has_wikipedia: false, ...over,
  });

  function run() {
    const parks = lib.osParks({
      features: Array.from({ length: 12 }, (_, i) => feature(`PARK${i}`, 'Public Park Or Garden', `Fieldgate Park ${String.fromCharCode(65 + i)}`, square(51.45 + i * 0.012, -0.2 + i * 0.012, 500))),
    });
    const stored = [{ id: 'fp-google-ChIJa', name: 'Fieldgate Park A', category: 'park', lat: 51.4515, lng: -0.1985 }, { id: 'fp-google-ChIJb', name: 'Bowl Centre 1', category: 'activity', lat: 51.51, lng: -0.11 }];
    const candidates = [osmCandidate(1), osmCandidate(2), osmCandidate(3), osmCandidate(4)];
    const links = [{ open_data_place: 'fp-osm-way-1', google_place: 'fp-google-ChIJb', match_method: 'name_and_distance', match_confidence: 1, needs_review: false, km: 0.01 }];
    const siteChecks = Object.fromEntries(candidates.map((c) => [`https://www.openstreetmap.org/way/${c.source_record_id.split('/')[1].split('@')[0]}`, { ok: true, namesVenue: true }]));
    return pack.buildFirstBatch({
      osm: { candidates, links, batch: batchMeta, wikidata: [], greenspace: [], siteChecks, target: 10, budget: { activity: 1 } },
      open: { parks, wikidata: [], siteChecks: {}, target: 20 },
      stored, version: '2026-10-14', seed: 7,
    });
  }

  it('gives each stored venue to exactly one tranche, and the open-licence one first', async () => {
    await loadPack();
    const r = run();
    expect(r.aCont.map((x: { name: string }) => x.name)).toEqual(['Fieldgate Park A']);
    expect(r.bCont.map((x: { name: string }) => x.name)).toEqual(['Bowl Centre 1']);
    const ids = [...r.aCont, ...r.aNew, ...r.bCont, ...r.bNew].map((x: { entryId: string }) => x.entryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws the same sample every time, with at most five from each of the four groups, and none that is flagged', async () => {
    await loadPack();
    const a = run(); const b = run();
    expect(a.sample.map((x: { ref: string }) => x.ref)).toEqual(b.sample.map((x: { ref: string }) => x.ref));
    for (const [t, k] of [['A', 'continuity'], ['A', 'new'], ['B', 'continuity'], ['B', 'new']]) {
      expect(a.sample.filter((x: { tranche: string; kind: string }) => x.tranche === t && x.kind === k).length).toBeLessThanOrEqual(5);
    }
    expect(a.sample.every((x: { flags: string[]; kind: string }) => x.flags.length === 0 || x.kind === 'continuity')).toBe(true);
  });

  it('says what is decided now, what is held, and what is not claimed, without a Google id or a stored name', async () => {
    await loadPack();
    const r = run();
    const text = pack.renderReview(r);
    expect(text).toMatch(/Tranche A: continue venues we already hold/);
    expect(text).toMatch(/\*\*No\*\*: held/);
    expect(text).toMatch(/not\*\* a statement that a place has toilets/);
    expect(text).toMatch(/Your sample: 20 records/);
    expect(text).not.toMatch(/fp-google|ChIJ/);
    expect(text).not.toMatch(/reviewedBy|aidan/);
  });

  it('writes the pack and a private folder, and no file in the pack names a Google id', async () => {
    await loadPack();
    const r = run();
    const out = mkdtempSync(join(tmpdir(), 'fb-pub-'));
    const priv = mkdtempSync(join(tmpdir(), 'fb-priv-'));
    try {
      pack.writeFirstBatch(out, r, { privateOut: priv });
      const all = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(join(dir, e.name)) : [readFileSync(join(dir, e.name), 'utf8')]));
      for (const text of all(out)) expect(text).not.toMatch(/fp-google|ChIJ/);
      expect(all(priv).join('\n')).toMatch(/fp-google-ChIJa/);
      expect(readFileSync(join(out, 'REVIEW.md'), 'utf8').length).toBeGreaterThan(1000);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(priv, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------- applying a person's review
describe('applying a review', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let review: any;
  const unreviewed = (e: Record<string, unknown>) => ({ ...e, reviewedBy: 'UNREVIEWED (simulation only)', reviewedAt: '2026-10-14' });
  const osmEntry = unreviewed({
    familypilotId: 'fp-osm-way-9', name: 'Hackney City Farm', category: 'farm',
    identity: { source: 'osm', url: 'https://www.openstreetmap.org/way/9', retrievedAt: '2026-10-14', licence: 'ODbL-1.0', externalId: 'way/9' },
    location: { latitude: 51.532, longitude: -0.067, source: 'osm', licence: 'ODbL-1.0' },
  });
  const batch = () => [unreviewed(osEntry()), unreviewed(wdEntry()), osmEntry];
  async function loadReview() { review ??= await import(join(root, 'scripts/apply-review.mjs')); }

  it('will not write a reviewer for you, or accept an unnamed one', async () => {
    await loadReview();
    for (const reviewer of ['', ' ', 'UNREVIEWED', 'Claude', 'simulation', undefined]) {
      const r = review.applyReview({ entries: batch(), reviewer, date: '2026-10-20', odblCleared: true });
      expect(r.ok, String(reviewer)).toBe(false);
      expect(r.problems.join(' ')).toMatch(/named person/);
    }
    expect(review.applyReview({ entries: batch(), reviewer: 'A. Reviewer', date: 'tomorrow' }).problems.join(' ')).toMatch(/review date/);
  });

  it('rehearses a release without a name: the marker is served outside production and refused in it', async () => {
    await loadReview();
    const r = review.applyReview({ entries: batch().slice(0, 2), previewOnly: true, date: '2026-10-20' });
    expect(r.problems).toEqual([]);
    const all = [...r.files['os-greenspace'], ...r.files.wikidata];
    expect(all.every((e: { reviewedBy: string }) => e.reviewedBy === review.PREVIEW_MARKER)).toBe(true);
    expect(identities.loadIdentities({ entries: all, production: false })).toHaveLength(2);
    expect(identities.loadIdentities({ entries: all, production: true })).toHaveLength(0);
    // and the marker cannot be passed off as a reviewer's name
    expect(review.applyReview({ entries: batch().slice(0, 2), reviewer: 'PREVIEW ONLY (not a review)', date: '2026-10-20' }).ok).toBe(false);
  });

  it('marks the open-licence entries reviewed, sorts them into their files, and the registry then serves them', async () => {
    await loadReview();
    const r = review.applyReview({ entries: batch().slice(0, 2), reviewer: 'A. Reviewer', date: '2026-10-20' });
    expect(r.problems).toEqual([]);
    expect(r.files['os-greenspace']).toHaveLength(1);
    expect(r.files.wikidata).toHaveLength(1);
    expect(r.files.osm).toHaveLength(0);
    const served = identities.loadIdentities({ entries: [...r.files['os-greenspace'], ...r.files.wikidata] });
    expect(served).toHaveLength(2);
    expect(served[0].reviewedBy).toBe('A. Reviewer');
  });

  it('keeps OpenStreetMap entries out until the ODbL steps are declared done', async () => {
    await loadReview();
    const held = review.applyReview({ entries: batch(), reviewer: 'A. Reviewer', date: '2026-10-20' });
    expect(held.ok).toBe(false);
    expect(held.problems.join(' ')).toMatch(/--odbl-cleared/);
    const cleared = review.applyReview({ entries: batch(), reviewer: 'A. Reviewer', date: '2026-10-20', odblCleared: true });
    expect(cleared.problems).toEqual([]);
    expect(cleared.files.osm).toHaveLength(1);
  });

  it('refuses a batch with one bad entry, whole, and names it', async () => {
    await loadReview();
    const bad = unreviewed({ ...osEntry(), identity: { ...osEntry().identity, licence: 'ODbL-1.0' } });
    const r = review.applyReview({ entries: [unreviewed(wdEntry()), bad], reviewer: 'A. Reviewer', date: '2026-10-20' });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/fp-os-.*not one os-greenspace can carry/);
  });

  it('keeps the neutral id of every entry, and leaves out what the reviewer dropped', async () => {
    await loadReview();
    const neutral = unreviewed(osEntry());
    const r = review.applyReview({ entries: [neutral, unreviewed(wdEntry())], drop: ['fp-wd-q1234'], reviewer: 'A. Reviewer', date: '2026-10-20' });
    expect(r.files['os-greenspace'].map((e: { familypilotId: string }) => e.familypilotId)).toEqual([osEntry().familypilotId]);
    expect(r.files.wikidata).toHaveLength(0);
    expect(JSON.stringify(r)).not.toMatch(/fp-google|ChIJ/);
  });

  it('refuses an entry already in the registry file, or twice in one batch', async () => {
    await loadReview();
    const e = unreviewed(osEntry());
    expect(review.applyReview({ entries: [e, e], reviewer: 'A. Reviewer', date: '2026-10-20' }).problems.join(' ')).toMatch(/twice/);
    const have = { ...osEntry(), reviewedBy: 'someone', reviewedAt: '2026-10-01' };
    expect(review.applyReview({ entries: [e], reviewer: 'A. Reviewer', date: '2026-10-20', existing: { 'os-greenspace': [have] } }).problems.join(' ')).toMatch(/already in/);
  });
});

