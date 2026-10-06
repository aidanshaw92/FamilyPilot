#!/usr/bin/env node
/**
 * Installs the SYNTHETIC FIXTURE photographs (test/demo only) from a folder of delivered images.
 *
 *   npm install --no-save sharp
 *   node scripts/photos/install-fixture-photos.mjs <folder> [--dry-run]
 *
 * <folder> holds files named `<category>.<ext>` or `<category>-<n>.<ext>` for museum, park, soft-play, farm, attraction, and
 * optionally aquarium and zoo. Each is cropped to 4:5, resized to 1600x2000, stripped of metadata, and written to
 * `scripts/fixtures/photos/venues/<category>-<n>.jpg`: the isolated fixture folder that only `serve-places-fixture.mjs`
 * reads. Nothing is written to `assets/`, `src/`, `app/` or any production photo cache, and no provider provenance is attached.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURE_OUTPUT, FIXTURE_PHOTOS } from './specs.mjs';
import { encodeToSpec, isImageName, loadSharp } from './encode.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'scripts', 'fixtures', 'photos', 'venues');

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!folder) {
  console.error('Usage: install-fixture-photos.mjs <folder> [--dry-run]');
  process.exit(1);
}
const sharp = loadSharp();
mkdirSync(OUT, { recursive: true });

const names = readdirSync(resolve(folder)).filter(isImageName).sort();
let failed = 0;
const counts = new Map();
for (const category of FIXTURE_PHOTOS) {
  const matches = names.filter((name) => new RegExp(`^${category.id}(-\\d+)?${extname(name).replace('.', '\\.')}$`, 'i').test(name));
  if (!matches.length) {
    console.log(`  ${category.required ? 'MISS' : '--  '} ${category.id}: ${category.required ? 'required, no file' : 'optional, none supplied'}`);
    if (category.required) failed += 1;
    continue;
  }
  for (const [i, name] of matches.entries()) {
    try {
      const result = await encodeToSpec(sharp, join(resolve(folder), name), { px: FIXTURE_OUTPUT.px, quality: FIXTURE_OUTPUT.qualityRange, targetBytes: FIXTURE_OUTPUT.targetBytes });
      if (result.source.width < FIXTURE_OUTPUT.minPx[0] || result.source.height < FIXTURE_OUTPUT.minPx[1]) throw new Error('source smaller than the minimum');
      if (result.buffer.length > FIXTURE_OUTPUT.maxBytes) throw new Error(`${Math.round(result.buffer.length / 1024)} KB, over budget`);
      const target = `${category.id}-${i + 1}.jpg`;
      if (!dryRun) writeFileSync(join(OUT, target), result.buffer);
      counts.set(category.id, (counts.get(category.id) ?? 0) + 1);
      console.log(`  ok   ${name} -> ${target} (${result.source.width}x${result.source.height}, ${Math.round(result.buffer.length / 1024)} KB at q${result.quality})`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL ${name}: ${error.message}`);
    }
  }
}
console.log(failed ? `\n${failed} problem(s).` : '\nfixture photographs installed. Restart the fixture server and rebuild nothing: they are served, not bundled.');
process.exit(failed ? 1 : 0);
