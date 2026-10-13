/**
 * Five tabs, one of them Together: the navigation, the two views behind its switch, and what must keep working from the six-tab
 * app (the /halfway and /families addresses, a family card's Meet halfway, Back, and a tab keeping its place). Fixture data, a real
 * browser, the exported bundle.
 *
 * Serve first: FIXTURE_SCENARIO=realistic FIXTURE_CATALOGUE_ROWS=<rows.json> node scripts/serve-places-fixture.mjs 4175 <dist>
 * Usage: node scripts/verify-together-tabs.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PROFILE = { id: 'fam-h', parentName: 'Mina Test', members: [
  { id: 'p1', name: 'Mina Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
  { id: 'c1', name: 'Kid One', role: 'child', dateOfBirth: '2023-04-10', dobKnown: true, age: 3 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.5390, homeLongitude: -0.1420, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const emma = { id: 'guest-emma', label: 'Emma', area: 'Walthamstow', latitude: 51.5850, longitude: -0.0200, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] };
const hannah = { id: 'guest-hannah', label: 'Hannah', area: 'Lewisham', latitude: 51.4600, longitude: -0.0100, ages: [2], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] };

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function open(families, width = 393, height = 852) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-13T07:00:00'));
  const planning = { state: { families, options: { leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(planning), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  return { ctx, page, errors };
}
const settle = (page, ms = 2500) => page.waitForTimeout(ms);
const flat = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const view = async (page) => (await page.getByTestId('together-view-halfway').getAttribute('aria-checked')) === 'true' ? 'halfway' : 'families';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const tabs = (page) => page.locator('[role=tab]').evaluateAll((els) => els.map((e) => ({ name: e.getAttribute('aria-label'), selected: e.getAttribute('aria-selected') === 'true', w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), right: Math.round(e.getBoundingClientRect().right), left: Math.round(e.getBoundingClientRect().left) })));

// ------------------------------------------------------------------ 1. the bar: five tabs, labelled, on every phone width
console.log('The bar');
for (const width of [320, 360, 375, 393, 430]) {
  const { ctx, page, errors } = await open([emma], width);
  await page.goto(`${BASE}/together`, { waitUntil: 'networkidle' }); await settle(page, 1500);
  const t = await tabs(page);
  check(t.map((x) => x.name).join(',') === 'Home,Explore,Together,Plans,Profile', `${width}pt: the five tabs are Home, Explore, Together, Plans, Profile`, t.map((x) => x.name).join(','));
  check(t.every((x) => x.w >= 62 && x.h >= 66), `${width}pt: each tab is at least 62 x 66 (touch target 44)`, JSON.stringify(t.map((x) => [x.w, x.h])));
  check(t[0].left >= 0 && t[4].right <= width, `${width}pt: the whole bar is on screen`, `${t[0].left}..${t[4].right}`);
  check(t.find((x) => x.name === 'Together')?.selected === true, `${width}pt: Together is the selected tab`);
  const label = await page.getByTestId('tab-label-together').evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), w: el.scrollWidth, cw: el.clientWidth }));
  check(label.size === 11 && label.w <= label.cw, `${width}pt: labels are 11pt and are not cut`, JSON.stringify(label));
  check(errors.length === 0, `${width}pt: no page errors`, errors.join('; '));
  if (width === 393 || width === 320) await shot(page, `together-meet-halfway-${width}`);
  await ctx.close();
}

// ------------------------------------------------------------------ 2. which view opens
console.log('Which view opens');
{
  const a = await open([emma]);
  await a.page.goto(`${BASE}/together`, { waitUntil: 'networkidle' }); await settle(a.page);
  check(await view(a.page) === 'halfway', 'with a family to meet (on this phone), Together opens on Meet halfway');
  check((await flat(a.page)).includes('You + Emma’s family'), 'it opens on an answer for that family, one tap from the tab');
  await a.ctx.close();
  const b = await open([]);
  await b.page.goto(`${BASE}/together`, { waitUntil: 'networkidle' }); await settle(b.page, 1500);
  check(await view(b.page) === 'families', 'with nobody to meet, Together opens on Your families');
  const text = await flat(b.page);
  check(text.includes('Plan days out with friends') && await b.page.getByTestId('families-add-postcode').count() === 1, 'a first visit says what the tab is for and offers Add a family by postcode');
  check(!text.includes('Invite a family') || text.includes('Inviting needs an account'), 'without an account it does not offer an invitation it could not make');
  await shot(b.page, 'together-first-visit');
  await b.ctx.close();
}

// ------------------------------------------------------------------ 3. the switch, Back, and a family card's Meet halfway
console.log('Switch, links and Back');
{
  const { ctx, page, errors } = await open([emma, hannah]);
  await page.goto(`${BASE}/together`, { waitUntil: 'networkidle' }); await settle(page);
  check(await view(page) === 'halfway', 'two families: opens on Meet halfway');
  const tabsBefore = (await tabs(page)).map((x) => x.name).join();
  const histBefore = await page.evaluate(() => history.length);
  await page.getByTestId('together-view-families').click(); await settle(page, 1200);
  check(await view(page) === 'families', 'the switch shows Your families');
  check(path(page).includes('view=families'), 'the address says which view', path(page));
  check((await page.evaluate(() => history.length)) === histBefore, 'switching views does not add a history entry (it is a way of looking, not a place)', `${histBefore} -> ${await page.evaluate(() => history.length)}`);
  check((await tabs(page)).map((x) => x.name).join() === tabsBefore && (await tabs(page)).find((x) => x.selected)?.name === 'Together', 'the tab bar and its selection do not move');
  const t1 = await flat(page);
  check(t1.includes('On this phone only') && t1.includes('Emma’s family') && t1.includes('Hannah’s family'), 'Your families lists both families, under "On this phone only"');
  check(t1.includes('not connected'), 'a family on this phone is said to be not connected');
  check(!/connected family\b.*Emma/i.test(t1.replace(/On this phone only.*/, '')), 'a family on this phone is not listed as connected');
  await shot(page, 'together-your-families-local');
  // The family card's Meet halfway: stays in Together, with that family chosen, and adds no history entry
  const histMid = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Meet halfway' }).nth(1).click(); await settle(page, 2500);
  check(await view(page) === 'halfway' && path(page).startsWith('/together'), 'a family card’s Meet halfway stays inside Together', path(page));
  check((await tabs(page)).find((x) => x.selected)?.name === 'Together', 'the highlighted tab is still Together (it used to jump to another tab)');
  check((await flat(page)).includes('You + Hannah’s family'), 'it opens with that family chosen');
  check((await flat(page)).includes('this phone only'), 'Meet halfway says the family is on this phone only');
  check((await page.evaluate(() => history.length)) === histMid, 'and adds no history entry', `${histMid} -> ${await page.evaluate(() => history.length)}`);
  await page.getByTestId('together-view-families').click(); await settle(page, 1200);
  check(await view(page) === 'families', 'the switch is the way back to Your families');
  await ctx.close();
}
// Back leaves Together to where the parent came from, however many times the view was switched.
{
  const { ctx, page } = await open([emma, hannah]);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await settle(page, 2000);
  await page.getByRole('tab', { name: 'Together' }).click(); await settle(page, 2500);
  check(path(page).startsWith('/together'), 'Together opens from Home with one tap on its tab', path(page));
  await page.getByTestId('together-view-families').click(); await settle(page, 800);
  await page.getByRole('button', { name: 'Meet halfway' }).nth(1).click(); await settle(page, 1500);
  await page.getByTestId('together-view-families').click(); await settle(page, 800);
  await page.goBack(); await settle(page, 2000);
  check(new URL(page.url()).pathname === '/', 'one Back returns to Home after switching views three times', path(page));
}
{
  const { ctx, page, errors } = await open([emma]);
  await page.goto(`${BASE}/together`, { waitUntil: 'networkidle' }); await settle(page);
  check(errors.length === 0, 'no page errors', errors.join('; '));
  await ctx.close();
}

