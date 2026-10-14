import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as osmClassifyModule from '../../../scripts/open-data/lib/osm-classify.mjs';
import * as geoModule from '../../../scripts/open-data/lib/geo.mjs';
import * as dryRunModule from '../../../scripts/open-data/dry-run.mjs';
import * as reviewModule from '../../../scripts/open-data/lib/review.mjs';

// The pipeline is plain JavaScript outside the app; the tests treat its results as loose data.
/* eslint-disable @typescript-eslint/no-explicit-any */
const { classifyOsm, factsFromTags, websiteFromTags } = osmClassifyModule as any;
const { areaOf, pointInGeometry, representativePoint } = geoModule as any;
const { normaliseFeatures, renderReport, runDryRun } = dryRunModule as any;
const { osmBatch, renderReview, reviewRecord, reviewSample } = reviewModule as any;

const fixtures = join(__dirname, '../../../scripts/open-data/fixtures');
const extract = JSON.parse(readFileSync(join(fixtures, 'synthetic-extract.geojson'), 'utf8'));
const stored = JSON.parse(readFileSync(join(fixtures, 'synthetic-stored.json'), 'utf8'));

/**
 * The open-data dry run reads a LOCAL file and decides, with the quality gates, what could become a candidate. These tests use a
 * synthetic extract (every place is named "Fixture ...") because no real extract can be read yet. They pin the gates, not the supply.
 */
describe('classification: a group comes only from a classifying tag', () => {
  it('classifies the family destinations', () => {
    expect(classifyOsm({ name: 'X', tourism: 'zoo', zoo: 'petting_zoo' })).toMatchObject({ ok: true, group: 'animals', subtype: 'petting_zoo' });
    expect(classifyOsm({ name: 'X', tourism: 'museum' })).toMatchObject({ ok: true, group: 'museums', subtype: 'museum' });
    expect(classifyOsm({ name: 'X', leisure: 'trampoline_park' })).toMatchObject({ ok: true, group: 'play', subtype: 'trampoline_park' });
    expect(classifyOsm({ name: 'X', leisure: 'park' })).toMatchObject({ ok: true, group: 'parks', subtype: 'park' });
  });

  it('an outdoor playground is a playground, an indoor one is indoor play and not soft play', () => {
    expect(classifyOsm({ name: 'X', leisure: 'playground' })).toMatchObject({ group: 'parks', subtype: 'playground' });
    expect(classifyOsm({ name: 'X', leisure: 'playground', indoor: 'yes' })).toMatchObject({ group: 'play', subtype: 'indoor_play' });
  });

  it('a name alone never classifies a place', () => {
    const r = classifyOsm({ name: 'Soft Play Supplies', shop: 'toys' });
    expect(r.ok).toBe(false);
    expect(r.gate).toBe('classification');
  });

  it('a feature with no name is rejected at the identity gate', () => {
    expect(classifyOsm({ leisure: 'park' })).toMatchObject({ ok: false, gate: 'identity' });
    expect(classifyOsm({ leisure: 'park', name: '   ' })).toMatchObject({ ok: false, gate: 'identity' });
  });

  it.each([
    [{ 'disused:leisure': 'playground' }, 'disused:leisure=playground'],
    [{ 'abandoned:tourism': 'museum' }, 'abandoned:tourism=museum'],
    [{ 'was:leisure': 'park' }, 'was:leisure=park'],
    [{ disused: 'yes' }, 'disused=yes'],
    [{ access: 'private' }, 'access=private'],
    [{ opening_hours: 'off' }, 'opening_hours=off'],
  ])('rejects a place mapped as gone or not public: %j', (extra, tag) => {
    const r = classifyOsm({ name: 'X', leisure: 'park', ...extra });
    expect(r).toMatchObject({ ok: false, gate: 'operating_status' });
    expect(r.reason).toContain(tag);
  });

  it('operating status is unknown unless the source says otherwise', () => {
    expect(classifyOsm({ name: 'X', leisure: 'park', opening_hours: 'Mo-Su 08:00-20:00' }).status).toEqual({ value: 'unknown', evidence: null });
  });
});

