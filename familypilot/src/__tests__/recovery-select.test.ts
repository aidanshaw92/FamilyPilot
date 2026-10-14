import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The recovery-batch selector (scripts/select-recovery-batches.mjs and scripts/lib/recovery-select.mjs). Fixtures are synthetic: no real venue, no
 * Google content. What these pin down is the behaviour the review depends on: evidence decides, nothing is padded, nothing is hidden by a cap the
 * report does not state, and no Google place id, name or position reaches a file that goes in the repository.
 */
const root = join(__dirname, '../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lib: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cli: any;
async function load() {
  lib ??= await import(join(root, 'scripts/lib/recovery-select.mjs'));
  cli ??= await import(join(root, 'scripts/select-recovery-batches.mjs'));
}

const BATCH = {
  source: 'OpenStreetMap, Greater London extract (Geofabrik)',
  version: '2026-10-14',
  licence: 'ODbL-1.0',
  licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
};

function candidate(over: Record<string, unknown> = {}) {
  const n = String(over.n ?? 1);
  return {
    familypilot_place_id: `fp-osm-way-${n}`,
    source_record_id: `way/${n}@v3`,
    name: `Test Park ${n}`,
    group_id: 'parks',
    subtype: 'park',
    lat: 51.5,
    lng: -0.1,
    website: null,
    source_tags: {},
    operating_status: 'unknown',
    area_ha: null,
    playground_inside: null,
    wikidata_id: null,
    has_wikipedia: false,
    ...over,
  };
}

describe('scoring a new place', () => {
  it('counts a venue’s own website as independent only when the page was fetched and names the venue', async () => {
    await load();
    const c = candidate({ group_id: 'play', subtype: 'indoor_play', website: 'https://example.org/' });
    const none = { wikidata: null, os: null };
    const unchecked = lib.scoreNew(c, none, null);
    expect(unchecked.independent).toBe(false);
    expect(unchecked.score).toBe(1);

    const silent = lib.scoreNew(c, none, { ok: false, namesVenue: false });
    expect(silent.independent).toBe(false);

    const wrongPage = lib.scoreNew(c, none, { ok: true, namesVenue: false });
    expect(wrongPage.independent).toBe(false);

    const named = lib.scoreNew(c, none, { ok: true, namesVenue: true });
    expect(named.independent).toBe(true);
    expect(named.score).toBe(2.5);
    expect(named.secondSource).toBe(false);
  });

  it('treats a Wikidata item or an OS Greenspace polygon as a second source', async () => {
    await load();
    const c = candidate({ website: null });
    expect(lib.scoreNew(c, { wikidata: { q: 'Q1', how: 'exact' }, os: null }).secondSource).toBe(true);
    expect(lib.scoreNew(c, { wikidata: null, os: { function: 'Public Park Or Garden' } }).secondSource).toBe(true);
  });
});

describe('choosing the second batch', () => {
  const row = (name: string, category: string, area: string, score: number, independent = true) => ({ c: { name }, category, area, score, independent, signals: [], corr: {} });

  it('stops when the evidence runs out instead of padding to the target', async () => {
    await load();
    const scored = [row('A', 'park', 'east', 3), row('B', 'park', 'west', 3), row('C', 'park', 'east', 1), row('D', 'park', 'north', 5, false)];
    const { picked, eligible } = lib.selectBatch2(scored, { target: 50 });
    expect(eligible).toBe(2);
    expect(picked.map((p: { c: { name: string } }) => p.c.name).sort()).toEqual(['A', 'B']);
  });

  it('holds a category to its ceiling so one kind of place cannot fill the batch', async () => {
    await load();
    const parks = Array.from({ length: 40 }, (_, i) => row(`P${i}`, 'park', 'east', 4));
    const farms = Array.from({ length: 4 }, (_, i) => row(`F${i}`, 'farm', 'east', 3));
    const { picked } = lib.selectBatch2([...parks, ...farms], { target: 20 });
    const byCat = picked.reduce((m: Record<string, number>, p: { category: string }) => ({ ...m, [p.category]: (m[p.category] ?? 0) + 1 }), {});
    expect(byCat.park).toBeLessThanOrEqual(Math.round(lib.DEFAULT_BUDGET.park * 20));
    expect(byCat.farm).toBe(1); // 7% of 20 rounds to 1: a ceiling, and the other farms wait in the reserve
  });

  it('takes the areas in turn, so a thin outer area is not crowded out by a rich centre', async () => {
    await load();
    const central = Array.from({ length: 30 }, (_, i) => row(`C${i}`, 'museum', 'central', 6));
    const east = [row('E1', 'museum', 'east', 3), row('E2', 'museum', 'east', 3)];
    const { picked } = lib.selectBatch2([...central, ...east], { target: 8, budget: { museum: 1 } });
    expect(picked.filter((p: { area: string }) => p.area === 'east').length).toBe(2);
  });

  it('is deterministic', async () => {
    await load();
    const scored = Array.from({ length: 30 }, (_, i) => row(`N${i}`, i % 2 ? 'park' : 'museum', ['east', 'west', 'north', 'south'][i % 4], 3 + (i % 3)));
    const a = lib.selectBatch2(scored, { target: 12 }).picked.map((p: { c: { name: string } }) => p.c.name);
    const b = lib.selectBatch2([...scored].reverse(), { target: 12 }).picked.map((p: { c: { name: string } }) => p.c.name);
    expect(a).toEqual(b);
  });
});

describe('continuing a venue we already hold', () => {
  const stored = [
    { id: 'fp-google-S1', name: 'Test Park 1', category: 'park', lat: 51.5, lng: -0.1 },
    { id: 'fp-google-S2', name: 'Elsewhere Museum', category: 'museum', lat: 51.6, lng: -0.2 },
  ];
  const link = (open: string, google: string, conf: number, needs = false) => ({ open_data_place: open, google_place: google, match_method: 'name_and_distance', match_confidence: conf, needs_review: needs, km: 0.01 });

  it('gives each stored venue to its best link and holds the alternatives for comparison', async () => {
    await load();
    const candidates = [candidate({ n: 1 }), candidate({ n: 2, name: 'Test Park 1 Playground', lat: 51.5004 })];
    const links = [link('fp-osm-way-1', 'fp-google-S1', 1), link('fp-osm-way-2', 'fp-google-S1', 0.95)];
    const { rows, unmatched } = lib.continuityRows({ candidates, links, stored });
    const confident = rows.filter((r: { confident: boolean }) => r.confident);
    expect(confident).toHaveLength(1);
    expect(confident[0].candidate.familypilot_place_id).toBe('fp-osm-way-1');
    expect(rows.filter((r: { confident: boolean }) => !r.confident)).toHaveLength(1);
    expect(unmatched.map((u: { id: string }) => u.id)).toEqual(['fp-google-S2']);
  });

  it('flags a match whose positions are far apart or whose category disagrees, and still reports it', async () => {
    await load();
    const far = candidate({ n: 1, lat: 51.51 });
    const { rows } = lib.continuityRows({ candidates: [far], links: [link('fp-osm-way-1', 'fp-google-S1', 1)], stored });
    expect(rows[0].confident).toBe(true);
    expect(rows[0].flags.join(' ')).toMatch(/positions \d+ m apart/);

    const museum = candidate({ n: 1, group_id: 'museums', subtype: 'museum' });
    const { rows: rows2 } = lib.continuityRows({ candidates: [museum], links: [link('fp-osm-way-1', 'fp-google-S1', 1)], stored });
    expect(rows2[0].flags.join(' ')).toMatch(/category differs/);
  });

  it('does not make a link the matcher is unsure about a confident one', async () => {
    await load();
    const { rows, unmatched } = lib.continuityRows({ candidates: [candidate({ n: 1 })], links: [link('fp-osm-way-1', 'fp-google-S1', 0.9, true)], stored });
    expect(rows[0].confident).toBe(false);
    expect(unmatched.map((u: { id: string }) => u.id).sort()).toEqual(['fp-google-S1', 'fp-google-S2']);
  });
});

describe('what reaches the repository', () => {
  function run() {
    const candidates = [
      candidate({ n: 1, name: 'Test Park 1' }),
      candidate({ n: 5, name: 'Wetland Walk', lat: 51.44, lng: -0.3, has_wikipedia: true, wikidata_id: 'Q9', area_ha: 12, playground_inside: true, website: 'https://example.org/wetland' }),
      candidate({ n: 6, name: 'Nearby Duplicate', lat: 51.6001, lng: -0.2001, has_wikipedia: true, wikidata_id: 'Q10', area_ha: 12, playground_inside: true, website: 'https://example.org/dupe' }),
    ];
    const stored = [
      { id: 'fp-google-ChIJsecret1', name: 'Stored Google Name', category: 'park', lat: 51.5, lng: -0.1 },
      { id: 'fp-google-ChIJsecret2', name: 'Another Stored Venue', category: 'museum', lat: 51.6, lng: -0.2 },
    ];
    const links = [{ open_data_place: 'fp-osm-way-1', google_place: 'fp-google-ChIJsecret1', match_method: 'name_and_distance', match_confidence: 1, needs_review: false, km: 0.01 }];
    const r = cli.buildBatches({ candidates, links, batch: BATCH, stored, wikidata: [], greenspace: [], siteChecks: {}, target: 10, seed: 7 });
    const out = mkdtempSync(join(tmpdir(), 'rb-pub-'));
    const priv = mkdtempSync(join(tmpdir(), 'rb-priv-'));
    cli.writeOutputs(out, r, { version: BATCH.version, privateOut: priv });
    return { r, out, priv };
  }
  const readAll = (dir: string) => readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

  it('keeps Google place ids, stored names and the cross-reference out of every public file', async () => {
    await load();
    const { out, priv } = run();
    try {
      const pub = readAll(out);
      expect(pub).toMatch(/Test Park 1/); // the public files are not empty, so the absence below means something
      expect(pub).not.toMatch(/fp-google|ChIJ|Stored Google Name|Another Stored Venue/);
      const privateText = readAll(priv);
      expect(privateText).toMatch(/fp-google-ChIJsecret1/);
      expect(privateText).toMatch(/Stored Google Name/);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(priv, { recursive: true, force: true });
    }
  });

  it('keys a continuing entry by its open-data id and marks every entry unreviewed', async () => {
    await load();
    const { out, priv } = run();
    try {
      const b1 = JSON.parse(readFileSync(join(out, 'batch1.entries.UNREVIEWED.json'), 'utf8'));
      const b2 = JSON.parse(readFileSync(join(out, 'batch2.entries.UNREVIEWED.json'), 'utf8'));
      expect(b1.map((e: { familypilotId: string }) => e.familypilotId)).toEqual(['fp-osm-way-1']);
      for (const e of [...b1, ...b2]) expect(e.reviewedBy).toMatch(/^UNREVIEWED/);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(priv, { recursive: true, force: true });
    }
  });

  it('says a possible duplicate of a held place without naming it', async () => {
    await load();
    const { r, out, priv } = run();
    try {
      const flagged = r.picked.filter((p: { flags?: string[] }) => p.flags?.some((f) => /possible duplicate/.test(f)));
      expect(flagged.length).toBeGreaterThan(0);
      expect(readFileSync(join(out, 'SUMMARY.md'), 'utf8')).toMatch(/possible duplicate/);
      expect(readFileSync(join(priv, 'PRIVATE-possible-duplicates.csv'), 'utf8')).toMatch(/fp-google-ChIJsecret2/);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(priv, { recursive: true, force: true });
    }
  });
});
