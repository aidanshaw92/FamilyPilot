import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canPlotOnOwnMap } from '@/src/utils/map-compliance';

const require_ = createRequire(import.meta.url);
const root = join(__dirname, '../../..');
const cataloguePath = join(root, 'server/places/lib/catalogue.js');
const betweenPath = join(root, 'server/places/lib/between.js');
const identitiesPath = join(root, 'server/places/lib/independent-identities.js');
const detailPath = join(root, 'api/places/detail.js');

const NOW = Date.parse('2026-11-10T12:00:00Z');
const day = 86400000;

function entry(over: Record<string, unknown> = {}) {
  return {
    familypilotId: 'fp-google-A',
    name: 'Hackney City Farm',
    category: 'farm',
    identity: { source: 'osm', url: 'https://www.openstreetmap.org/way/123', retrievedAt: '2026-11-01', licence: 'ODbL-1.0', externalId: 'way/123' },
    location: { latitude: 51.532, longitude: -0.067, source: 'osm', licence: 'ODbL-1.0' },
    website: 'https://www.hackneycityfarm.co.uk/',
    reviewedBy: 'aidan',
    reviewedAt: '2026-11-02',
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    familypilot_place_id: 'fp-google-A', external_id: 'google:A', provider: 'google', name: 'Hackney City Farm', category: 'farm',
    lat: 51.532, lng: -0.067, address: '1a Goldsmiths Row', description: 'Google summary', opening_hours: null, website: 'https://example.org',
    phone: '0207', photos: ['/api/places/photo?id=A&index=0'], is_open: true, fetched_at: new Date(NOW - 2 * day).toISOString(),
    field_provenance: { googlePrimaryType: 'farm', googleTypes: ['farm'] }, ...over,
  };
}

// The reader asks for rows newer than a cut-off; this honours that (and the other filters it uses), as the database does.
import { standInClient } from '../../../scripts/lib/catalogue-expiry.mjs';
const fakeClient = (rows: unknown[]) => standInClient(rows as never[]);