describe('facts: only what the source states; absent is unknown, never no', () => {
  it('copies stated facts', () => {
    expect(factsFromTags({ wheelchair: 'yes', toilets: 'no', changing_table: 'yes', fee: 'no', min_age: '2', max_age: '8', opening_hours: 'Tu-Su 10:00-16:00' }))
      .toEqual({ stepFree: 'yes', toilets: 'no', babyChanging: 'yes', fee: 'no', minAge: 2, maxAge: 8, openingHoursText: 'Tu-Su 10:00-16:00' });
  });

  it('an absent tag states nothing', () => {
    expect(factsFromTags({})).toEqual({});
  });

  it('an empty or unrecognised value states nothing', () => {
    expect(factsFromTags({ wheelchair: 'unknown', toilets: '', min_age: '', max_age: 'adults' })).toEqual({});
  });

  it('keeps the website and never a phone or an email', () => {
    expect(websiteFromTags({ website: 'https://example.invalid/a', phone: '+44 1', 'contact:email': 'a@b.invalid' })).toBe('https://example.invalid/a');
    expect(websiteFromTags({ 'contact:website': 'https://example.invalid/b' })).toBe('https://example.invalid/b');
    expect(websiteFromTags({ website: 'javascript:alert(1)' })).toBeNull();
    expect(websiteFromTags({ phone: '+44 1' })).toBeNull();
  });
});

describe('geometry', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
  const donut = { type: 'Polygon', coordinates: [square.coordinates[0], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };

  it('a point is inside a polygon, and not inside its hole', () => {
    expect(pointInGeometry(2, 2, square)).toBe(true);
    expect(pointInGeometry(20, 20, square)).toBe(false);
    expect(pointInGeometry(5, 5, donut)).toBe(false);
    expect(pointInGeometry(1, 1, donut)).toBe(true);
  });

  it('the representative point of a polygon with a hole at its centre is still inside it', () => {
    const p = representativePoint(donut);
    expect(pointInGeometry(p.lat, p.lng, donut)).toBe(true);
  });

  it('measures the areas the plan measures by', () => {
    expect(areaOf(51.5074, -0.1278)).toBe('central');
    expect(areaOf(51.65, -0.2)).toBe('north');
    expect(areaOf(51.45, 0.12)).toBe('east');
    expect(areaOf(51.33, -0.1)).toBe('south');
    expect(areaOf(51.5, -0.45)).toBe('west');
    expect(areaOf(52.5, -0.1)).toBe('beyond 25 km');
  });
});

