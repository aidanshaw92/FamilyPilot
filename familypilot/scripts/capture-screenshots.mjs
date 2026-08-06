/**
 * Capture post-remediation screenshots at 390×844.
 * Usage: node scripts/capture-screenshots.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'https://family-pilot-seven.vercel.app';
const OUT = join(process.cwd(), '..', 'docs', 'post-remediation-screenshots');

const shots = [
  { file: '01-home.png', path: '/' },
  { file: '02-explore.png', path: '/explore' },
  { file: '03-trips.png', path: '/trips' },
  { file: '04-saved.png', path: '/saved' },
  { file: '05-profile.png', path: '/profile' },
  { file: '06-venue-detail.png', path: '/venue/venue-1' },
  { file: '07-venue-not-found.png', path: '/venue/invalid' },
  { file: '08-need-now.png', path: '/need-now' },
  { file: '09-holiday.png', path: '/holiday' },
  { file: '10-packing.png', path: '/packing' },
  { file: '11-car-fit.png', path: '/car-fit' },
  { file: '12-saved-empty-note.png', path: '/saved' },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

for (const shot of shots) {
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, shot.file), fullPage: true });
  console.log(`Saved ${shot.file}`);
}

// 320px width check on Home
await page.setViewportSize({ width: 320, height: 844 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: join(OUT, '13-home-320px.png'), fullPage: true });
console.log('Saved 13-home-320px.png');

await browser.close();

if (consoleErrors.length) {
  console.log('\nConsole errors:');
  consoleErrors.forEach((e) => console.log(` - ${e}`));
} else {
  console.log('\nNo console errors captured.');
}