describe('the independent list: what an entry may be', () => {
  const { problemWith, loadIdentities } = require_(identitiesPath);

  it('a complete OpenStreetMap entry is valid', () => {
    expect(problemWith(entry())).toBeNull();
  });

  it('is closed: Google-shaped or extra content is refused, not ignored', () => {
    for (const key of ['address', 'description', 'openingHours', 'phone', 'photos', 'rating', 'googleTypes', 'isOpen', 'summary']) {
      expect(problemWith({ ...entry(), [key]: 'x' }), key).toMatch(/unknown key/);
    }
    expect(problemWith(entry({ identity: { ...entry().identity, extra: 1 } }))).toMatch(/identity has an unknown key/);
    expect(problemWith(entry({ location: { ...entry().location, address: 'x' } }))).toMatch(/location has an unknown key/);
  });

  it('never carries a Google address, in the website or in the source', () => {
    for (const url of ['https://maps.google.com/?cid=1', 'https://www.google.com/maps/place/x', 'https://goo.gl/maps/abc', 'https://maps.app.goo.gl/x', 'https://lh3.googleusercontent.com/p/x', 'https://places.googleapis.com/v1/x']) {
      expect(problemWith(entry({ website: url })), url).toMatch(/not Google/);
      expect(problemWith(entry({ identity: { ...entry().identity, url } })), url).toMatch(/not Google/);
    }
    expect(problemWith(entry({ website: 'http://insecure.example.org' }))).toMatch(/https/);
  });

  it('a source can carry only its own licence', () => {
    expect(problemWith(entry({ identity: { ...entry().identity, licence: 'CC0-1.0' } }))).toMatch(/not one osm can carry/);
    expect(problemWith(entry({ identity: { source: 'official-site', url: 'https://www.hackneycityfarm.co.uk/about', retrievedAt: '2026-11-01', licence: 'ODbL-1.0' } }))).toMatch(/not one official-site can carry/);
    expect(problemWith(entry({ identity: { ...entry().identity, source: 'google' } }))).toMatch(/identity.source/);
    expect(problemWith(entry({ identity: { ...entry().identity, source: 'toString' } }))).toMatch(/identity.source/);
  });

  it('a position can come only from a source the app can credit on its map', () => {
    expect(problemWith(entry({ location: { ...entry().location, source: 'os-open-greenspace', licence: 'OGL-3.0' } }))).toMatch(/location.source/);
    expect(problemWith(entry({ location: { ...entry().location, source: 'google', licence: 'google' } }))).toMatch(/location.source/);
    expect(problemWith(entry({ location: { ...entry().location, licence: 'CC0-1.0' } }))).toMatch(/location.licence/);
  });

  it('a position must be a number inside Greater London', () => {
    expect(problemWith(entry({ location: { ...entry().location, latitude: '51.5' } }))).toMatch(/latitude and longitude/);
    expect(problemWith(entry({ location: { ...entry().location, latitude: 40.7, longitude: -74 } }))).toMatch(/outside Greater London/);
  });

  it('every entry names who reviewed it and when', () => {
    expect(problemWith(entry({ reviewedBy: '' }))).toMatch(/reviewer/);
    expect(problemWith({ ...entry(), reviewedAt: undefined })).toMatch(/reviewer/);
    expect(problemWith(entry({ reviewedAt: 'last week' }))).toMatch(/reviewer/);
  });

  it('a name, an fp- id and a served category are required', () => {
    expect(problemWith(entry({ name: ' ' }))).toMatch(/name/);
    expect(problemWith(entry({ familypilotId: 'google-A' }))).toMatch(/fp- id/);
    expect(problemWith(entry({ category: 'restaurant' }))).toMatch(/category/);
  });

  it('a bad entry is dropped and reported, never served; the first of a duplicate id wins', () => {
    const problems: Array<[string, string]> = [];
    const kept = loadIdentities({
      entries: [entry(), entry({ familypilotId: 'fp-google-B', phone: '0207' }), entry({ name: 'Second' }), entry({ familypilotId: 'fp-google-C' })],
      onProblem: (id: string, why: string) => problems.push([id, why]),
    });
    expect(kept.map((e: { familypilotId: string }) => e.familypilotId)).toEqual(['fp-google-A', 'fp-google-C']);
    expect(problems.map(([id]) => id)).toEqual(['fp-google-B', 'fp-google-A']);
    expect(kept[0].name).toBe('Hackney City Farm');
  });

  it('the files that ship validate, and ship empty until a reviewed set is approved', () => {
    for (const file of ['osm', 'official-site', 'wikidata']) {
      const shipped = JSON.parse(readFileSync(join(root, `server/places/data/identities/${file}.json`), 'utf8'));
      const problems: string[] = [];
      const kept = loadIdentities({ entries: shipped.entries, onProblem: (id: string, why: string) => problems.push(`${id}: ${why}`) });
      expect(problems, file).toEqual([]);
      expect(kept, file).toHaveLength(shipped.entries.length);
      expect(shipped.entries, file).toEqual([]);
      expect(shipped.source).toBe(file);
    }
  });
});

describe('OpenStreetMap content is in its own file, and only there', () => {
  const { fileProblem } = require_(identitiesPath);
  const official = entry({ location: null, identity: { source: 'official-site', url: 'https://www.hackneycityfarm.co.uk/about', retrievedAt: '2026-11-01', licence: 'venue-website' } });
  const wikidata = entry({ location: null, identity: { source: 'wikidata', url: 'https://www.wikidata.org/wiki/Q1', retrievedAt: '2026-11-01', licence: 'CC0-1.0' } });

  it('an entry with an OpenStreetMap name or position is accepted in osm.json', () => {
    expect(fileProblem('osm', entry())).toBeNull();
    // A name from the venue's own site with a position from OpenStreetMap is OpenStreetMap content too (its position).
    expect(fileProblem('osm', entry({ identity: { ...official.identity } }))).toBeNull();
  });

  it('an entry with nothing from OpenStreetMap is refused in osm.json', () => {
    expect(fileProblem('osm', official)).toMatch(/only entries whose identity or position is from OpenStreetMap/);
  });

  it('OpenStreetMap content is refused in every other file', () => {
    expect(fileProblem('official-site', entry())).toMatch(/belongs in osm.json/);
    expect(fileProblem('wikidata', entry({ identity: { ...wikidata.identity } }))).toMatch(/belongs in osm.json/);
  });

  it('each other file holds only its own source', () => {
    expect(fileProblem('official-site', official)).toBeNull();
    expect(fileProblem('wikidata', wikidata)).toBeNull();
    expect(fileProblem('wikidata', official)).toMatch(/holds only identity.source wikidata/);
    expect(fileProblem('official-site', wikidata)).toMatch(/holds only identity.source official-site/);
  });
});

