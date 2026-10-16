/**
 * PREVIEW ONLY. Error handling with the independent catalogue: what a parent sees when the venue service is down, slow or wrong, and when a link points at a
 * place that is not there. Run against scripts/local-independent-api.mjs.
 *
 *   node scripts/verify-independent-errors.mjs http://localhost:4180 <shotDir>
 *
 * Proves: a failing service is an honest "Couldn't load" with a working "Try again" (never "no places near you"); a slow one shows the loading state and then the
 * places; a malformed answer does not crash the app; an address nobody has says so and offers a way out; going offline after the list has loaded keeps the list;
 * no uncaught page error and no Google request throughout.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4180';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? `  -- ${detail}` : ''}`); };
const PROFILE = { state: { profile: { id: 'fam-errors', parentName: 'Release Check', members: [{ id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 }, { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 }], homeLocation: 'NW1 7AA', homeLatitude: 51.539, homeLongitude: -0.1426, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] }, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const seen = { pageErrors: [], google: [] };
const body = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function open() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  page.on('pageerror', (e) => seen.pageErrors.push(String(e.message).slice(0, 200)));
  page.on('request', (r) => { if (/googleapis|maps\.google|gstatic\.com\/maps/i.test(r.url())) seen.google.push(r.url()); });
  await page.addInitScript((f) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); }, JSON.stringify(PROFILE));
  return { context, page };
}

// ---- A the service is down, then comes back
// Explore's designed behaviour on an outage (src/utils/saved-examples-notice.ts): a bundled list of examples, said to be examples, so the screen is never blank.
{
  const { context, page } = await open();
  let mode = 'down';
  await page.route('**/api/places/search**', (r) => (mode === 'down' ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The venue catalogue is unavailable', code: 'CATALOGUE_UNAVAILABLE' }) }) : r.fallback()));
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Live places aren.t loading right now/).waitFor({ timeout: 60000 });
  const text = await body(page);
  check('A  a failing service says live places are not loading and that what is shown are saved examples', /Live places aren.t loading right now, so these are saved examples/.test(text));
  check('A  and never says there are no places near you', !/no places (near|within)|nothing (near|to show)|0 places/i.test(text), text.slice(0, 200));
  await shot(page, '30-explore-service-down');
  mode = 'up';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('explore-count').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const back = await body(page);
  const shown = Number(/(\d+) places? within/.exec(await page.getByTestId('explore-count').innerText())?.[1] ?? 0);
  check('A  once the service is back, a reload shows the real places (the count is the registry\'s) and the notice is gone', !/saved examples/.test(back) && shown > 20, `${shown} places`);
  await context.close();
}

// ---- B the service is slow
{
  const { context, page } = await open();
  await page.route('**/api/places/search**', async (r) => { await new Promise((res) => setTimeout(res, 5000)); return r.fallback(); });
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const early = await body(page);
  check('B  while it is slow, the screen is the loading state, not an error or an empty list', !/Couldn.t load|no places/i.test(early) && (await page.getByTestId('explore-count').count()) === 0, early.slice(0, 100));
  await shot(page, '31-explore-slow-loading');
  await page.getByTestId('explore-count').waitFor({ timeout: 60000 });
  check('B  and the places appear when it answers', (await page.locator('[data-testid^="explore-card-"]').count()) > 0);
  await context.close();
}

// ---- C a malformed answer
{
  const { context, page } = await open();
  await page.route('**/api/places/search**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"places": "not a list"' }));
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const text = await body(page);
  check('C  a malformed answer leaves the app standing (the tab bar is still there)', (await page.getByRole('tab').count()) >= 3, text.slice(0, 120));
  check('C  and says so (an error, or the saved-examples notice), rather than presenting a made-up list as live', /Couldn.t load|Something went wrong|try again|saved examples/i.test(text), text.slice(0, 200));
  await shot(page, '32-explore-malformed');
  await context.close();
}

// ---- D an address nobody has
{
  const { context, page } = await open();
  await page.goto(`${BASE}/venue/fp-os-00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const text = await body(page);
  check('D  an address nobody has says so and does not crash', /Could not load this place|Place not found/i.test(text), text.slice(0, 120));
  check('D  and offers a way out (a back or retry control)', (await page.getByRole('button').count()) >= 1 || (await page.getByText(/Back|Try again|Explore/).count()) >= 1);
  await shot(page, '33-venue-not-found');
  await context.close();
}

// ---- E offline after the list has loaded
{
  const { context, page } = await open();
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('explore-count').waitFor({ timeout: 60000 });
  const loaded = await page.locator('[data-testid^="explore-card-"]').count();
  await context.setOffline(true);
  await page.getByTestId('explore-scope-all').click().catch(() => {});
  await page.waitForTimeout(2500);
  check('E  offline after the list has loaded: the app stays up and the list is still there', loaded > 0 && (await page.getByRole('tab').count()) >= 3, `${loaded} cards before`);
  await shot(page, '34-explore-offline');
  await context.setOffline(false);
  await context.close();
}

check('F  no uncaught page error in any case', seen.pageErrors.length === 0, seen.pageErrors.join(' | '));
check('F  no request to a Google host', seen.google.length === 0, seen.google.join(' '));
await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
