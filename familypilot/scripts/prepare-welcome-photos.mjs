/**
 * Turns supplied source images (any size/format Chromium decodes: PNG, JPEG, WebP) into the Welcome slot
 * files: a crop at the slot's aspect (positions chosen per slot from docs/WELCOME_PHOTOGRAPHY.md: focal point,
 * the part the screen edge hides, the safe area), scaled, and encoded as a JPEG at or under the size budget.
 * Canvas encoding drops all EXIF/GPS metadata.
 *
 * usage: node scripts/prepare-welcome-photos.mjs <slot>=<source> [<slot>=<source> ...]
 *   writes assets/images/welcome/<slot>.jpg
 *
 * `crop` is [x0, y0, width, height] as fractions of the SOURCE image; its aspect times the source's must equal
 * the slot's aspect (checked), so nothing is stretched.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'assets', 'images', 'welcome');
const BUDGET = 140 * 1024; // the test allows 150 KB; keep a margin
const SUPPLY_SCALE = 1.3; // a little larger than the 3x spec, so a wider phone is still sharp

/** Slot size at 3x (px), from docs/WELCOME_PHOTOGRAPHY.md. */
const SLOTS = {
  zoo: [369, 606],
  farm: [521, 522],
  cafe: [460, 480],
  crafts: [322, 572],
  'soft-play': [478, 430],
  puddles: [412, 389],
  aquarium: [400, 350],
};

/**
 * Crops in SOURCE pixels, chosen by eye against each slot's rules. Keyed by slot, so a different source image for
 * a slot means revisiting its crop. [x0, y0, w, h]
 */
const CROPS = {
  // 1024x1536 giraffe: head and neck kept inside the left ~70% (the right 18% of the slot is off-screen).
  zoo: [40, 0, 937, 1536],
  // 1254x1254 child and rabbit: hands and rabbit pulled into the central 60% (the white sticker band and the outline eat the edge).
  farm: [330, 200, 924, 924],
  // 1254x1254 latte and croissant: the cup centred, nothing off-screen.
  cafe: [25, 0, 1204, 1254],
  // 1024x1536 pottery: the piece and brush inside the left 65% (the right 21% is off-screen).
  crafts: [117, 0, 865, 1536],
  // 1536x1024 toddler climbing: the child inside the central ~35-65% (the left 6% is off-screen).
  'soft-play': [112, 0, 1137, 1024],
  // 1254x1254 wellies in a puddle: the boots and splash centred; the top of the trousers is trimmed.
  puddles: [0, 70, 1254, 1184],
  // 1672x941 penguin: the head well inside the left 80% (the right 17% is off-screen); the tail is cropped.
  aquarium: [420, 0, 1073, 941],
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
if (!Object.keys(args).length) {
  console.error('usage: node scripts/prepare-welcome-photos.mjs <slot>=<source> ...');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const page = await browser.newPage();
await page.setContent('<body></body>');
let failed = false;
for (const [slot, source] of Object.entries(args)) {
  const size = SLOTS[slot];
  const crop = CROPS[slot];
  if (!size || !crop) { console.error(`no crop defined for slot "${slot}"`); failed = true; continue; }
  const mime = /\.webp$/i.test(source) ? 'image/webp' : /\.png$/i.test(source) ? 'image/png' : 'image/jpeg';
  const data = readFileSync(source).toString('base64');
  const [w, h] = size.map((v) => Math.round(v * SUPPLY_SCALE));
  const result = await page.evaluate(async ({ data, mime, crop, w, h, budget }) => {
    const img = new Image();
    img.src = `data:${mime};base64,${data}`;
    await img.decode();
    const [sx, sy, sw, sh] = crop;
    if (sx + sw > img.naturalWidth || sy + sh > img.naturalHeight) return { error: `crop outside the ${img.naturalWidth}x${img.naturalHeight} source` };
    if (Math.abs(sw / sh - w / h) > 0.01) return { error: `crop aspect ${(sw / sh).toFixed(3)} != slot ${(w / h).toFixed(3)}` };
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    for (let q = 0.9; q >= 0.5; q -= 0.02) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1];
      if (b64.length * 0.75 <= budget) return { b64, q: +q.toFixed(2), source: [img.naturalWidth, img.naturalHeight] };
    }
    return { error: 'cannot reach the size budget' };
  }, { data, mime, crop, w, h, budget: BUDGET });
  if (result.error) { console.error(`${slot}: ${result.error}`); failed = true; continue; }
  const file = join(OUT, `${slot}.jpg`);
  writeFileSync(file, Buffer.from(result.b64, 'base64'));
  console.log(`${slot}.jpg  ${w}x${h}  q=${result.q}  ${Math.round(readFileSync(file).length / 1024)} KB  (source ${result.source.join('x')})`);
}
await browser.close();
process.exit(failed ? 1 : 0);