describe('what an independent entry becomes', () => {
  const { identityToPlace } = require_(identitiesPath);

  it('is only what the entry holds: no photo, hours, address, summary, phone or Google type', () => {
    const place = identityToPlace(entry());
    expect(place).toMatchObject({ familypilotId: 'fp-google-A', provider: 'osm', name: 'Hackney City Farm', category: 'farm', latitude: 51.532, longitude: -0.067, website: 'https://www.hackneycityfarm.co.uk/' });
    expect(place.photos).toEqual([]);
    for (const key of ['address', 'description', 'openingHours', 'phone', 'isOpen']) expect(place[key], key).toBeUndefined();
    expect(place.googleTypes).toEqual([]);
    expect(place.googlePrimaryType).toBeUndefined();
  });

  it('is an OpenStreetMap place only when its position is OpenStreetMap’s; without a position it is our own row and cannot be drawn', () => {
    const located = identityToPlace(entry());
    const unlocated = identityToPlace(entry({ location: null, identity: { source: 'official-site', url: 'https://www.hackneycityfarm.co.uk/about', retrievedAt: '2026-11-01', licence: 'venue-website' } }));
    expect(located.provider).toBe('osm');
    expect(canPlotOnOwnMap(located)).toBe(true);
    expect(unlocated.provider).toBe('familypilot');
    expect(unlocated.latitude).toBeUndefined();
    expect(canPlotOnOwnMap(unlocated)).toBe(false);
  });
});

describe('the catalogue with an independent list', () => {
  beforeEach(() => vi.resetModules());
  const fetchSpy = vi.fn();
  beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal('fetch', fetchSpy); });
  afterEach(() => vi.unstubAllGlobals());

  it('with an empty list it is exactly what was served before', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const rows = [row(), row({ familypilot_place_id: 'fp-google-B', external_id: 'google:B', name: 'B' })];
    const without = await readCatalogue({ client: fakeClient(rows), now: NOW, entries: [] });
    const shipped = await readCatalogue({ client: fakeClient(rows), now: NOW });
    expect(shipped).toEqual(without);
    expect(without.map((p: { provider: string }) => p.provider)).toEqual(['google', 'google']);
  });

  it('a fresh Google row always wins over an entry for the same venue', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const places = await readCatalogue({ client: fakeClient([row()]), now: NOW, entries: [entry({ name: 'From OSM' })] });
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ provider: 'google', name: 'Hackney City Farm' });
  });

  it('when the Google copy has aged out the venue stays, with only what is held independently', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const aged = row({ fetched_at: new Date(NOW - 45 * day).toISOString() });
    const places = await readCatalogue({ client: fakeClient([aged]), now: NOW, entries: [entry()] });
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ familypilotId: 'fp-google-A', provider: 'osm', name: 'Hackney City Farm', latitude: 51.532 });
    // Nothing of the expired Google row survives: not its address, its summary, its phone or its photos.
    const text = JSON.stringify(places[0]);
    expect(text).not.toMatch(/Goldsmiths|Google summary|0207|photo\?id=A/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a venue with no Google row at all can still be listed (an OpenStreetMap-only venue)', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const places = await readCatalogue({ client: fakeClient([]), now: NOW, entries: [entry({ familypilotId: 'fp-osm-way-123' })] });
    expect(places.map((p: { familypilotId: string }) => p.familypilotId)).toEqual(['fp-osm-way-123']);
  });

  it('an invalid entry never reaches a parent', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const places = await readCatalogue({ client: fakeClient([]), now: NOW, entries: [entry({ phone: '0207' }), entry({ familypilotId: 'fp-google-Z', website: 'https://maps.google.com/?cid=1' })] });
    expect(places).toEqual([]);
  });

  it('a venue without a position is listed without one; a located one outside the London scope is not', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const unlocated = entry({ familypilotId: 'fp-google-U', location: null, identity: { source: 'official-site', url: 'https://example.org/about', retrievedAt: '2026-11-01', licence: 'venue-website' } });
    const far = entry({ familypilotId: 'fp-google-F', location: { latitude: 51.88, longitude: 0.55, source: 'osm', licence: 'ODbL-1.0' } });
    const places = await readCatalogue({ client: fakeClient([]), now: NOW, entries: [unlocated, far] });
    expect(places.map((p: { familypilotId: string }) => p.familypilotId)).toEqual(['fp-google-U']);
  });

  it('still returns nothing when the database is unreachable (the list is an addition, not a database)', async () => {
    const { readCatalogue } = require_(cataloguePath);
    const broken = { from: () => { throw new Error('down'); } };
    expect(await readCatalogue({ client: broken, now: NOW, entries: [entry()] })).toEqual([]);
  });
});

