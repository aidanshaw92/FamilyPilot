/**
 * Before/after renders for docs/STABLE_FAMILY_PERSONALISATION.md: the same family (two children, a feed and two naps)
 * on the same venues at the same clock (09:30, London), on every surface the change touches. Against the local
 * fixture (realistic scenario). Zero spend: every provider host is aborted and fails the run.
 *
 *   home-<w>.png           Home's first card
 *   explore-<w>.png        Explore's first results
 *   venue-<w>.png          Venue Detail: Family Fit, today, Create a plan
 *   plan-<w>.png           a generated plan for 10:00 with "not sure" how long: the visit note
 *   plan-routines-<w>.png  the same plan's routines section (no clash: the feed falls while there, home before the nap)
 *   plan-clash-<w>.png     the same place at 11:00 for two hours, which runs into Ozzie's nap at home: the advice
 *
 * usage: node scripts/capture-stable-personalisation.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176';
const OUT = resolve(process.argv[3] ?? join(process.cwd(), '..', 'docs', 'stable-personalisation', 'after'));
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov|openfreemap|mapbox|maptiler)\.[a-z.]+$|overpass/i;
mkdirSync(OUT, { recursive: true });

// 09:30 in London on a Wednesday in October (British Summer Time).
const NOW = new Date('2026-10-07T08:30:00Z');
const VENUE = 'fp-google-FIXTUREnotArealPlaceId0010';
const PROFILE = {
  id: 'family-recording', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'p2', name: 'Ellie', role: 'parent', dateOfBirth: '1991-05-02', age: 35 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy', 'carrier'] },
  ],
  homeLocation: 'Mill Hill', homeLatitude: 51.615, homeLongitude: -0.245, budgetTier: 'moderate', maxDriveMinutes: 45,
  completionPercent: 90, memberships: [], mustHaveFacilities: [],
  routines: [
    { id: 'r1', label: '', kind: 'feed', time: '11:00', durationMinutes: 30, atHome: false, childId: 'c2' },
    { id: 'r2', label: '', kind: 'nap', time: '13:00', durationMinutes: 90, atHome: true, childId: 'c2' },
    { id: 'r3', label: '', kind: 'nap', time: '13:30', durationMinutes: 60, atHome: true, childId: 'c1' },
  ],
};

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const settle = (page, ms = 1500) => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}).then(() => page.waitForTimeout(ms));

for (const width of [360, 393]) {
  const context = await browser.newContext({ viewport: { width, height: Math.round(width * 852 / 393) }, deviceScaleFactor: 2, timezoneId: 'Europe/London' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(({ profile }) => {
    if (localStorage.getItem('familypilot-family-v1')) return;
    localStorage.setItem('familypilot-family-v1', JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }));
  }, { profile: PROFILE });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  await page.screenshot({ path: join(OUT, `home-${width}.png`) });

  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  await page.screenshot({ path: join(OUT, `explore-${width}.png`) });

  await page.goto(`${BASE}/venue/${VENUE}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  await page.getByTestId('family-match-card').evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `venue-${width}.png`) });

  await page.goto(`${BASE}/plan?venue=${VENUE}&date=2026-10-07&start=10%3A00&visit=not-sure&parties=mine`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  await page.getByTestId('plan-visit-note').evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `plan-${width}.png`) });
  await page.getByTestId('plan-routines').evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `plan-routines-${width}.png`) });

  await page.goto(`${BASE}/plan?venue=${VENUE}&date=2026-10-07&start=11%3A00&visit=120&parties=mine`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  await page.getByTestId('plan-routines').evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `plan-clash-${width}.png`) });
  await context.close();
}
await browser.close();
if (blocked.length) { console.log(`LIVE PROVIDER REQUESTS: ${[...new Set(blocked)].join(', ')}`); process.exit(1); }
console.log(`captured to ${OUT}, zero provider requests`);
