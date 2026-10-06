import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATEGORY_FALLBACKS, FIXTURE_PHOTO_CATEGORIES, loadFixturePhotoSet, pickFixturePhoto } from '../../scripts/fixtures/fixture-photos.mjs';
import { FIXTURE_OUTPUT, FIXTURE_PHOTOS, WELCOME_SLOTS } from '../../scripts/photos/specs.mjs';

/**
 * Synthetic fixture photography is TEST/DEMO ONLY. These tests make it structurally impossible to mistake one for provider
 * evidence about a real venue.
 */

const ROOT = join(__dirname, '..', '..');
const DIR = join(ROOT, 'scripts', 'fixtures', 'photos', 'venues');
const SERVER = readFileSync(join(ROOT, 'scripts', 'serve-places-fixture.mjs'), 'utf8');

describe('where the fixture photographs live', () => {
  it('is under scripts/fixtures, which no app build includes', () => {
    expect(DIR.replace(ROOT, '')).toBe('/scripts/fixtures/photos/venues');
    // Not in assets/, which Metro can bundle, and not in the app source.
    expect(existsSync(join(ROOT, 'assets', 'images', 'fixtures'))).toBe(false);
    expect(existsSync(join(ROOT, 'src', 'assets', 'fixtures'))).toBe(false);
  });

  it('holds only well-formed fixture files', () => {
    const names = existsSync(DIR) ? readdirSync(DIR).filter((n) => n !== 'README.md' && n !== '.gitkeep') : [];
    for (const name of names) {
      const match = /^([a-z]+(?:-[a-z]+)*)-(\d+)\.jpg$/.exec(name);
      expect(match, `${name} must be <category>-<n>.jpg`).not.toBeNull();
      expect(FIXTURE_PHOTO_CATEGORIES, name).toContain(match![1].replace(/-/g, '_'));
    }
  });

  it('holds real JPEGs within the byte budget, with no metadata that could carry a place or a person', () => {
    const names = existsSync(DIR) ? readdirSync(DIR).filter((n) => n.endsWith('.jpg')) : [];
    for (const name of names) {
      const bytes = readFileSync(join(DIR, name));
      expect([bytes[0], bytes[1]], `${name} is not a JPEG`).toEqual([0xff, 0xd8]);
      expect(bytes.length, `${name} is ${Math.round(bytes.length / 1024)} KB`).toBeLessThanOrEqual(FIXTURE_OUTPUT.maxBytes);
      // No EXIF (APP1) segment: GPS, camera serial, software tags.
      expect(bytes.includes(Buffer.from('Exif\0\0')), `${name} carries EXIF`).toBe(false);
    }
  });
});

describe('who can serve them', () => {
  it('only the fixture server reads the folder, through the same photo URL shape the real proxy uses', () => {
    expect(SERVER).toContain("'fixtures', 'photos', 'venues'");
    expect(SERVER).toContain("url.pathname === '/api/places/photo'");
  });

  it('marks every response as a synthetic fixture photograph', () => {
    expect(SERVER).toContain("'X-FamilyPilot-Fixture': 'synthetic-photograph'");
  });

  it('attaches no provider provenance: the credit is a fixture credit and the links are the reserved .invalid domain', () => {
    expect(SERVER).toMatch(/authorUri: 'https:\/\/example\.invalid\//);
    expect(SERVER).toMatch(/photoUri: 'https:\/\/example\.invalid\//);
    expect(SERVER).toMatch(/googlePrimaryType|provider: 'google'/); // the fixture mimics the record SHAPE; nothing is fetched
    expect(SERVER).not.toMatch(/maps\.googleapis|googleusercontent|places\.googleapis/);
  });

  it('is never reachable from the app, the API or the server (see photo-fallback-contract.test.ts)', () => {
    expect(readFileSync(join(ROOT, 'app.json'), 'utf8')).not.toMatch(/fixtures/);
    expect(readFileSync(join(ROOT, 'package.json'), 'utf8')).not.toMatch(/fixtures\/photos/);
  });
});

describe('which photograph a place gets', () => {
  const set = new Map([
    ['park', [{ file: 'park-1.jpg', bytes: Buffer.from('p1') }, { file: 'park-2.jpg', bytes: Buffer.from('p2') }]],
    ['attraction', [{ file: 'attraction-1.jpg', bytes: Buffer.from('a1') }]],
    ['museum', [{ file: 'museum-1.jpg', bytes: Buffer.from('m1') }]],
  ]);

  it('is deterministic for a place and varies across a category when there is more than one', () => {
    expect(pickFixturePhoto(set, 'park', 3, 0)).toBe(pickFixturePhoto(set, 'park', 3, 0));
    const seen = new Set([0, 1, 2, 3].map((seed) => pickFixturePhoto(set, 'park', seed, 0)?.file));
    expect(seen).toEqual(new Set(['park-1.jpg', 'park-2.jpg']));
  });

  it('lets a category with no photograph of its own borrow the nearest honest one, and no other', () => {
    expect(pickFixturePhoto(set, 'activity', 0, 0)?.file).toBe('attraction-1.jpg');
    expect(FIXTURE_CATEGORY_FALLBACKS.activity).toEqual(['attraction', 'soft_play']);
    // A category nobody mapped gets nothing, and the server serves the drawn fixture image instead.
    expect(pickFixturePhoto(set, 'restaurant', 0, 0)).toBeNull();
    expect(pickFixturePhoto(new Map(), 'park', 0, 0)).toBeNull();
  });

  it('an empty or missing folder is an empty set: the repository works before any photograph exists', () => {
    expect(loadFixturePhotoSet(join(ROOT, 'does-not-exist')).size).toBe(0);
    expect(loadFixturePhotoSet(DIR).size).toBeGreaterThanOrEqual(0);
  });

  it('serves nothing to a place that has no photographs: the NO PHOTO state keeps the category fallback', () => {
    // The photo endpoint is only asked for a place that lists photographs; a place with `photos: []` never reaches it.
    expect(SERVER).toMatch(/kind === 'noPhoto'/);
    expect(SERVER).toMatch(/out\.photos = kind === 'noPhoto' \? \[\]/);
  });
});

describe('the photography specs agree with each other', () => {
  it('has the seven approved Welcome slots, in the approved order', () => {
    expect(WELCOME_SLOTS.map((slot) => slot.id)).toEqual(['zoo', 'farm', 'cafe', 'crafts', 'soft-play', 'puddles', 'aquarium']);
  });

  it('asks for the fixture categories the visual tests need, with museum, park, soft play, farm and attraction required', () => {
    expect(FIXTURE_PHOTOS.filter((c) => c.required).map((c) => c.id).sort()).toEqual(['attraction', 'farm', 'museum', 'park', 'soft-play']);
    for (const category of FIXTURE_PHOTOS) expect(FIXTURE_PHOTO_CATEGORIES).toContain(category.id.replace(/-/g, '_'));
  });

  it('keeps every supplied pixel size at or above the minimum', () => {
    expect(statSync(join(ROOT, 'scripts', 'photos', 'specs.mjs')).isFile()).toBe(true);
    expect(FIXTURE_OUTPUT.px[0]).toBeGreaterThanOrEqual(FIXTURE_OUTPUT.minPx[0]);
    expect(FIXTURE_OUTPUT.px[1] / FIXTURE_OUTPUT.px[0]).toBeCloseTo(1.25, 2);
  });
});