describe('the dry run over the synthetic extract', () => {
  const result: any = runDryRun({ features: normaliseFeatures(extract), stored, version: '2026-10-14' });
  const byName = (name: string) => result.candidates.find((c: { name: string }) => c.name === name);
  const rejection = (needle: string) => result.rejected.find((r: { name: string; reason: string }) => r.name === needle || r.reason.includes(needle));

  it('accepts the genuine candidates and says why it rejected the rest', () => {
    for (const name of ['Fixture Common', 'Fixture Green', 'Fixture Swings', 'Fixture City Farm', 'Fixture Museum of Things', 'Fixture Jump Park', 'Fixture Little Ones Play', 'Fixture Aquarium']) {
      expect(byName(name), name).toBeTruthy();
    }
    expect(rejection('Fixture Old Playground')?.gate).toBe('operating_status');
    expect(rejection('Fixture Private Gardens')?.gate).toBe('operating_status');
    expect(rejection('Fixture Soft Play Supplies')?.gate).toBe('classification');
    expect(rejection('Fixture Paris Park')?.gate).toBe('location');
    expect(result.rejected.filter((r: { gate: string }) => r.gate === 'identity').length).toBeGreaterThanOrEqual(2);
  });

  it('every candidate carries its source record, its batch version and no Google value', () => {
    for (const c of result.candidates) {
      expect(c.familypilot_place_id).toMatch(/^fp-osm-(node|way|relation)-\d+$/);
      expect(c.source_record_id).toMatch(/^(node|way|relation)\/\d+@v/);
      expect(c.identity_checked_at).toBe('2026-10-14');
      expect(c.operating_status).toBe('unknown');
      // What would be written: the row without the working fields (the link to a stored place is written to its own file).
      const written = Object.fromEntries(Object.entries(c).filter(([key]) => !key.startsWith('_')));
      expect(JSON.stringify(written)).not.toMatch(/google/i);
    }
  });

  it('never keeps a phone or an email', () => {
    const farm = byName('Fixture City Farm');
    expect(JSON.stringify(farm)).not.toMatch(/\+44|[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(farm.website).toBe('https://example.invalid/farm');
  });

  it('keeps only the tags that decided the group or stated a fact, verbatim', () => {
    expect(byName('Fixture Swings').source_tags).toEqual({ leisure: 'playground', wheelchair: 'yes', toilets: 'no', min_age: '2', max_age: '8' });
  });

  it('unknown stays unknown', () => {
    expect(byName('Fixture Green')._facts).toEqual({});
    expect(byName('Fixture Aquarium')._facts).toEqual({});
    expect(byName('Fixture Swings')._facts).toMatchObject({ stepFree: 'yes', minAge: 2, maxAge: 8, toilets: 'no' });
  });

  it('indoor play is not called soft play, and a trampoline park is a trampoline park', () => {
    expect(byName('Fixture Little Ones Play')).toMatchObject({ group_id: 'play', subtype: 'indoor_play' });
    expect(byName('Fixture Jump Park')).toMatchObject({ group_id: 'play', subtype: 'trampoline_park' });
  });

  it('a park gains "a playground lies inside it" only from a playground inside its polygon, and a hole does not count', () => {
    expect(byName('Fixture Common')._playgroundInside).toBe(true);
    expect(byName('Fixture Green')._playgroundInside).toBe(false);
    expect(byName('Fixture Donut Park')._playgroundInside).toBe(false);
  });

  it('a duplicate inside the batch keeps one, and a duplicate of a stored place becomes a link, not a second listing', () => {
    const museums = result.candidates.filter((c: { name: string }) => c.name === 'Fixture Museum of Things');
    expect(museums).toHaveLength(1);
    expect(rejection('duplicate within the batch')).toBeTruthy();
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({ google_place: 'fp-google-FIXTURE1', match_method: 'name_and_distance' });
    expect(result.links[0].match_confidence).toBeGreaterThan(0.45);
    expect(result.stats.linked).toBe(1);
    expect(result.stats.new).toBe(result.stats.total - 1);
  });

  it('the report counts new places against the goals and says what is unknown', () => {
    const report = renderReport(result, { version: '2026-10-14', source: 'synthetic-extract.geojson' });
    expect(report).toContain('**Nothing was imported.**');
    expect(report).toContain('Against the goals');
    expect(report).toContain('not confirmed');
    expect(report).toContain('Family facts the source itself states');
  });

  it('the ten-row sample covers different outcomes', () => {
    expect(result.stats.sample.length).toBeLessThanOrEqual(10);
    const labels = result.stats.sample.map((s: { label: string }) => s.label);
    expect(labels).toContain('linked to a stored place');
    expect(labels).toContain('park with a mapped playground inside');
  });

  it('makes no network call and opens no database: the module imports are local only', () => {
    const source = readFileSync(join(__dirname, '../../../scripts/open-data/dry-run.mjs'), 'utf8') + readFileSync(join(__dirname, '../../../scripts/open-data/lib/osm-classify.mjs'), 'utf8');
    expect(source).not.toMatch(/fetch\(|https?\.request|require\('(https?|net)'\)|from 'node:(https?|net)'|supabase|googleapis|XMLHttpRequest/);
  });
});


/**
 * The first ten records a person reads: source and licence, the source's own category and ours, identity and duplicate checks,
 * independent coordinates, the facilities the SOURCE states, and what is unknown. Reshaped from decisions already made; nothing added.
 */
describe('the first-ten review', () => {
  const result = runDryRun({ features: normaliseFeatures(extract), stored, version: '2026-10-14' });
  const batch = osmBatch({ version: '2026-10-14', input: 'london-family.geojson' });
  const reviews = reviewSample(result.stats.sample, batch, { links: result.links, stored });

  it('records the batch once: source, version, licence and its text, and the credit', () => {
    expect(batch).toMatchObject({ licence: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', version: '2026-10-14' });
    expect(batch.licenceUrl).toMatch(/^https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0/);
    expect(batch.attributionUrl).toBe('https://www.openstreetmap.org/copyright');
  });

  it('every record answers each question of the review, and is at most ten', () => {
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.length).toBeLessThanOrEqual(10);
    for (const r of reviews) {
      expect(r.source).toMatchObject({ licence: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', version: '2026-10-14' });
      expect(r.source.record).toMatch(/^(node|way|relation)\/\d+@v/);
      expect(r.originalCategory.sourceTags).toBeTypeOf('object');
      expect(r.proposedCategory.group).toBeTypeOf('string');
      expect(r.identity).toMatchObject({ nameFromSource: true, duplicateInsideBatch: false });
      expect(r.independentCoordinates).toMatchObject({ geocoded: false, googleValueUsed: false });
      expect(Number.isFinite(r.independentCoordinates.lat) && Number.isFinite(r.independentCoordinates.lng)).toBe(true);
      expect(Array.isArray(r.unknownFields)).toBe(true);
      expect(r.unknownFields).toContain('operating status');
    }
  });

  it('a stored duplicate is named and flagged for a person; its category is ours and nothing else of the stored row is copied', () => {
    const linked = reviews.find((r: any) => r.identity.duplicateOfStoredPlace);
    expect(linked.identity).toMatchObject({ duplicateOfStoredPlace: 'fp-google-FIXTURE1', storedCategory: 'museum', needsPersonToReview: true });
    const text = JSON.stringify(reviews);
    expect(text).not.toContain('Maritime Museum Greenwich');
    expect(text).not.toMatch(/"phone"|"email"|"address"|"rating"|"photos"/);
  });

  it('facilities are listed only when the source states them, and everything else is unknown', () => {
    const withFacts = reviews.find((r: any) => Object.keys(r.confirmedFamilyFacilities).length > 0);
    expect(withFacts).toBeTruthy();
    for (const fact of Object.keys(withFacts.confirmedFamilyFacilities)) expect(withFacts.unknownFields).not.toContain(fact);
    const bare = reviews.find((r: any) => Object.keys(r.confirmedFamilyFacilities).length === 0);
    expect(bare.unknownFields).toEqual(expect.arrayContaining(['toilets', 'babyChanging', 'stepFree', 'openingHoursText']));
  });

  it('a record with no website lists the website as unknown', () => {
    const noSite = reviews.find((r: any) => r.website === null);
    expect(noSite.unknownFields).toContain('website');
  });

  it('reads as a page a person can scan', () => {
    const page = renderReview(reviews, batch);
    expect(page).toContain('**Nothing is imported.**');
    expect(page).toContain('© OpenStreetMap contributors');
    expect(page).toMatch(/Position \(from the source, not geocoded\)/);
  });

  it('works for a row given with the working fields beside it, as the written sample has them', () => {
    const entry = result.stats.sample[0];
    const beside = reviewRecord({ label: entry.label, row: entry.row, derivedFacts: entry.row._facts, linkedTo: entry.row._linked }, batch, { links: result.links, stored });
    expect(beside).toEqual(reviewRecord(entry, batch, { links: result.links, stored }));
  });

  it('the report states the expected import count and how many reviewed batches it is', () => {
    const report = renderReport(result, { version: '2026-10-14', source: 'x' });
    expect(report).toMatch(/Expected import if approved\*\* \(new places, in reviewed batches of at most 100\) \| \*\*9\*\* \(1 batch\)/);
  });
});
