// Renders every raster brand asset from the E3 mark geometry in ./mark.mjs, so the app icon,
// adaptive icon, splash and favicon are reproducible from code rather than exported by hand.
// Usage: node scripts/brand/render-brand-assets.mjs   (writes into assets/images/)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { markSvg } from './mark.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(HERE, '..', '..', 'assets', 'images');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(OUT, { recursive: true });

const GREEN = '#0F4A3E', MINT = '#5FB3A3', WHITE = '#FFFFFF', MID = '#3F9A82';
const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
async function png(name, svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: join(OUT, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(`${name}.png ${size}x${size}`);
}
// iOS / Expo app icon: opaque green, the mark at 73%.
await png('icon', markSvg({ size: 1024, leader: WHITE, follower: MINT, background: GREEN, padding: Math.round(1024 * 0.135) }), 1024);
// Android adaptive icon: foreground on transparent inside the 66% safe zone; flat green background; white monochrome.
await png('android-icon-foreground', markSvg({ size: 1024, leader: WHITE, follower: MINT, padding: Math.round(1024 * 0.22) }), 1024);
await png('android-icon-monochrome', markSvg({ size: 1024, leader: WHITE, follower: WHITE, padding: Math.round(1024 * 0.22) }), 1024);
await png('android-icon-background', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${GREEN}"/></svg>`, 1024);
// Splash: the light mark on transparent; app.json sets the canvas colour behind it.
await png('splash-icon', markSvg({ size: 1024, leader: GREEN, follower: MID, padding: 256 }), 1024);
// Favicon: 48, green rounded square.
await png('favicon', markSvg({ size: 48, leader: WHITE, follower: MINT, background: GREEN, padding: 7, radius: 10 }), 48);
await browser.close();
