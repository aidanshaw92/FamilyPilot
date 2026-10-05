/**
 * Prepares SYNTHETIC fixture photographs (test/demo only) for assets/images/fixtures/venues/: crops a supplied
 * image to 4:3 around the part the cards show (the Explore thumbnail is a portrait strip cut from the centre; the
 * Home hero has text over its lower third), keeps the crop's native resolution (no upscaling), and encodes a JPEG
 * under the size budget. Canvas encoding drops all metadata. Also records the file in manifest.json as synthetic.
 *
 * usage: node scripts/prepare-fixture-photos.mjs <category>=<source>:<x0 as a fraction 0-1 of the free width> ...
 *   e.g. museum=/path/9.webp:0.3
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'assets', 'images', 'fixtures', 'venues');
const BUDGET = 380 * 1024;
const CATEGORIES = ['museum', 'park', 'soft_play', 'farm', 'attraction', 'zoo', 'activity', 'aquarium'];
const GENERATOR = 'ChatGPT image generation (synthetic; not a photograph of a real place)';

mkdirSync(OUT, { recursive: true });
const manifestPath = join(OUT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const jobs = process.argv.slice(2).map((a) => {
  const [category, rest] = a.split('=');
  const [source, x] = rest.split(':');
  return { category, source, x: Number(x ?? 0.5) };
});
if (!jobs.length) { console.error('usage: node scripts/prepare-fixture-photos.mjs <category>=<source>:<x0 fraction> ...'); process.exit(2); }

const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const page = await browser.newPage();
await page.setContent('<body></body>');
let failed = false;
for (const { category, source, x } of jobs) {
  if (!CATEGORIES.includes(category)) { console.error(`unknown category ${category}`); failed = true; continue; }
  const mime = /\.webp$/i.test(source) ? 'image/webp' : /\.png$/i.test(source) ? 'image/png' : 'image/jpeg';
  const r = await page.evaluate(async ({ data, mime, x, budget }) => {
    const img = new Image();
    img.src = `data:${mime};base64,${data}`;
    await img.decode();
    const h = img.naturalHeight;
    const w = Math.round((h * 4) / 3);
    if (w > img.naturalWidth) return { error: 'source is narrower than 4:3' };
    const sx = Math.round((img.naturalWidth - w) * x);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, 0, w, h, 0, 0, w, h);
    for (let q = 0.9; q >= 0.5; q -= 0.02) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1];
      if (b64.length * 0.75 <= budget) return { b64, q: +q.toFixed(2), w, h, sx, source: [img.naturalWidth, img.naturalHeight] };
    }
    return { error: 'cannot reach the size budget' };
  }, { data: readFileSync(source).toString('base64'), mime, x, budget: BUDGET });
  if (r.error) { console.error(`${category}: ${r.error}`); failed = true; continue; }
  const file = `${category}.jpg`;
  writeFileSync(join(OUT, file), Buffer.from(r.b64, 'base64'));
  manifest.images = manifest.images.filter((i) => i.file !== file);
  manifest.images.push({ file, category, synthetic: true, generator: GENERATOR, prompt: 'docs/PHOTOGRAPHY_ASSETS.md, section B' });
  console.log(`${file}  ${r.w}x${r.h}  q=${r.q}  ${Math.round(readFileSync(join(OUT, file)).length / 1024)} KB  (source ${r.source.join('x')}, x0 ${r.sx})`);
}
manifest.images.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
process.exit(failed ? 1 : 0);
