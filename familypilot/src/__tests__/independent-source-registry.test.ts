import { readFileSync } from 'node:fs';
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

describe('the registry accepts the two open-licence sources, each with its own licence', () => {
  it('serves a reviewed OS Open Greenspace park and a reviewed Wikidata museum, with their own provider', () => {
    const problems: string[] = [];
    const valid = identities.loadIdentities({ entries: [osEntry(), wdEntry()], onProblem: (id: string, p: string) => problems.push(`${id}: ${p}`) });
    expect(problems).toEqual([]);
    expect(valid).toHaveLength(2);
    const places = valid.map(identities.identityToPlace);
    expect(places.map((p: { provider: string }) => p.provider)).toEqual(['os-greenspace', 'wikidata']);
    expect(places[0]).toMatchObject({ independentSource: 'os-greenspace', latitude: 51.451 });
  });

  it('refuses a source with a licence it cannot carry', () => {
    const bad = osEntry({ identity: { ...osEntry().identity, licence: 'ODbL-1.0' } });
    expect(identities.problemWith(bad)).toMatch(/not one os-greenspace can carry/);
    const bad2 = wdEntry({ location: { ...wdEntry().location, licence: 'OGL-3.0' } });
    expect(identities.problemWith(bad2)).toMatch(/not one wikidata can carry/);
  });

  it('refuses an entry that cannot be traced to one record in its source', () => {
    expect(identities.problemWith(wdEntry({ identity: { ...wdEntry().identity, externalId: 'not-a-qid' } }))).toMatch(/Wikidata item/);
    expect(identities.problemWith(wdEntry({ identity: { ...wdEntry().identity, url: 'https://www.wikidata.org/wiki/Q999' } }))).toMatch(/Wikidata page of/);
    expect(identities.problemWith(osEntry({ identity: { ...osEntry().identity, externalId: 'fp-google-whatever' } }))).toMatch(/feature identifier/);
    expect(identities.problemWith(osEntry({ identity: { ...osEntry().identity, url: 'https://example.org/greenspace' } }))).toMatch(/product page/);
    const osm = { ...osEntry(), identity: { source: 'osm', url: 'https://www.openstreetmap.org/way/9', retrievedAt: '2026-10-14', licence: 'ODbL-1.0', externalId: 'way/9' }, location: { latitude: 51.5, longitude: -0.1, source: 'osm', licence: 'ODbL-1.0' } };
    expect(identities.problemWith(osm)).toBeNull();
    expect(identities.problemWith({ ...osm, identity: { ...osm.identity, url: 'https://www.openstreetmap.org/way/10' } })).toMatch(/OpenStreetMap page/);
    expect(identities.problemWith({ ...osm, identity: { ...osm.identity, externalId: undefined } })).toMatch(/OpenStreetMap element/);
  });

  it('refuses a source nobody has been credited for', () => {
    expect(identities.problemWith(osEntry({ identity: { ...osEntry().identity, source: 'ordnance-survey' } }))).toMatch(/identity.source must be one of/);
    expect(identities.problemWith(wdEntry({ location: { ...wdEntry().location, source: 'geonames' } }))).toMatch(/location.source must be one of/);
  });

  it('keeps each licence family in its own file', () => {
    expect(identities.fileProblem('os-greenspace', osEntry())).toBeNull();
    expect(identities.fileProblem('wikidata', wdEntry())).toBeNull();
    expect(identities.fileProblem('wikidata', osEntry())).toMatch(/holds only identity.source wikidata/);
    // a Wikidata identity with an OS position would put OS content in the Wikidata file
    expect(identities.fileProblem('wikidata', wdEntry({ location: { ...wdEntry().location, source: 'os-greenspace', licence: 'OGL-3.0' } }))).toMatch(/holds only positions whose source is wikidata/);
    // OpenStreetMap content still belongs in osm.json and nowhere else
    const osmPosition = osEntry({ location: { latitude: 51.45, longitude: -0.1, source: 'osm', licence: 'ODbL-1.0' } });
    expect(identities.fileProblem('os-greenspace', osmPosition)).toMatch(/belongs in osm.json/);
    expect(identities.fileProblem('osm', osEntry())).toMatch(/holds only entries whose identity or position is from OpenStreetMap/);
  });

  it('still refuses an unreviewed entry, and a position outside Greater London', () => {
    expect(identities.problemWith(osEntry({ reviewedBy: 'UNREVIEWED (simulation only)' }))).toMatch(/unreviewed/);
    expect(identities.problemWith(osEntry({ location: { ...osEntry().location, latitude: 53.4 } }))).toMatch(/outside Greater London/);
  });

  it('serves a preview-only rehearsal entry outside production and refuses it in production', () => {
    const rehearsal = osEntry({ reviewedBy: 'PREVIEW ONLY (not a review)' });
    expect(identities.problemWith(rehearsal, { production: false })).toBeNull();
    expect(identities.problemWith(rehearsal, { production: true })).toMatch(/not served in production/);
    expect(identities.loadIdentities({ entries: [rehearsal], production: true })).toHaveLength(0);
    expect(identities.loadIdentities({ entries: [rehearsal], production: false })).toHaveLength(1);
    // a real reviewer's name is unaffected by the environment
    expect(identities.problemWith(osEntry(), { production: true })).toBeNull();
  });

  it('decides "production" from the deployment, not from the build mode alone', () => {
    const saved = { v: process.env.VERCEL_ENV, n: process.env.NODE_ENV };
    const rehearsal = osEntry({ reviewedBy: 'PREVIEW ONLY (not a review)' });
    try {
      process.env.VERCEL_ENV = 'preview'; process.env.NODE_ENV = 'production'; // every Vercel deployment builds in production mode
      expect(identities.problemWith(rehearsal)).toBeNull();
      process.env.VERCEL_ENV = 'production';
      expect(identities.problemWith(rehearsal)).toMatch(/not served in production/);
      delete process.env.VERCEL_ENV; process.env.NODE_ENV = 'production'; // a production Node process that is not on Vercel
      expect(identities.problemWith(rehearsal)).toMatch(/not served in production/);
      process.env.NODE_ENV = 'test'; // local and CI
      expect(identities.problemWith(rehearsal)).toBeNull();
    } finally {
      if (saved.v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.v;
      process.env.NODE_ENV = saved.n;
    }
  });

  it('ships empty files for every family until a reviewed set is approved', () => {
    expect(identities.shippedEntries()).toEqual([]);
  });
});

describe('credit and map', () => {
  it('credits the Ordnance Survey where its licence asks, and nobody for CC0 or for our own rows', () => {
    expect(externalCreditFor('os-greenspace')).toBe('os');
    expect(externalCreditFor('wikidata')).toBeNull();
    expect(externalCreditFor('familypilot')).toBeNull();
    expect(OS_CREDIT).toMatch(/^Contains OS data © Crown copyright and database right \d{4}$/);
    expect(OGL_URL).toBe('https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/');
  });

  it('names each holder once, in a stable order', () => {
    const places = [{ provider: 'os-greenspace' as const }, { provider: 'google' as const }, { provider: 'osm' as const }, { provider: 'os-greenspace' as const }, { provider: 'wikidata' as const }];
    expect(creditsForPlaces(places)).toEqual(['google', 'osm', 'os']);
  });

  it('lets the app draw the open-licence places on its own map, and still never a Google one', () => {
    for (const provider of ['osm', 'wikidata', 'os-greenspace', 'mock'] as const) expect(canPlotOnOwnMap({ provider }), provider).toBe(true);
    for (const provider of ['google', 'familypilot'] as const) expect(canPlotOnOwnMap({ provider }), provider).toBe(false);
    expect([...MAPPABLE_PROVIDERS].sort()).toEqual(['fhrs', 'mock', 'os-greenspace', 'osm', 'wikidata']);
  });

  it('agrees with the catalogue simulation on what can be drawn', async () => {
    const { isPlottable } = await import(join(root, 'scripts/lib/catalogue-expiry.mjs'));
    for (const provider of ['google', 'osm', 'wikidata', 'os-greenspace', 'fhrs', 'mock', 'familypilot'] as const) {
      expect(isPlottable({ provider, latitude: 51.5, longitude: -0.1 }), provider).toBe(canPlotOnOwnMap({ provider }));
    }
  });
});

describe('the About screen carries the licence notices', () => {
  const about = readFileSync(join(__dirname, '../../app/about.tsx'), 'utf8');

  it('shows the Open Database License notice, the Ordnance Survey statement and the Wikidata line, each with its licence link', () => {
    for (const name of ['ODBL_NOTICE', 'ODBL_URL', 'OS_CREDIT', 'OGL_URL', 'OSM_CREDIT', 'OSM_COPYRIGHT_URL', 'WIKIDATA_NOTICE', 'WIKIDATA_LICENCE_URL', 'PLACE_LISTS_URL']) {
      expect(about, name).toContain(name);
    }
    expect(about).toMatch(/accessibilityRole="link"/);
  });

  it('uses the licence\'s own words for the notice', async () => {
    const { ODBL_NOTICE, ODBL_URL, PLACE_LISTS_URL } = await import('@/src/services/places/attribution');
    expect(ODBL_NOTICE).toBe('Contains information from OpenStreetMap, which is made available here under the Open Database License (ODbL).');
    expect(ODBL_URL).toBe('https://opendatacommons.org/licenses/odbl/1-0/');
    expect(PLACE_LISTS_URL).toMatch(/server\/places\/data\/identities$/);
  });

  it('says what the data does not tell you', () => {
    expect(about).toMatch(/shown as not checked until we have looked/);
    expect(about).not.toMatch(/checked by us/);
  });
});

describe('an open-licence place becomes a venue like any other', () => {
  it('keeps its provider, says nothing it does not know, and is not given hours, photos or a rating', async () => {
    const { mergePlaceToVenue } = await import('@/src/services/places/merge-place');
    for (const entry of [osEntry(), wdEntry()]) {
      const place = identities.identityToPlace(entry);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const venue = mergePlaceToVenue(place as any, null, 51.5, -0.1);
      expect(venue.provider).toBe(place.provider);
      expect(venue.name).toBe(entry.name);
      expect(venue.structuredOpeningHours).toBeUndefined();
      expect(venue.imageUrl ?? '').toBe('');
      expect(venue.enrichmentStatus).toBe('provider_only');
    }
  });
});

describe('the registry folder carries its licence notice', () => {
  const notice = readFileSync(join(root, 'server/places/data/identities/NOTICE.md'), 'utf8');

  it('names every file and the licence it carries, and the ODbL notice for the OpenStreetMap file', () => {
    for (const needle of ['osm.json', 'os-greenspace.json', 'wikidata.json', 'official-site.json', 'ODbL', 'Open Government Licence v3.0', 'CC0 1.0', '© OpenStreetMap contributors', 'Contains OS data © Crown copyright and database right']) {
      expect(notice, needle).toContain(needle);
    }
  });

  it('says no Google field may be in the OpenStreetMap file', () => {
    expect(notice).toMatch(/No Google field is, or may be, in this file/);
  });
});

describe('the catalogue after Google rows age out, with open-licence entries', () => {
  it('serves a keyed continuing entry once its Google row is stale, draws it on the map, and does not serve the same venue twice', async () => {
    const { simulate } = await import(join(root, 'scripts/lib/catalogue-expiry.mjs'));
    const rows = [
      { id: 'fp-google-A', category: 'park', lat: 51.451, lng: -0.1066, fetched: '2026-10-09', provider: 'google' },
      { id: 'fp-google-B', category: 'museum', lat: 51.4412, lng: -0.0611, fetched: '2026-10-09', provider: 'google' },
      { id: 'fp-google-C', category: 'farm', lat: 51.532, lng: -0.067, fetched: '2026-10-09', provider: 'google' },
    ];
    const entries = [osEntry({ familypilotId: 'fp-google-A' }), wdEntry({ familypilotId: 'fp-google-B' }), osEntry({ familypilotId: 'fp-os-0a1b2c3d-0000-0000-0000-000000000009', name: 'Brand New Park', location: { latitude: 51.47, longitude: -0.2, source: 'os-greenspace', licence: 'OGL-3.0' } })];
    const [before, after] = await simulate({ rows, entries, dates: ['2026-10-20', '2026-11-09'] });
    // while the Google rows are fresh, a continuing entry is hidden behind its own row and only the new one is added
    expect(before.googleOnly).toBe(3);
    expect(before.independentAdded).toBe(1);
    expect(before.total).toBe(4);
    // after they age out the continuing entries take over, plus the new one; the farm, which has no independent entry, is gone
    expect(after.googleOnly).toBe(0);
    expect(after.total).toBe(3);
    expect(after.plottable).toBe(3); // positions from OS and Wikidata may be drawn on the app's own map
    expect(after.listOnly).toBe(0);
    expect(after.byCategory).toEqual({ park: 2, museum: 1 });
  });

  it('switches a category to the independent files in one release, so no Google row of it is served beside them', async () => {
    const { simulate } = await import(join(root, 'scripts/lib/catalogue-expiry.mjs'));
    const rows = [{ id: 'fp-google-A', category: 'park', lat: 51.451, lng: -0.1066, fetched: '2026-10-20', provider: 'google' }];
    const entries = [osEntry({ familypilotId: 'fp-os-0a1b2c3d-0000-0000-0000-000000000009', name: 'Other Park' })];
    const [open, switched] = [
      (await simulate({ rows, entries, dates: ['2026-10-25'] }))[0],
      (await simulate({ rows, entries, dates: ['2026-10-25'], cutover: ['park'] }))[0],
    ];
    expect(open.total).toBe(2); // a blend of Google's row and ours: the state the OpenStreetMap analysis warns about
    expect(switched.total).toBe(1);
    expect(switched.byCategory).toEqual({ park: 1 });
  });

  it('shows whose data a venue is on the page itself, not only inside the collapsed "More about this place"', () => {
    const src = readFileSync(join(root, 'familypilot/app/venue/[id].tsx'), 'utf8');
    const uses = [...src.matchAll(/<PlaceAttribution\b/g)];
    expect(uses).toHaveLength(1);
    // The one use comes after the evidence block, which is outside the `moreOpen` branch, so a parent sees the credit without opening anything.
    expect(src.indexOf('<PlaceAttribution')).toBeGreaterThan(src.indexOf('<EvidenceSection'));
  });
});

