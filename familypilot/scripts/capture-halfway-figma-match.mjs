/**
 * Meet halfway v2, rendered with the SAME inputs the approved Figma frames were drawn from, so a comparison shows layout
 * differences and not differences in data.
 *
 *   viewport      393x852 (and 375x667, 360x780 for small phones), iPhone safe-area insets as real CSS
 *   date          Saturday 17 Oct, arrive 10:00
 *   you           NW3, Sloane (3) and Ozzie (a baby, in a buggy)
 *   other family  Kevin's family, E8: a child aged 2, toilets, a pushchair
 *   places        the five stored catalogue rows behind the frames (scripts/fixtures/halfway-figma-places.json), answered to
 *                 the `intent=between` lookup. Nothing else is stubbed: the engine, the grades and the wording are the app's own.
 *
 * Serve first (any scenario): node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/capture-halfway-figma-match.mjs <baseUrl> <outDir>
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const OUT = process.argv[3] ?? '/tmp/halfway-figma-match';
mkdirSync(OUT, { recursive: true });
const PLACES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'halfway-figma-places.json'), 'utf8'));

const PROFILE = {
  id: 'family-figma', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy'] },
  ],
  homeLocation: 'NW3', homeLatitude: 51.556, homeLongitude: -0.178, budgetTier: 'moderate', completionPercent: 90, vehicle: null,
  pushchair: 'Bugaboo Butterfly', travelCot: null, memberships: [], mustHaveFacilities: [], routines: [],
};
const KEVIN = { id: 'guest-k', label: 'Kevin’s family', area: 'E8', latitude: 51.545, longitude: -0.06, ages: [2], pushchair: true, required: ['toilets'], routines: [] };
const planning = JSON.stringify({ state: { families: [KEVIN], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 });

const SIZES = [
  { tag: '393', width: 393, height: 852, insets: { top: 47, bottom: 34 } },
  { tag: '375', width: 375, height: 667, insets: { top: 20, bottom: 0 } },
  { tag: '360', width: 360, height: 780, insets: { top: 47, bottom: 34 } },
];
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function open({ width, height, insets }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-17T07:00:00'));
  await page.addInitScript((i) => {
    const style = document.createElement('style');
    style.textContent = `div[style*="safe-area-inset"] { padding-top: ${i.top}px !important; padding-bottom: ${i.bottom}px !important; }`;
    const install = () => document.head?.appendChild(style);
    if (document.head) install(); else document.addEventListener('DOMContentLoaded', install);
  }, insets);
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); },
    { p: planning, f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  await page.route((u) => /intent=between/.test(u.toString()), (route) => route.fulfill({ json: PLACES }));
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
  await page.getByTestId('halfway-sheet-collapsed').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page };
}
const scrollTo = async (page, testId, to) => { if (!(await page.getByTestId(testId).count())) return; await page.getByTestId(testId).evaluate((el, y) => { el.scrollTop = y === 'end' ? el.scrollHeight : y; }, to); await page.waitForTimeout(450); };
const snap = (page, tag, name) => page.screenshot({ path: join(OUT, `${tag}-${name}.png`) });

for (const size of SIZES) {
  const { tag } = size;
  const { context, page } = await open(size);
  await snap(page, tag, '1-map');
  await page.getByTestId('halfway-map-pin-2').dispatchEvent('click'); await page.waitForTimeout(600);
  await snap(page, tag, '1b-map-pin2');
  await page.getByTestId('halfway-map-venue').dispatchEvent('click').catch(() => {});
  // Back to the first place for the expanded sheet (the frame's "Kentish Town City Farm")
  await page.getByTestId('halfway-map-pin-1').dispatchEvent('click').catch(() => {}); await page.waitForTimeout(500);
  await page.getByTestId('halfway-details').click(); await page.waitForTimeout(800);
  await snap(page, tag, '2-expanded');
  await scrollTo(page, 'halfway-sheet-scroll', 'end');
  await snap(page, tag, '2c-expanded-scrolled');
  await page.getByTestId('halfway-sheet-close').click(); await page.waitForTimeout(500);
  await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(900);
  await snap(page, tag, '3-list');
  await page.getByTestId('halfway-list').evaluate((el) => { el.scrollTop = 420; }); await page.waitForTimeout(450);
  await snap(page, tag, '3c-list-scrolled');
  await page.getByTestId('halfway-edit').click(); await page.waitForTimeout(800);
  await snap(page, tag, '4-edit');
  const navHidden = (await page.getByRole('tab', { name: 'Together' }).count()) === 0;
  await scrollTo(page, 'halfway-edit-scroll', 'end');
  await snap(page, tag, '4c-edit-scrolled-longest-journey');
  const row = await page.getByTestId('halfway-row-limit').boundingBox().catch(() => null);
  const done = await page.getByTestId('halfway-edit-done').boundingBox().catch(() => null);
  console.log(`${tag}: tab bar hidden while editing: ${navHidden}; Longest journey row ${row ? `y ${Math.round(row.y)}–${Math.round(row.y + row.height)}` : 'missing'}; Done ${done ? `y ${Math.round(done.y)}–${Math.round(done.y + done.height)}` : 'missing'}; viewport ${size.height}`);
  await page.getByTestId('halfway-edit-close').click(); await page.waitForTimeout(500);
  console.log(`${tag}: tab bar back after closing: ${(await page.getByRole('tab', { name: 'Together' }).count()) > 0}`);
  await context.close();
}
await browser.close();
