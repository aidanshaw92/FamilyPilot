/**
 * Together at larger text, in a real browser: the title and switch, Your families (with families on this phone, and the first
 * visit), Meet halfway, and the five tabs.
 *
 * METHOD, said plainly: a browser emulation of iOS content-size multipliers (scripts/lib/large-text.mjs), NOT Dynamic Type and NOT a
 * device. It measures horizontal overflow, clipped or truncated text, controls under 44 pt or covered, overlaps, the five tabs and
 * that the page's last control clears the navigation.
 *
 * Serve first: FIXTURE_SCENARIO=realistic FIXTURE_CATALOGUE_ROWS=<rows.json> node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/verify-together-large-text.mjs <baseUrl> <outDir> [scale ...]   (default 1.35 1.9 2.35)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { analyse, installTextScale } from './lib/large-text.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const OUT = process.argv[3] ?? '/tmp/together-large-text';
const SCALES = (process.argv.slice(4).length ? process.argv.slice(4) : ['1.35', '1.9', '2.35']).map(Number);
const SIZES = [{ tag: '393', width: 393, height: 852, insets: { top: 47, bottom: 34 } }, { tag: '375', width: 375, height: 667, insets: { top: 20, bottom: 0 } }];
mkdirSync(OUT, { recursive: true });
const PROFILE = { id: 'fam-lt', parentName: 'Sarah Test', members: [
  { id: 'p1', name: 'Sarah Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
  { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2023-04-10', dobKnown: true, age: 3 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.539, homeLongitude: -0.142, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const emma = { id: 'guest-emma', label: 'Emma', area: 'Walthamstow', latitude: 51.5850, longitude: -0.0200, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] };
const hannah = { id: 'guest-hannah', label: 'Hannah', area: 'Lewisham', latitude: 51.4600, longitude: -0.0100, ages: [2], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] };
const FAMILY = JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 });
const planning = (families) => JSON.stringify({ state: { families, options: { leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 });

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function scenario({ tag, width, height, insets }, scale) {
  const name = `${tag}@${scale}`;
  const open = async (families, path) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date('2026-10-13T07:00:00'));
    await page.addInitScript(installTextScale, { scale, insets });
    await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: planning(families), f: FAMILY });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
    return { ctx, page };
  };
  const report = async (page, screen) => {
    const found = await page.evaluate(analyse, { width, height, tabbar: true });
    check(found.length === 0, `${name} · ${screen}`, found.slice(0, 3).join(' | '));
  };

  // Your families, with two families on this phone
  {
    const { ctx, page } = await open([emma, hannah], '/together?view=families');
    await page.screenshot({ path: join(OUT, `${tag}-x${scale}-families.png`) });
    await report(page, 'Your families');
    const sw = await page.getByTestId('together-switch').boundingBox();
    check(sw && sw.x >= 0 && sw.x + sw.width <= width + 0.5, `${name} · the switch is inside the screen`, sw ? `${Math.round(sw.x)}..${Math.round(sw.x + sw.width)}` : 'missing');
    for (const key of ['halfway', 'families']) {
      const seg = await page.getByTestId(`together-view-${key}`).boundingBox();
      check(seg.height >= 44, `${name} · the ${key} segment is at least 44 tall`, `${Math.round(seg.height)}`);
      const clipped = await page.getByTestId(`together-view-${key}`).evaluate((el) => [...el.querySelectorAll('*')].some((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible'));
      check(!clipped, `${name} · the ${key} label is not clipped`);
    }
    // Scroll to the end: the last control clears the bar.
    await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, 6000); await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${tag}-x${scale}-families-end.png`) });
    await report(page, 'Your families, scrolled to the end');
    // Larger text: Together's label still whole, and the five tabs are all there
    const lab = await page.getByTestId('tab-label-together').evaluate((el) => ({ w: el.scrollWidth, cw: el.clientWidth, size: parseFloat(getComputedStyle(el).fontSize) }));
    check(lab.w <= lab.cw + 1, `${name} · the Together tab label is whole (${lab.size.toFixed(1)}pt in a 62pt tab)`, JSON.stringify(lab));
    await ctx.close();
  }
  // First visit
  {
    const { ctx, page } = await open([], '/together');
    await page.screenshot({ path: join(OUT, `${tag}-x${scale}-first-visit.png`) });
    await report(page, 'Your families, first visit');
    await ctx.close();
  }
  // Meet halfway under the switch
  {
    const { ctx, page } = await open([emma], '/together');
    await page.getByTestId('halfway-plan').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.screenshot({ path: join(OUT, `${tag}-x${scale}-halfway.png`) });
    await report(page, 'Meet halfway');
    await ctx.close();
  }
}

for (const size of SIZES) for (const scale of SCALES) await scenario(size, scale);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
