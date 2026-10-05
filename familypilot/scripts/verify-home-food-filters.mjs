/**
 * Home's "Food nearby" filters, in a real browser, against the realistic fixture where only a few venues carry a stored
 * food lookup: the filter keeps places KNOWN to have food, lists the unchecked ones separately, shows a filter-active dot,
 * and the two empty states ("No match" vs "haven't checked") say different things.
 *
 * Usage: node scripts/verify-home-food-filters.mjs [baseUrl] [shotDir]   (realistic fixture, e.g. port 4175)
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://localhost:4175';
const SHOTS = process.argv[3] ?? null;

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan Shaw',
      members: [
        { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 },
      ],
      homeLocation: 'Manchester', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 80,
      vehicle: 'Volvo XC60', pushchair: 'Bugaboo Fox', travelCot: null, memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
};

let failed = 0;
const check = (name, pass, detail) => { if (!pass) failed += 1; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };
const body = (page) => page.evaluate(() => document.body.innerText);

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript((seed) => localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), FAMILY_STATE);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

check('no filter dot before any filter is chosen', (await page.getByTestId('filter-active-dot').count()) === 0);
await page.getByRole('button', { name: 'Filters' }).first().click();
await page.waitForTimeout(700);
const sheet = await body(page);
check('Home’s filter sheet has the Food nearby group', /Food nearby/.test(sheet) && /Café on site/.test(sheet) && /Food within 5 min walk/.test(sheet));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-filter-sheet-food.png` });
await page.getByText('Food within 5 min walk', { exact: true }).click();
await page.getByText('Café on site', { exact: true }).click();
await page.getByRole('button', { name: /show results|apply/i }).first().click();
await page.waitForTimeout(1200);
const filtered = await body(page);
check('Home shows a filter-active dot once a filter is on', (await page.getByTestId('filter-active-dot').count()) >= 1);
check('Home keeps the deck: a venue known to have food is shown', /Hollybank Gardens|See more/.test(filtered));
check('Home does not claim the unchecked places have no food', !/no food|nowhere to eat/i.test(filtered));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-food-filtered.png` });

// Nothing in the area has been looked up: strip every stored food lookup from the API response. The honest empty state
// is "not checked", never "nothing matches".
await page.getByRole('button', { name: /clear filters/i }).count();
const bare = await browser.newContext({ viewport: { width: 390, height: 844 } });
const bp = await bare.newPage();
await bp.addInitScript((seed) => localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), FAMILY_STATE);
await bp.route('**/api/places/search**', async (route) => {
  const res = await route.fetch();
  const json = await res.json();
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) if (k !== 'foodNearby') o[k] = strip(val);
      if (Array.isArray(o.facilities)) o.facilities = o.facilities.filter((f) => f !== 'cafe');
      return o;
    }
    return v;
  };
  await route.fulfill({ response: res, json: strip(json) });
});
await bp.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await bp.waitForTimeout(3000);
await bp.getByRole('button', { name: 'Filters' }).first().click();
await bp.waitForTimeout(600);
await bp.getByText('Food within 5 min walk', { exact: true }).click();
await bp.getByRole('button', { name: /show results|apply/i }).first().click();
await bp.waitForTimeout(1200);
const empty = await body(bp);
check('with no food lookups at all, Home shows an empty state', /No place is known to match yet/.test(empty));
check('it says the places are not checked, and that this is not a “no”', /haven’t been checked for food nearby/.test(empty) && /aren’t a “no”/.test(empty), (empty.match(/No place is known.{0,220}/s) ?? [''])[0].replace(/\n/g, ' '));
check('it never says there is no food', !/no food|nowhere to eat|nothing matches/i.test(empty));
if (SHOTS) await bp.screenshot({ path: `${SHOTS}/home-food-empty-unchecked.png` });
await bp.getByRole('button', { name: /clear filters/i }).first().click();
await bp.waitForTimeout(1000);
const after = await body(bp);
check('Clear filters brings the deck back and removes the dot', (await bp.getByTestId('filter-active-dot').count()) === 0 && !/No place is known/.test(after) && /See more/.test(after));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
