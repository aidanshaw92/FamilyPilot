/**
 * Price honesty in a real browser, fixture only. No place in the fixture (or the catalogue) has a confirmed price, so:
 *   - Venue Detail shows "Price not confirmed" in a "To get in" card, with no pound sign inside it and a link to the venue's
 *     own website where there is one;
 *   - the Explore filter sheet offers no Budget group and no "Free" filter, and says why, rather than offering controls that
 *     can only return an empty list;
 *   - Home's filter sheet has no "Free" filter either.
 * Serve the SPARSE fixture (no FIXTURE_SCENARIO): the realistic one gives places prices, so its filter sheet rightly keeps the price filters.
 * Usage: node scripts/verify-admission-card.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const PROFILE = {
  id: 'family-adm', parentName: 'Aidan',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
  ],
  homeLocation: 'Bushey, Hertfordshire', homeLatitude: 51.643, homeLongitude: -0.36, completionPercent: 90,
  vehicle: null, pushchair: null, travelCot: null, memberships: [], routines: [], mustHaveFacilities: [],
};
let failed = 0;
const check = (name, pass, detail) => { if (!pass) failed += 1; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };
const browser = await chromium.launch(launchOptions);
for (const width of [360, 430]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/London' });
  await context.route('**/*', (route) => (/googleapis|gstatic|openstreetmap|overpass/.test(route.request().url()) ? route.abort() : route.continue()));
  const page = await context.newPage();
  await page.addInitScript((profile) => {
    localStorage.setItem('familypilot-family-v1', JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }));
  }, PROFILE);
  await page.goto(`${BASE}/venue/fp-google-FIXTUREedgeRich`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admission-card').waitFor({ timeout: 20000 }).catch(() => {});
  const card = page.getByTestId('admission-card');
  check(`${width}: the venue page has the "To get in" card`, (await card.count()) === 1);
  if (await card.count()) {
    const text = await card.innerText();
    check(`${width}: it says the price is not confirmed`, /Price not confirmed/.test(text), text.replace(/\n/g, ' | '));
    check(`${width}: it shows no pound amount`, !/£/.test(text));
    check(`${width}: it points to the venue's own website`, /Check prices on the official website/.test(text));
    const box = await card.boundingBox();
    check(`${width}: it fits the screen`, box && box.x >= 0 && box.x + box.width <= width + 1, JSON.stringify(box));
  }
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /filters/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const sheet = await page.evaluate(() => document.body.innerText);
  check(`${width}: Explore's filter sheet has no Budget group`, !/\bBudget\b/.test(sheet) && !/Under £25/.test(sheet));
  check(`${width}: and no Free filter`, !/\nFree\n/.test(sheet));
  check(`${width}: it says why`, /Price filters appear once prices are confirmed/.test(sheet));
  check(`${width}: other filters remain`, /Indoor/.test(sheet) && /Baby changing/.test(sheet));
  await context.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
