/**
 * Meet halfway, what the viewer is and is not told about the other family (PR #196, third round). The same five places and the same
 * viewer, with the other family sharing different things:
 *   needs   shares a child's age, a pushchair and ONE must-have (baby changing) that is unconfirmed at the first place
 *   nothing shares only where they set off from
 * The viewer sees "Something Kevin’s family needs isn’t confirmed at …" in the first, "Not assessed" in the second, and in neither
 * the must-have, the age, the pushchair or any routine. The script fails if any of those words reach the screen.
 *
 * Serve first: node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/capture-halfway-privacy.mjs <baseUrl> <outDir>
 */
import { chromium } from 'playwright';
import { asProvider } from './lib/place-provider.mjs';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const OUT = process.argv[3] ?? '/tmp/halfway-privacy';
mkdirSync(OUT, { recursive: true });
// Served as independently located places: a Google place is never drawn on the app's own map, and this checks the map's layout (see lib/place-provider.mjs).
const PLACES = asProvider(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'halfway-figma-places.json'), 'utf8')), 'osm');
const PROFILE = {
  id: 'family-pv', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy'] },
  ],
  homeLocation: 'NW3', homeLatitude: 51.556, homeLongitude: -0.178, budgetTier: 'moderate', completionPercent: 90, vehicle: null,
  pushchair: 'Bugaboo Butterfly', travelCot: null, memberships: [], mustHaveFacilities: [], routines: [],
};
const VARIANTS = {
  needs: { id: 'guest-k', label: 'Kevin’s family', area: 'E8', latitude: 51.545, longitude: -0.06, ages: [2], pushchair: true, required: ['babyChanging'], routines: [] },
  nothing: { id: 'guest-k', label: 'Kevin’s family', area: 'E8', latitude: 51.545, longitude: -0.06, ages: [], pushchair: false, required: [], routines: [] },
};
// What must never be on the viewer's screen about the other family.
const FORBIDDEN = [/baby changing[^.]*Kevin|Kevin[^.]*baby changing/i, /Kevin[^.]*\b(aged?|year|toddler|pushchair|buggy|wheelchair|nap)\b/i, /\bKevin’s (child|son|daughter|baby|toddler)\b/i];

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

for (const [variant, kevin] of Object.entries(VARIANTS)) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-17T07:00:00'));
  const planning = JSON.stringify({ state: { families: [kevin], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 });
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); },
    { p: planning, f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  await page.route((u) => /intent=between/.test(u.toString()), (route) => route.fulfill({ json: PLACES }));
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
  await page.getByTestId('halfway-sheet-collapsed').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const seen = new Set();
  const read = async (label) => { const lines = await page.evaluate(() => [...document.body.innerText.split('\n'), ...[...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'))]); for (const l of lines) seen.add(l.trim()); return lines.join('\n'); };
  await page.screenshot({ path: join(OUT, `privacy-${variant}-1-map.png`) });
  await read('map');
  await page.getByTestId('halfway-details').click(); await page.waitForTimeout(900);
  await read('expanded');
  await page.getByTestId('halfway-sheet-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `privacy-${variant}-2-expanded-end.png`) });
  const expanded = await read('expanded end');
  await page.getByTestId('halfway-sheet-close').click(); await page.waitForTimeout(500);
  await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(900);
  const list = await read('list');
  await page.screenshot({ path: join(OUT, `privacy-${variant}-3-list.png`) });
  // Each line (and each accessibility label) on its own: a sentence that names them and what they need is the leak.
  // The place where what they need is unconfirmed: open each card until the sheet says so, and keep that sheet.
  if (variant === 'needs') {
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId('halfway-mode-list').click().catch(() => {}); await page.waitForTimeout(500);
      await page.getByTestId('halfway-option-head').nth(i).click(); await page.waitForTimeout(900);
      await page.getByTestId('halfway-details').click(); await page.waitForTimeout(900);
      const t = await read(`place ${i + 1}`);
      if (/Something Kevin’s family needs isn’t confirmed at/.test(t)) {
        await page.getByTestId('halfway-before-you-go').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, 'privacy-needs-4-needs-checking-neutral.png') });
        break;
      }
      await page.getByTestId('halfway-sheet-close').click(); await page.waitForTimeout(500);
    }
  }
  const all = [...seen].join('\n');
  for (const re of FORBIDDEN) check(![...seen].some((l) => re.test(l)), `${variant}: nothing private about Kevin’s family on screen (${re})`);
  if (variant === 'nothing') check(/Not assessed/.test(expanded + list), 'nothing shared: their fit reads "Not assessed"');
  if (variant === 'needs') check(/Something Kevin’s family needs isn’t confirmed at/.test(all), 'something they need is unconfirmed: said neutrally, without what it is');
  await context.close();
}
await browser.close();
if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall passed');
