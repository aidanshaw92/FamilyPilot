/**
 * Renders Meet halfway v2 at real iPhone sizes against the realistic fixture server (stored catalogue rows, no Google) and
 * saves a screenshot of each screen and state, for comparison with the approved Figma frames.
 *
 * Serve first:
 *   FIXTURE_SCENARIO=realistic FIXTURE_CATALOGUE_ROWS=<rows.json> node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/capture-halfway-v2.mjs <baseUrl> <outDir> [widthxheight ...]   (default 393x852)
 */
import { chromium } from 'playwright';
import { routeBetweenAs } from './lib/place-provider.mjs';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const OUT = process.argv[3] ?? '/tmp/halfway-v2';
// "393x852" uses the iPhone Pro insets (47 / 34); "375x667@20,0" names them (an iPhone SE has a 20pt status bar and no home bar).
const SIZES = (process.argv.slice(4).length ? process.argv.slice(4) : ['393x852']).map((s) => {
  const [dims, insets] = s.split('@');
  const [w, h] = dims.split('x').map(Number);
  const [top, bottom] = insets ? insets.split(',').map(Number) : [47, 34];
  return [w, h, { top, bottom }];
});
mkdirSync(OUT, { recursive: true });

const PROFILE = {
  id: 'fam-halfway', parentName: 'Mina Test', members: [
    { id: 'p1', name: 'Mina Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-04-10', dobKnown: true, age: 3 } ],
  homeLocation: 'NW3', homeLatitude: 51.5540, homeLongitude: -0.1780, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const guest = (id, label, area, latitude, longitude, extra = {}) => ({ id: `guest-${id}`, label, area, latitude, longitude, ages: [], maxDriveMinutes: 60, pushchair: false, required: [], routines: [], ...extra });
const FAMILIES = [guest('kevin', 'Kevin', 'E8', 51.5450, -0.0600)];
const planning = (families) => JSON.stringify({ state: { families, options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 });

let INSETS = { top: 47, bottom: 34 };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function open(width, height, { families = FAMILIES, profile = PROFILE, block } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  await routeBetweenAs(page, 'osm'); // a Google place is never drawn on the app's own map (utils/map-compliance.ts); these captures are of the map's layout
  await page.clock.setFixedTime(new Date('2026-10-15T07:00:00'));
  // iPhone safe-area insets as real CSS (see audit-journey-phase2.mjs for why this is the method that works).
  await page.addInitScript((insets) => {
    const style = document.createElement('style');
    style.textContent = `div[style*="safe-area-inset"] { padding-top: ${insets.top}px !important; padding-bottom: ${insets.bottom}px !important; }`;
    const install = () => document.head?.appendChild(style);
    if (document.head) install(); else document.addEventListener('DOMContentLoaded', install);
  }, INSETS);
  if (block) await page.route(block, (route) => route.abort());
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); },
    { p: planning(families), f: JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  return { ctx, page };
}

for (const [width, height, insets] of SIZES) {
  INSETS = insets;
  const tag = `${width}`;
  const { ctx, page } = await open(width, height);
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
  await page.getByTestId('halfway-sheet-collapsed').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${tag}-1-map.png` });
  await page.getByTestId('halfway-map-pin-2').dispatchEvent('click'); await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${tag}-1b-map-pin2.png` });
  await page.getByTestId('halfway-details').click(); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${tag}-2-expanded.png` });
  await page.getByTestId('halfway-sheet-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${tag}-2c-expanded-scrolled.png` });
  await page.getByTestId('halfway-sheet-close').click(); await page.waitForTimeout(500);
  await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-3-list.png` });
  await page.getByTestId('halfway-edit').click(); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${tag}-4-edit.png` });
  await ctx.close();
  console.log(`captured ${tag}`);
}

// ---- the real-world states (393x852) --------------------------------------------------------------------------------
if (process.env.STATES) {
  const [w, h, firstInsets] = SIZES[0]; INSETS = firstInsets;
  const shot = (page, name) => page.screenshot({ path: `${OUT}/state-${name}.png` });
  const isBetween = (url) => /intent=between/.test(url);
  const isPlaces = (url) => /\/api\/places\//.test(url) && !/nearby-food/.test(url);
  const run = async (name, opts, act) => {
    const { ctx, page } = await open(w, h, opts);
    await act(page);
    await shot(page, name);
    await ctx.close();
    console.log(`state ${name}`);
  };

  await run('s1-missing-start', { profile: { ...PROFILE, homeLocation: '', homeLatitude: undefined, homeLongitude: undefined } }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  });
  await run('s2-nobody', { families: [] }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  });
  {
    const { ctx, page } = await open(w, h);
    await page.route((u) => isBetween(u.toString()), async (route) => { await new Promise((r) => setTimeout(r, 12000)); route.continue().catch(() => {}); });
    await page.goto(`${BASE}/halfway`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
    await shot(page, 's3-loading'); await ctx.close(); console.log('state s3-loading');
  }
  await run('s4-no-places', { families: [guest('kevin', 'Kevin', 'E8', 51.5450, -0.0600, { maxDriveMinutes: 0 })] }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(6000);
  });
  await run('s5-error', { block: (u) => isPlaces(u.toString()) }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.getByTestId('halfway-error').waitFor({ timeout: 25000 }).catch(() => console.log('  (no error state reached: Home list has its own offline fallback)')); await page.waitForTimeout(500);
  });
  // A family that shares ages, a must-have and a pushchair: the other family's chip becomes a grade, and a must-have nobody has
  // confirmed at a place is said on its card.
  const sharing = [guest('kevin', 'Kevin', 'E8', 51.5450, -0.0600, { ages: [3], pushchair: true, required: ['toilets'] })];
  await run('s7-cards-list', { families: sharing }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
    await page.getByTestId('halfway-mode-list').click({ timeout: 40000 }); await page.waitForTimeout(1200);
  });
  await run('s7b-expanded', { families: sharing }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
    await page.getByTestId('halfway-details').click({ timeout: 40000 }); await page.waitForTimeout(800);
    await page.getByTestId('halfway-sheet-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(500);
  });
  // A long name, with the stored place's name replaced in the lookup's answer (the fixture's data, not the app's).
  {
    const { ctx, page } = await open(w, h, { families: sharing });
    await page.route((u) => isBetween(u.toString()), async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (body.places?.[0]) { body.places[0].name = 'The Royal Air Force Museum London, Grahame Park Way'; body.places[0].category = 'museum'; }
      await route.fulfill({ response, json: body });
    });
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
    await page.getByTestId('halfway-sheet-collapsed').waitFor({ timeout: 40000 }); await page.waitForTimeout(1000);
    await shot(page, 's8-long-name-map');
    await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(900);
    await shot(page, 's8-long-name-list'); await ctx.close(); console.log('state s8');
  }
  await run('s6-fallback-list', { block: (u) => isBetween(u.toString()) }, async (page) => {
    await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
    await page.getByTestId('halfway-mode-list').click({ timeout: 40000 }); await page.waitForTimeout(1500);
  });
}
await browser.close();
