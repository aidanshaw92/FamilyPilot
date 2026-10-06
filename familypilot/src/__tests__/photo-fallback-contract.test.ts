import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { photoAttribution, photoCredit } from '@/src/services/places/place-photo-url';
import { ExternalPlaceRecord } from '@/src/types/places';

/**
 * THE PHOTOGRAPH CONTRACT. Two kinds of image, never confused.
 *
 *   REAL VENUE (Home, Explore, Venue Detail, Plans)
 *     real photograph available   -> that venue's own photograph, with the required attribution
 *     real photograph unavailable -> FamilyPilot's category fallback (a gradient and an icon, "photo not available")
 *     NEVER                       -> a generated or stock photograph standing in for a real venue
 *
 *   BRAND / FIXTURE (Welcome; the visual-test fixture)
 *     Welcome's lifestyle photographs may be generated: they depict no venue.
 *     The fixture's photographs are synthetic, live under scripts/fixtures/, and are served only by the fixture server.
 *
 * These tests pin the seams between the two so that a generated image cannot reach a real venue's card by accident.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const place = (photos: string[]): ExternalPlaceRecord =>
  ({
    familypilotId: 'fp-google-contract-park', externalId: 'ext', provider: 'google', name: 'Contract Park', latitude: 51.6, longitude: -0.3,
    category: 'park', photos, provenance: {}, fetchedAt: '2026-10-01T00:00:00.000Z', enrichmentStatus: 'provider_only',
  }) as unknown as ExternalPlaceRecord;

describe('a real venue with a real photograph shows it, with attribution', () => {
  const proxied = 'https://places.example.test/api/places/photo?id=ChIJexample&index=0&credit=Richard%20Goldschmidt&authorUri=https%3A%2F%2Fmaps.example%2Fa&photoUri=https%3A%2F%2Fmaps.example%2Fp';

  it('keeps the provider photograph as the venue image', () => {
    const venue = mergePlaceToVenue(place([proxied]), null, 51.64, -0.36);
    expect(venue.imageUrl).toBe(proxied);
  });

  it('carries the photographer, and the links, that the provider requires', () => {
    expect(photoCredit(proxied)).toBe('Richard Goldschmidt');
    expect(photoAttribution(proxied)).toMatchObject({ author: 'Richard Goldschmidt', authorUri: 'https://maps.example/a', photoUri: 'https://maps.example/p' });
  });

  it('draws the credit wherever the photograph is drawn', () => {
    const source = read('src/components/ui/VenueImage.tsx');
    expect(source).toContain('photoCredit(uri)');
    expect(source).toMatch(/Photo: \{credit\}/);
  });
});

describe('a real venue with no photograph shows the category fallback, and nothing else', () => {
  it('has no image URL, so the component draws the fallback', () => {
    expect(mergePlaceToVenue(place([]), null, 51.64, -0.36).imageUrl).toBe('');
    expect(mergePlaceToVenue(place(['not-a-path']), null, 51.64, -0.36).imageUrl).toBe('');
  });

  it('VenueImage draws a category gradient and icon, labelled "photo not available", when there is no uri', () => {
    const source = read('src/components/ui/VenueImage.tsx');
    expect(source).toMatch(/!uri\|\|failed\?/);
    expect(source).toContain('photo not available');
    expect(source).toContain('categoryGradient(category)');
  });

  it('VenueImage takes only the venue\'s own uri: it has no photograph of its own to substitute', () => {
    const source = read('src/components/ui/VenueImage.tsx');
    expect(source).not.toMatch(/require\(|assets\/images|welcome|fixtures/i);
    expect(source).toMatch(/Stock photography must not impersonate a place/);
  });
});

describe('generated and synthetic photography stays on its own side of the line', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((name) => {
      const path = join(dir, name);
      if (name === '__tests__' || name === 'node_modules') return [];
      return statSync(join(ROOT, path)).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const appFiles = [...sourceFiles('src'), ...sourceFiles('app')];

  it('only the Welcome screen reads the Welcome photographs', () => {
    // An import or a require, not a mention in a comment.
    const reads = /(from|require\()\s*['"][^'"]*(welcome-photos|assets\/images\/welcome)/;
    const readers = appFiles.filter((file) => reads.test(read(file)) || /require\('\.\.\/\.\.\/assets\/images\/welcome/.test(read(file))).map((file) => relative('.', file));
    expect(readers.sort()).toEqual(['app/(onboarding)/welcome.tsx', 'src/assets/welcome-photos.ts'].sort());
  });

  it('nothing in the app, the API or the server reads the synthetic fixture photographs', () => {
    const serverFiles = ['../api', '../server'].flatMap((dir) => {
      const walk = (d: string): string[] =>
        readdirSync(join(ROOT, d)).flatMap((name) => {
          if (name === 'node_modules' || name === '.data') return [];
          const path = join(d, name);
          return statSync(join(ROOT, path)).isDirectory() ? walk(path) : /\.(js|cjs|mjs|ts)$/.test(name) ? [path] : [];
        });
      return walk(dir);
    });
    const offenders = [...appFiles, ...serverFiles].filter((file) => /fixtures\/photos|fixture-photos|photos\/venues/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('no venue-shaped record is built from a Welcome or fixture photograph', () => {
    const merge = read('src/services/places/merge-place.ts');
    expect(merge).not.toMatch(/welcome|fixtures|generated/i);
  });
});
