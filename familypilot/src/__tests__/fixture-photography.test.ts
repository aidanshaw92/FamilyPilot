import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Two photography contracts, kept apart by structure:
 *
 *  - REAL VENUES (Home, Explore, Venue): a real provider photograph with its attribution, otherwise the
 *    FamilyPilot category fallback. Never a generated photograph presented as the venue's.
 *  - SYNTHETIC FIXTURE photographs (assets/images/fixtures/venues): test/demo only, read by the fixture server
 *    alone. They must be impossible to mistake for provider evidence.
 *
 * These tests hold the line: the synthetic folder is isolated, labelled and unreachable from production code.
 */
const ROOT = join(__dirname, '..', '..');
const FIXTURE_DIR = join(ROOT, 'assets', 'images', 'fixtures', 'venues');
const CATEGORIES = ['museum', 'park', 'soft_play', 'farm', 'attraction', 'zoo', 'activity', 'aquarium'];
const MAX_BYTES = 400 * 1024;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', '__tests__'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8')) as {
  synthetic: boolean;
  images: { file: string; category: string; synthetic: boolean; generator?: string; prompt?: string }[];
};
const imageFiles = readdirSync(FIXTURE_DIR).filter((f) => /\.jpe?g$/i.test(f));

describe('synthetic fixture photography is isolated and labelled', () => {
  it('lives in its own fixture folder, flagged synthetic as a whole', () => {
    expect(existsSync(join(FIXTURE_DIR, 'README.md'))).toBe(true);
    expect(manifest.synthetic).toBe(true);
  });

  it('has a synthetic manifest entry for every image and an image for every entry', () => {
    expect(new Set(manifest.images.map((i) => i.file))).toEqual(new Set(imageFiles));
    for (const image of manifest.images) {
      expect(image.synthetic, image.file).toBe(true);
      expect(CATEGORIES, image.file).toContain(image.category);
      expect(image.file, image.file).toMatch(new RegExp(`^${image.category}(-[b-z])?\\.jpe?g$`));
    }
  });

  it('carries no provider provenance: no photographer, source, licence or attribution fields', () => {
    const allowed = new Set(['file', 'category', 'synthetic', 'generator', 'prompt']);
    for (const image of manifest.images) {
      for (const key of Object.keys(image)) expect(allowed.has(key), `${image.file}: ${key}`).toBe(true);
    }
  });

  it('keeps each image inside its size budget', () => {
    for (const file of imageFiles) {
      expect(statSync(join(FIXTURE_DIR, file)).size, file).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  it('holds nothing but the readme, the manifest and the images', () => {
    for (const file of readdirSync(FIXTURE_DIR)) {
      expect(['README.md', 'manifest.json'].includes(file) || /^[a-z_]+(-[b-z])?\.jpe?g$/.test(file), file).toBe(true);
    }
  });
});

describe('production code can never reach the synthetic fixture photographs', () => {
  const sources = ['app', 'src', 'components', 'server', 'constants']
    .map((d) => join(ROOT, d))
    .filter(existsSync)
    .flatMap((d) => walk(d));

  it('is not referenced by any app, component, server or shared source file', () => {
    const offenders = sources.filter((file) => /images\/fixtures|fixtures\/venues/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('is not imported by the Welcome photograph wiring, which has its own folder', () => {
    const wiring = readFileSync(join(ROOT, 'src', 'assets', 'welcome-photos.ts'), 'utf8');
    expect(wiring).not.toMatch(/fixtures/);
  });

  it('is served only by the fixture test server, marked synthetic', () => {
    const server = readFileSync(join(ROOT, 'scripts', 'serve-places-fixture.mjs'), 'utf8');
    expect(server).toContain('X-FamilyPilot-Fixture');
    expect(server).toContain("'synthetic'");
  });

  it('keeps Welcome brand imagery out of the venue surfaces', () => {
    // Welcome's photographs are brand imagery with their own folder, manifest and credits. Home, Explore and
    // the venue screens show real venues, so they must never import them.
    const venueSurfaces = sources.filter((f) => /[\\/](app[\\/]\((tabs)\)|app[\\/]venue|components[\\/](home|shared|ui)[\\/])/.test(f));
    expect(venueSurfaces.length).toBeGreaterThan(0);
    const offenders = venueSurfaces.filter((f) => /welcome-photos|images\/welcome/.test(readFileSync(f, 'utf8')) && !/PhotoSlot\.tsx$/.test(f));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('the venue photograph fallback contract', () => {
  const venueImage = readFileSync(join(ROOT, 'src', 'components', 'ui', 'VenueImage.tsx'), 'utf8');

  it('draws only the photograph it is given, or the category fallback: it generates and substitutes nothing', () => {
    // The only image source is the `uri` prop (the provider photograph). With none, or on failure, the
    // gradient fallback is drawn, labelled "photo not available", with no credit.
    expect(venueImage).toMatch(/photo not available/);
    expect(venueImage).not.toMatch(/welcome|fixtures|require\(/i);
  });

  it('shows the photographer credit only when a real photograph loaded', () => {
    expect(venueImage).toMatch(/showCredit&&!failed/);
  });
});