describe('Meet halfway with an independent list', () => {
  const A = { latitude: 51.556, longitude: -0.178 };
  const B = { latitude: 51.545, longitude: -0.06 };

  it('offers a located independent venue between the families once its Google copy has aged out', async () => {
    const { readBetween } = require_(betweenPath);
    const aged = row({ fetched_at: new Date(NOW - 45 * day).toISOString() });
    const result = await readBetween({ a: A, b: B, client: fakeClient([aged]), now: NOW, entries: [entry()] });
    expect(result.available).toBe(true);
    expect(result.places.map((p: { familypilotId: string; provider: string }) => [p.familypilotId, p.provider])).toEqual([['fp-google-A', 'osm']]);
  });

  it('never offers one with no position of its own', async () => {
    const { readBetween } = require_(betweenPath);
    const unlocated = entry({ location: null, identity: { source: 'official-site', url: 'https://example.org/about', retrievedAt: '2026-11-01', licence: 'venue-website' } });
    const result = await readBetween({ a: A, b: B, client: fakeClient([]), now: NOW, entries: [unlocated] });
    expect(result.places).toEqual([]);
  });

  it('ignores an entry outside the corridor', async () => {
    const { readBetween } = require_(betweenPath);
    const far = entry({ location: { latitude: 51.4, longitude: 0.3, source: 'osm', licence: 'ODbL-1.0' } });
    const result = await readBetween({ a: A, b: B, client: fakeClient([]), now: NOW, entries: [far], maxKmA: 5, maxKmB: 5 });
    expect(result.places).toEqual([]);
  });
});

