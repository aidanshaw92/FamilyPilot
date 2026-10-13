/**
 * The screens PR #197 added or changed, at larger text, in a real browser: Home with an "Up next" row, Venue with Create a plan pinned,
 * the Create a plan sheet with "How long" on one line, the built plan, and Plans with a saved plan.
 *
 * METHOD, said plainly: a browser emulation of iOS content-size multipliers (scripts/lib/large-text.mjs), NOT Dynamic Type and NOT a
 * device. It measures horizontal overflow, clipped or truncated text, controls under 44 pt or covered, overlaps, the five tabs, and that
 * the page's last control clears the navigation. The invitation screens need an account (the fixture build), so they are covered at
 * normal size by verify-shared-outing.mjs and are on the real-device list.
 *
 * Serve first: FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4173 dist
 * Usage: node scripts/verify-release-large-text.mjs <baseUrl> <outDir> [scale ...]   (default 1.35 1.9 2.35)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

import { analyse, installTextScale } from './lib/large-text.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? '/tmp/release-large-text';
const SCALES = (process.argv.slice(4).length ? process.argv.slice(4) : ['1.35', '1.9', '2.35']).map(Number);
const SIZES = [{ tag: '393', width: 393, height: 852, insets: { top: 47, bottom: 34 } }, { tag: '375', width: 375, height: 667, insets: { top: 20, bottom: 0 } }];
mkdirSync(OUT, { recursive: true });

const PROFILE = {
  id: 'fam-lt', parentName: 'Sarah Test', members: [
    { id: 'p1', name: 'Sarah Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2023-04-10', dobKnown: true, age: 3 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2026-02-22', dobKnown: true, age: 0, ageMonths: 7 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.539, homeLongitude: -0.142, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const PLANNING = { state: { families: [], options: { date: '2026-10-14', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };
const FAMILY = JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 });

let failed = 0;
const results = {};
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const settle = async (page, ms = 1500) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };

// One saved plan, made through the real screens at normal size, so every larger-text run starts from a real stored day.
let planningWithPlan = null;
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-14T07:30:00'));
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: FAMILY });
  await page.goto(`${BASE}/explore`); await settle(page, 2200);
  await page.getByText(/View (family )?details/).first().click(); await settle(page, 1800);
  await page.getByTestId('venue-create-plan').click(); await page.waitForTimeout(900);
  await page.getByTestId('create-plan-submit').click();
  await page.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 }); await settle(page, 800);
  await page.getByTestId('plan-save').click(); await settle(page, 1200);
  planningWithPlan = await page.evaluate(() => localStorage.getItem('familypilot-planning-v1'));
  await ctx.close();
  check(Boolean(planningWithPlan) && JSON.parse(planningWithPlan).state.savedDays.length === 1, 'setup: one saved plan made through the real screens');
}

async function scenario({ tag, width, height, insets }, scale) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-14T07:30:00'));
  await page.addInitScript(installTextScale, { scale, insets });
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: planningWithPlan, f: FAMILY });
  const name = `${tag}@${scale}`;
  const shot = (s) => page.screenshot({ path: join(OUT, `${tag}-x${scale}-${s}.png`) });
  const report = async (screen, tabbar) => {
    const found = await page.evaluate(analyse, { width, height, tabbar });
    results[`${name} · ${screen}`] = found;
    check(found.length === 0, `${name} · ${screen}`, found.slice(0, 3).join(' | '));
  };

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  check((await page.getByTestId('home-up-next').count()) === 1, `${name} · Home shows the Up next row`);
  await shot('home'); await report('Home with Up next', true);
  // Reachability: the recommendation's button can be scrolled to and clears the navigation.
  await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, 4000); await page.waitForTimeout(600);
  await shot('home-end');
  await report('Home scrolled to the end', true);
  await page.getByTestId('home-up-next').scrollIntoViewIfNeeded().catch(() => {});

  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await settle(page, 2200);
  await page.getByText(/View (family )?details/).first().click(); await settle(page, 2000);
  const bar = page.getByTestId('venue-create-plan');
  await bar.waitFor({ timeout: 15000 });
  const box = await bar.boundingBox();
  check(Boolean(box) && box.y + box.height <= height + 1, `${name} · Create a plan is pinned and on screen`, box ? `bottom ${Math.round(box.y + box.height)} of ${height}` : 'missing');
  await shot('venue'); await report('Venue with the pinned action', false);
  // Scrolled to the end of the page, the last content is clear of the bar.
  await page.mouse.move(width / 2, height / 3); await page.mouse.wheel(0, 8000); await page.waitForTimeout(800);
  await shot('venue-end'); await report('Venue scrolled to the end', false);

  await bar.click(); await page.waitForTimeout(1000);
  await shot('sheet'); await report('Create a plan sheet', false);
  await page.getByTestId('plan-length-change').click().catch(() => {}); await page.waitForTimeout(500);
  await shot('sheet-length'); await report('Create a plan sheet with the length choices open', false);
  await page.getByTestId('create-plan-submit').click();
  await page.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 }); await settle(page, 800);
  await shot('plan'); await report('the built plan', false);

  try {
    await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
    await shot('plans'); await report('Plans with a saved plan', true);
    await page.getByTestId('plans-saved-days').getByRole('button').first().click({ timeout: 8000 }); await settle(page, 2200);
    await shot('saved-plan'); await report('the saved plan', false);
  } catch (e) {
    check(false, `${name} · Plans and the saved plan could not be reached`, String(e.message).split('\n')[0]);
  }
  await ctx.close();
  writeFileSync(join(OUT, 'findings.json'), JSON.stringify(results, null, 1));
}

const only = process.env.ONLY_TAG;
for (const scale of SCALES) for (const size of SIZES) if (!only || size.tag === only) await scenario(size, scale);
await browser.close();
writeFileSync(join(OUT, 'findings.json'), JSON.stringify(results, null, 1));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
