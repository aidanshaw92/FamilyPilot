#!/usr/bin/env node
/**
 * Installs the seven Welcome photographs from a folder of delivered images.
 *
 *   npm install --no-save sharp
 *   node scripts/photos/install-welcome-photos.mjs <folder> --generator "<tool, model and date>" [--dry-run]
 *
 * <folder> holds up to seven files named for their slot: zoo, farm, cafe, crafts, soft-play, puddles, aquarium, as .jpg,
 * .jpeg, .png or .webp. For each one this: crops to the slot's aspect around its focal point, resizes to the exact 3x
 * size, strips all metadata, writes an sRGB progressive 4:2:0 JPEG under 150 KB to `assets/images/welcome/<slot>.jpg`,
 * adds its line to CREDITS.md, and writes its `require` into `src/assets/welcome-photos.ts` (React Native needs each one
 * written out). A slot with no file is left on its category-gradient fallback.
 *
 * Welcome is brand/lifestyle imagery, so generated photography is appropriate here. This is NOT how Home or Explore get
 * photographs: those are real venues and keep the provider photograph or the category fallback.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WELCOME_OUTPUT, WELCOME_SLOTS } from './specs.mjs';
import { encodeToSpec, findSource, loadSharp } from './encode.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets', 'images', 'welcome');
const CREDITS = join(OUT, 'CREDITS.md');
const WIRING = join(ROOT, 'src', 'assets', 'welcome-photos.ts');

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--generator');
const generatorAt = args.indexOf('--generator');
const generator = generatorAt >= 0 ? args[generatorAt + 1] : null;
const dryRun = args.includes('--dry-run');

if (!folder || !generator) {
  console.error('Usage: install-welcome-photos.mjs <folder> --generator "<tool, model and date>" [--dry-run]');
  process.exit(1);
}
const sharp = loadSharp();
mkdirSync(OUT, { recursive: true });

const installed = [];
let failed = 0;
for (const slot of WELCOME_SLOTS) {
  const source = findSource(resolve(folder), slot.id, join);
  if (!source) {
    console.log(`  --   ${slot.id}: no file, stays on the gradient fallback`);
    continue;
  }
  try {
    const result = await encodeToSpec(sharp, source, { px: slot.px, focal: slot.focal, quality: WELCOME_OUTPUT.qualityRange, targetBytes: WELCOME_OUTPUT.targetBytes });
    if (result.buffer.length > WELCOME_OUTPUT.maxBytes) throw new Error(`${Math.round(result.buffer.length / 1024)} KB even at quality ${result.quality}; over the 150 KB budget`);
    if (!dryRun) writeFileSync(join(OUT, `${slot.id}.jpg`), result.buffer);
    console.log(`  ok   ${slot.id}: ${result.source.width}x${result.source.height} -> ${slot.px.join('x')}, ${Math.round(result.buffer.length / 1024)} KB at q${result.quality}`);
    installed.push(slot);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${slot.id}: ${error.message}`);
  }
}

if (!dryRun && installed.length) {
  // CREDITS.md: replace the table body with one line per slot that has a file now.
  const present = WELCOME_SLOTS.filter((slot) => existsSync(join(OUT, `${slot.id}.jpg`)));
  const header = readFileSync(CREDITS, 'utf8').split('\n').filter((line) => !/^\| [\w-]+ \| [\w-]+\.jpg \|/.test(line)).join('\n').replace(/\n+$/, '\n');
  const rows = present.map(
    (slot) => `| ${slot.id} | ${slot.id}.jpg | ${slot.scene} | none (generated image) | ${generator} | Generated for FamilyPilot; commercial use under the generator's terms, confirmed by the owner. No real person or venue depicted. |`,
  );
  writeFileSync(CREDITS, `${header}${rows.join('\n')}\n`);

  const entries = present.map((slot) => `  ${/^[a-z]+$/.test(slot.id) ? slot.id : `'${slot.id}'`}: require('../../assets/images/welcome/${slot.id}.jpg'),`);
  const wiring = readFileSync(WIRING, 'utf8').replace(/export const WELCOME_PHOTOS[^]*$/, `export const WELCOME_PHOTOS: Partial<Record<string, ImageSource>> = {\n${entries.join('\n')}\n};\n`);
  writeFileSync(WIRING, wiring);
  console.log(`\nwired ${present.length} of ${WELCOME_SLOTS.length} slots. Next: npx vitest run src/__tests__/welcome-photos.test.ts, then rebuild and review Welcome at 360, 393 and 430.`);
}
process.exit(failed ? 1 : 0);