describe('the detail endpoint with an independent list', () => {
  const touched: string[] = [];
  const injected: string[] = [];
  const inject = (relative: string, exports: unknown) => {
    const resolved = require_.resolve(join(root, relative));
    injected.push(resolved);
    require_.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as never;
  };

  function res() {
    const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: null, headers: {} };
    const r = { setHeader: (k: string, v: string) => { out.headers[k] = v; }, status: (s: number) => { out.status = s; return r; }, json: (b: unknown) => { out.body = b; return r; } };
    return { r, out };
  }

  async function open(id: string, { stored, entries }: { stored: unknown; entries: unknown[] }) {
    touched.length = 0;
    process.env.PLACES_PROVIDER = 'google';
    class PlacesDisabledError extends Error { code = 'DISABLED'; scope = 'details'; detail = 'off'; }
    class PlacesBudgetExceededError extends Error { code = 'BUDGET'; scope = 'details'; detail = 'cap'; }
    inject('server/places/lib/google-places.js', { getGooglePlace: async () => { touched.push('google'); throw new PlacesDisabledError('off'); } });
    inject('server/places/lib/fallback.js', { MOCK_FALLBACK: [] });
    inject('server/places/lib/canonical-venues.js', { getCanonicalIdentity: async () => null, resolvePrimaryPlaceId: async (x: string) => x });
    inject('server/enrichment/_lib/enrichment-store.js', { getPlaceRecord: async () => stored });
    inject('server/places/lib/places-budget.js', {
      isPlacesEnabled: () => false, describeScope: () => 'off', primePlacesBudget: async () => {}, PlacesDisabledError, PlacesBudgetExceededError,
    });
    // The identity module reads its entries from the shipped file; the endpoint under test gets the entries given here.
    const real = require_(identitiesPath);
    inject('server/places/lib/independent-identities.js', { ...real, independentPlaceFor: (x: string) => real.independentPlaceFor(x, { entries }) });
    delete require_.cache[require_.resolve(detailPath)];
    const handler = require_(detailPath);
    const { r, out } = res();
    await handler({ method: 'GET', query: { id } }, r);
    return out;
  }

  afterEach(() => {
    for (const path of injected.splice(0)) delete require_.cache[path];
    delete require_.cache[require_.resolve(detailPath)];
    delete process.env.PLACES_PROVIDER;
  });

  const aged = { familypilotId: 'fp-google-A', provider: 'google', name: 'Hackney City Farm', address: 'Goldsmiths Row', fetchedAt: new Date(Date.now() - 45 * day).toISOString() };
  const fresh = { ...aged, fetchedAt: new Date(Date.now() - 1 * day).toISOString() };

  it('serves an aged-out venue from the independent entry, without asking Google for anything', async () => {
    const out = await open('fp-google-A', { stored: aged, entries: [entry()] });
    expect(out.status).toBe(200);
    expect(touched).toEqual([]);
    const body = out.body as { provider: string; cached: boolean; place: Record<string, unknown> };
    expect(body.provider).toBe('osm');
    expect(body.place).toMatchObject({ name: 'Hackney City Farm', provider: 'osm' });
    expect(JSON.stringify(body.place)).not.toMatch(/Goldsmiths/);
  });

  it('keeps serving a fresh Google copy as before', async () => {
    const out = await open('fp-google-A', { stored: fresh, entries: [entry()] });
    expect(out.status).toBe(200);
    expect((out.body as { provider: string }).provider).toBe('google');
    expect(touched).toEqual([]);
  });

  it('with no entry, an aged-out venue still fails visibly rather than serving an expired copy', async () => {
    const out = await open('fp-google-A', { stored: aged, entries: [] });
    expect(out.status).toBe(503);
    expect(touched).toEqual(['google']);
  });
});

describe('the simulation reads the real reader', () => {
  it('counts what the reader serves on each day, with and without the list', async () => {
    const { simulate, isPlottable } = await import('../../../scripts/lib/catalogue-expiry.mjs');
    const rows = [
      { id: 'fp-google-A', category: 'farm', lat: 51.532, lng: -0.067, fetched: '2026-10-09', provider: 'google' },
      { id: 'fp-google-B', category: 'park', lat: 51.54, lng: -0.14, fetched: '2026-10-20', provider: 'google' },
      { id: 'fp-google-C', category: 'museum', lat: 51.51, lng: -0.13, fetched: '2026-10-09', provider: 'google' },
    ];
    const results = await simulate({ rows, entries: [entry({ familypilotId: 'fp-google-A' })], dates: ['2026-10-14', '2026-11-08', '2026-11-25'] });
    expect(results.map((r: { googleOnly: number }) => r.googleOnly)).toEqual([3, 1, 0]);
    expect(results.map((r: { total: number }) => r.total)).toEqual([3, 2, 1]);
    expect(results[1]).toMatchObject({ independentAdded: 1, plottable: 1, listOnly: 1 });
    expect(results[2].byCategory).toEqual({ farm: 1 });
  });

  it('agrees with the map rule on what can be drawn', async () => {
    const { isPlottable } = await import('../../../scripts/lib/catalogue-expiry.mjs');
    for (const provider of ['google', 'osm', 'mock', 'familypilot'] as const) {
      expect(isPlottable({ provider, latitude: 51.5, longitude: -0.1 }), provider).toBe(canPlotOnOwnMap({ provider }));
    }
    expect(isPlottable({ provider: 'osm' })).toBe(false);
  });
});