// ------------------------------------------------------------------ 4. old addresses
console.log('Old addresses');
{
  const { ctx, page } = await open([emma, hannah]);
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await settle(page);
  check(path(page).startsWith('/together') && await view(page) === 'halfway', '/halfway lands on Together, Meet halfway', path(page));
  await page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'networkidle' }); await settle(page);
  check(await view(page) === 'halfway' && (await flat(page)).includes('You + Hannah’s family'), '/halfway?family=… lands on Meet halfway with that family chosen', path(page));
  await page.goto(`${BASE}/families`, { waitUntil: 'networkidle' }); await settle(page, 1500);
  check(path(page).startsWith('/together') && await view(page) === 'families', '/families lands on Together, Your families', path(page));
  check((await tabs(page)).find((x) => x.selected)?.name === 'Together', 'and the Together tab is the one highlighted');
  await ctx.close();
}

// ------------------------------------------------------------------ 5. a tab keeps its place, and other tabs are one tap
console.log('Tab selection');
{
  const { ctx, page } = await open([emma]);
  await page.goto(`${BASE}/together?view=families`, { waitUntil: 'networkidle' }); await settle(page, 1500);
  await page.getByRole('tab', { name: 'Explore' }).click(); await settle(page, 1500);
  check(path(page).startsWith('/explore'), 'Explore is one tap from Together', path(page));
  await page.getByRole('tab', { name: 'Together' }).click(); await settle(page, 1500);
  check(path(page).startsWith('/together') && await view(page) === 'families', 'coming back to Together finds the view that was left', path(page));
  const count = (await tabs(page)).length;
  await page.getByRole('tab', { name: 'Together' }).click(); await settle(page, 600);
  check(await view(page) === 'families' && (await tabs(page)).length === count, 'tapping the selected tab again changes nothing');
  await page.getByRole('tab', { name: 'Plans' }).click(); await settle(page, 1200);
  check(path(page).startsWith('/trips'), 'Plans is one tap from Together');
  await page.getByRole('tab', { name: 'Home' }).click(); await settle(page, 1200);
  check(new URL(page.url()).pathname === '/', 'Home is one tap from Together');
  await ctx.close();
}

// ------------------------------------------------------------------ 6. Meet halfway is unchanged under the switch
console.log('Meet halfway under the switch');
{
  const { ctx, page } = await open([emma]);
  await page.goto(`${BASE}/together`, { waitUntil: 'networkidle' }); await settle(page);
  await page.getByTestId('halfway-plan').first().waitFor({ timeout: 20000 });
  check(true, 'Plan this day is on screen at once (one tap from the tab to a recommendation)');
  await page.getByTestId('halfway-edit').click(); await settle(page, 800);
  check((await page.getByTestId('halfway-local-note').count()) === 1, 'the edit sheet says Emma’s family is on this phone only and cannot receive a plan until connected');
  check((await page.getByRole('tab').count()) === 0, 'the navigation steps aside for the edit sheet');
  await page.getByTestId('halfway-edit-done').click(); await settle(page, 800);
  check((await page.getByRole('tab').count()) === 5, 'and returns when it closes');
  await page.getByTestId('halfway-mode-list').click(); await settle(page, 800);
  check((await page.getByTestId('halfway-list').count()) === 1, 'the list view works');
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
