/**
 * Meet halfway v2 at larger text sizes, in a real browser, with the approved frames' own inputs (see capture-halfway-figma-match.mjs).
 *
 * METHOD, said plainly: this is a browser emulation of larger iPhone text, not Dynamic Type itself and not a device. Two things
 * are done before the app starts:
 *   1. The browser's own text size is raised (the root font size = 16 px x the scale), which the app reads as the font scale on the
 *      web (src/hooks/use-font-scale.ts), so the layout choices that depend on it (the list reflow, List as the opening view) run.
 *   2. Every piece of text in the page has its font size and line height multiplied by the same scale, as React Native does to
 *      <Text> on iOS, while boxes with fixed sizes stay fixed. SVG text (the map's labels) is not scaled, as on iOS.
 * Scales are iOS's own content-size multipliers: xxxLarge 1.35, AX1 1.6, AX2 1.9, AX3 2.35. Nothing here claims a device pass.
 *
 * For each size and each screen it measures, rather than eyeballs:
 *   horizontal overflow       the page or any visible element reaching past the screen's right edge
 *   clipped text              text cut off by a fixed-size ancestor that hides overflow
 *   controls                  every visible control is at least 44 x 44, and nothing else sits on top of its centre
 *   overlap                   two controls covering each other
 *   scroll                    long content scrolls on its own, and its last line ends clear of the pinned actions and the navigation
 *   navigation                the five tabs are all there, each with its label whole, and clear of the bottom edge
 *
 * Serve first: node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/verify-halfway-large-text.mjs <baseUrl> <outDir> [scale ...]   (default 1.35 1.9 2.35)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse, installTextScale } from './lib/large-text.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const OUT = process.argv[3] ?? '/tmp/halfway-large-text';
const SCALES = (process.argv.slice(4).length ? process.argv.slice(4) : ['1.35', '1.9', '2.35']).map(Number);
const SIZES = [{ tag: '393', width: 393, height: 852, insets: { top: 47, bottom: 34 } }, { tag: '375', width: 375, height: 667, insets: { top: 20, bottom: 0 } }];
mkdirSync(OUT, { recursive: true });
const PLACES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'halfway-figma-places.json'), 'utf8'));

const PROFILE = {
  id: 'family-lt', parentName: 'Aidan', familyName: 'Shaw',
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

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function scenario({ tag, width, height, insets }, scale) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-17T07:00:00'));
  await page.addInitScript(installTextScale, { scale, insets });
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); },
    { p: planning, f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  await page.route((u) => /intent=between/.test(u.toString()), (route) => route.fulfill({ json: PLACES }));
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
  await page.getByTestId('halfway-list').or(page.getByTestId('halfway-sheet-collapsed')).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const name = `${tag}@${scale}`;
  const shot = (s) => page.screenshot({ path: join(OUT, `${tag}-x${scale}-${s}.png`) });
  const report = async (screen, { tabbar = false } = {}) => {
    const found = await page.evaluate(analyse, { width, height, tabbar });
    check(found.length === 0, `${name} · ${screen}`, found.slice(0, 6).join(' | '));
  };
  const scrollEnd = async (testId) => { await page.getByTestId(testId).evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(450); };

  // The opening screen: at larger text the list is the way in, and the map is still one tap away.
  const opensOnList = (await page.getByTestId('halfway-list').count()) > 0;
  console.log(`  ${name} opens on: ${opensOnList ? 'List' : 'Map'}`);
  if (scale >= 1.35) check(opensOnList, `${name} · opens on the List at larger text`);
  await shot('0-opening');
  await report('opening screen', { tabbar: true });

  // List
  if (!opensOnList) { await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(800); }
  await shot('3-list');
  await report('list (top)', { tabbar: true });
  const list = page.getByTestId('halfway-list');
  const scrolls = await list.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  check(scrolls, `${name} · the list scrolls`);
  await scrollEnd('halfway-list');
  await shot('3c-list-end');
  await report('list (scrolled to the end)', { tabbar: true });
  const lastBox = await page.getByTestId('halfway-option').last().boundingBox();
  const navTop = await page.getByRole('tab').first().boundingBox();
  check(Boolean(lastBox) && lastBox.y + lastBox.height <= navTop.y + 1, `${name} · the last card ends above the navigation`, lastBox ? `card to ${Math.round(lastBox.y + lastBox.height)}, navigation from ${Math.round(navTop.y)}` : '');
  await list.evaluate((el) => { el.scrollTop = 0; });

  // Map and the recommendation sheet
  await page.getByTestId('halfway-mode-map').click(); await page.waitForTimeout(900);
  await shot('1-map');
  await report('map and recommendation sheet', { tabbar: true });
  // At larger text the map is a block of its own and the card follows it in the page's scroll: reach the end, then the card must be whole and clear of the navigation.
  const mapScroll = page.getByTestId('halfway-map-scroll');
  check(await mapScroll.count() === 1, `${name} · the map and card scroll together at larger text`);
  const scrolls2 = await mapScroll.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  await scrollEnd('halfway-map-scroll');
  await shot('1c-map-end');
  await report('map and recommendation (scrolled to the card)', { tabbar: true });
  const tracks = await page.getByTestId('halfway-journey-track').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
  check(tracks.length === 2 && tracks.every((t) => t.h >= 8 && t.w >= 100), `${name} · both journey bars are drawn, full width`, tracks.map((t) => `${Math.round(t.w)}x${Math.round(t.h)}`).join(', '));
  const plan = await page.getByTestId('halfway-plan').first().boundingBox();
  const detailsBtn = await page.getByTestId('halfway-details').first().boundingBox();
  const navBox = await page.getByRole('tab').first().boundingBox();
  check(Boolean(plan) && plan.y >= 0 && Math.max(plan.y + plan.height, detailsBtn ? detailsBtn.y + detailsBtn.height : 0) <= navBox.y + 1, `${name} · "Plan this day" and "Details" are whole, above the navigation`, plan ? `buttons to ${Math.round(Math.max(plan.y + plan.height, detailsBtn.y + detailsBtn.height))}, navigation from ${Math.round(navBox.y)} (${scrolls2 ? 'scrolled' : 'no scroll needed'})` : 'missing');
  await mapScroll.evaluate((el) => { el.scrollTop = 0; });
  const sheet = await page.getByTestId('halfway-sheet-collapsed').boundingBox();
  console.log(`  ${name} card starts at y ${sheet ? Math.round(sheet.y) : '?'} of ${height} (the map above it is a ${Math.round(sheet ? sheet.y : 0)} pt block with the header)`);

  // Expanded
  await page.getByTestId('halfway-details').click(); await page.waitForTimeout(900);
  await shot('2-expanded');
  await report('expanded recommendation (top)');
  await scrollEnd('halfway-sheet-scroll');
  await shot('2c-expanded-end');
  await report('expanded recommendation (scrolled to the end)');
  const close = await page.getByTestId('halfway-sheet-close').boundingBox();
  check(Boolean(close) && close.width >= 44 && close.height >= 44, `${name} · the close control is 44 pt`, close ? `${Math.round(close.width)}x${Math.round(close.height)}` : 'missing');
  await page.getByTestId('halfway-sheet-close').click(); await page.waitForTimeout(500);

  // Edit meeting details
  await page.getByTestId('halfway-edit').click(); await page.waitForTimeout(900);
  await shot('4-edit');
  await report('edit meeting details (top)');
  await scrollEnd('halfway-edit-scroll');
  await shot('4c-edit-end');
  await report('edit meeting details (scrolled to the end)');
  const row = await page.getByTestId('halfway-row-limit').boundingBox();
  const done = await page.getByTestId('halfway-edit-done').boundingBox();
  const closeEdit = await page.getByTestId('halfway-edit-close').boundingBox();
  check(Boolean(row) && row.y >= 0 && row.y + row.height <= done.y, `${name} · the Longest journey row is reachable, above Done`, row ? `row ${Math.round(row.y)}–${Math.round(row.y + row.height)}, Done from ${Math.round(done.y)}` : 'missing');
  check(done.y + done.height <= height - 4, `${name} · Done is whole on the screen`, `bottom ${Math.round(done.y + done.height)} of ${height}`);
  check(closeEdit.y >= 0 && closeEdit.width >= 44 && closeEdit.height >= 44, `${name} · the edit sheet's close control stays on screen at 44 pt`, `${Math.round(closeEdit.width)}x${Math.round(closeEdit.height)} at y ${Math.round(closeEdit.y)}`);
  check((await page.getByRole('tab').count()) === 0, `${name} · the navigation steps aside for the edit sheet`);
  await page.getByTestId('halfway-edit-done').click(); await page.waitForTimeout(500);
  check((await page.getByRole('tab').count()) === 5, `${name} · and is back, all five tabs, afterwards`);
  await context.close();
}

for (const scale of SCALES) {
  console.log(`\n=== text x${scale} ===`);
  for (const size of SIZES) await scenario(size, scale);
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
