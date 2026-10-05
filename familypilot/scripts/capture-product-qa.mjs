/**
 * Captures the screens a parent actually uses, for one realistic family, at real phone sizes, from the exported web
 * bundle served by the fixture. Evidence for review, not an assertion: the assertions live in the verify-* scripts.
 *
 * Usage: node scripts/capture-product-qa.mjs <baseUrl> <outDir> [family] [widths]
 *   family: sloane-theo (default) | solo-toddler | no-names | teen
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const [, , BASE = 'http://localhost:4175', OUT = '/tmp/qa', FAMILY = 'sloane-theo', WIDTHS = '393'] = process.argv;
mkdirSync(OUT, { recursive: true });

const parent = { id: 'p1', name: 'Alex', role: 'parent', dateOfBirth: '1988-03-02', dobKnown: true, age: 38 };
const FAMILIES = {
  'sloane-theo': {
    members: [parent,
      { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2019-02-10', dobKnown: true, age: 7, mobility: ['walks'] },
      { id: 'c2', name: 'Theo', role: 'child', dateOfBirth: '2024-05-04', dobKnown: true, age: 2, ageMonths: null, mobility: ['buggy'] }],
    mustHaveFacilities: ['baby_changing'],
    routines: [{ id: 'r1', kind: 'nap', time: '12:45', durationMinutes: 90, atHome: true, childId: 'c2', label: '' }],
  },
  'solo-toddler': {
    members: [parent, { id: 'c1', name: 'Ada', role: 'child', dateOfBirth: '2024-09-01', dobKnown: true, age: 1, ageMonths: 13, mobility: ['carrier'] }],
    mustHaveFacilities: ['toilets', 'parking'], routines: [],
  },
  'no-names': {
    members: [parent, { id: 'c1', name: '', role: 'child', dateOfBirth: '2020-01-01', dobKnown: true, age: 6, mobility: ['walks'] }],
    mustHaveFacilities: [], routines: [],
  },
  teen: {
    members: [parent, { id: 'c1', name: 'Jonah', role: 'child', dateOfBirth: '2012-06-01', dobKnown: true, age: 14, mobility: ['walks'] }],
    mustHaveFacilities: [], routines: [],
  },
};
const f = FAMILIES[FAMILY];
const seed = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Alex Morgan', members: f.members, homeLocation: 'Islington, London',
      homeLatitude: 51.5362, homeLongitude: -0.103, budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 90,
      vehicle: null, pushchair: null, travelCot: null, memberships: [], routines: f.routines, mustHaveFacilities: f.mustHaveFacilities,
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 1,
};

const browser = await chromium.launch(launchOptions);
for (const w of WIDTHS.split(',').map(Number)) {
  const h = w === 360 ? 780 : w === 430 ? 932 : 852;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript((s) => localStorage.setItem('familypilot-family-v1', JSON.stringify(s)), seed);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="recommendation-deck"]', { timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${FAMILY}-home-${w}.png` });
  // venue detail
  await page.locator('[role="button"][aria-label$=", see more"]').first().click();
  await page.waitForSelector('[data-testid="family-match-card"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${FAMILY}-venue-top-${w}.png` });
  const scroller = page.locator('[data-testid="family-match-card"]');
  await scroller.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${FAMILY}-venue-match-${w}.png` });
  await page.evaluate(() => { const el = document.querySelector('[data-testid="family-essentials"]'); el?.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${FAMILY}-venue-essentials-${w}.png` });
  await page.evaluate(() => { const el = document.querySelector('[data-testid="restaurants-close-by"]'); el?.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${FAMILY}-venue-food-${w}.png` });
  await page.evaluate(() => { const el = document.querySelector('[data-testid="evidence-section"]'); el?.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${FAMILY}-venue-evidence-${w}.png` });
  await context.close();
}
await browser.close();
console.log('captured', OUT);
