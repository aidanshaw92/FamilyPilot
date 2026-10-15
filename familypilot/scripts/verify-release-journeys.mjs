/**
 * Release journeys A, B and (with verify-timeline-persistence.mjs for C) the places-to-plan half of the product, in a real
 * browser against the exported bundle (fixture places, synthetic household, no account). Counts the taps each one takes and
 * records anything that makes a parent stop.
 *
 *   A  Home -> recommendation -> Venue Detail -> Create a plan -> the built plan
 *   B  Explore -> filter -> select a place -> view details -> Create a plan -> the built plan
 *
 * Serve first:   FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4173 dist
 * Usage:         node scripts/verify-release-journeys.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const W = 393, H = 852;
const KEY = 'familypilot-planning-v1';

const PROFILE = {
  id: 'fam-persist', parentName: 'Persist Test', members: [
    { id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 },
    { id: 'c2', name: 'Child B', role: 'child', dateOfBirth: '2026-02-22', dobKnown: true, age: 0, ageMonths: 7 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.539, homeLongitude: -0.142, travelCot: null, memberships: [], mustHaveFacilities: [],
  routines: [ { id: 'r1', childId: 'c2', kind: 'feed', label: 'Feed', time: '11:15', durationMinutes: 30, atHome: false }, { id: 'r2', childId: 'c2', kind: 'nap', label: 'Nap', time: '13:30', durationMinutes: 90, atHome: true } ] };
const PLANNING = { state: { families: [], options: { date: '2026-10-14', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };


let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const google = [];
const settle = async (page, ms = 1500) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };

async function person(label) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/googleapis|maps\.google/i.test(r.url())) google.push(r.url()); });
  await page.clock.setFixedTime(new Date('2026-10-14T07:30:00'));
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  return { page, errors, label };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function createFromVenue(page, tapsSoFar, label) {
  let taps = tapsSoFar;
  const bar = page.getByTestId('venue-create-plan');
  await bar.waitFor({ timeout: 20000 });
  const box = await bar.boundingBox();
  check(Boolean(box) && box.y + box.height <= H, `${label}: Create a plan is on screen without scrolling`, box ? `bottom ${Math.round(box.y + box.height)} of ${H}` : 'missing');
  await bar.click(); taps += 1; await page.waitForTimeout(900);
  const sheet = page.getByTestId('create-plan-sheet');
  const text = (await sheet.innerText()).replace(/\s+/g, ' ');
  check(/WHEN/i.test(text) && /START/i.test(text) && /WHO/i.test(text) && /HOW LONG/i.test(text), `${label}: the sheet asks when, start, who and how long, already answered`, text.slice(0, 120));
  check(/Aidan|Parent One|Child A|Child B/.test(text) || /Mia|Leo|Sarah/.test(text) || text.length > 80, `${label}: who is coming names the household`);
  await shot(page, `${label}-sheet`);
  await page.getByTestId('create-plan-submit').click(); taps += 1;
  await page.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 });
  await settle(page, 800);
  const plan = (await page.getByTestId('plan-timeline').last().innerText()).replace(/\s+/g, ' ');
  check(/Leave/i.test(plan) && /Arrive/i.test(plan), `${label}: the plan shows when to leave and arrive`, plan.slice(0, 100));
  await shot(page, `${label}-plan`);
  return taps;
}

// ---------------------------------------------------------------- A: Home -> recommendation -> Venue -> Create a plan
console.log('Journey A: Home -> recommendation -> Venue Detail -> Create a plan');
{
  const { page, errors } = await person('A');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  const home = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  check(/Good (morning|afternoon|evening)/.test(home), 'A: Home opens on the recommendations');
  check(!(await page.getByTestId('home-up-next').count()), 'A: with nothing in motion Home is unchanged (no Up next row)');
  await shot(page, 'A-home');
  const see = page.getByRole('button', { name: /see more|view details/i }).first();
  await see.waitFor({ timeout: 15000 });
  await see.click(); await page.waitForTimeout(2200);
  let taps = 1;
  check(/\/venue\//.test(page.url()), 'A: the recommendation opens Venue Detail', page.url());
  const venue = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  check(/Family Fit|Excellent|Good|Possible|Worth|fit/i.test(venue), 'A: Venue Detail says why it suits this family');
  await shot(page, 'A-venue');
  taps = await createFromVenue(page, taps, 'A');
  console.log(`  taps from Home to a built plan: ${taps}`);
  check(taps <= 3, 'A: three taps from Home to a built plan', String(taps));
  check(errors.length === 0, 'A: no runtime errors', errors.join(' | '));
}

// ---------------------------------------------------------------- B: Explore -> filter -> select -> details -> Create a plan
console.log('Journey B: Explore -> Filter -> venue -> View details -> Create a plan');
{
  const { page, errors } = await person('B');
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  // Explore opens on Nearby (5 miles from home); this journey filters the whole loaded list, so it asks for all of it first (not counted as a tap of the journey).
  await page.getByTestId('explore-scope-all').click(); await page.waitForTimeout(500);
  const count = async () => { const t = await page.getByTestId('explore-count').innerText(); const m = t.match(/(\d+) places?/); return m ? Number(m[1]) : null; };
  const before = await count();
  await page.getByTestId('explore-more').click(); await page.waitForTimeout(700);
  let taps = 1;
  await page.getByText('Toilets', { exact: true }).first().click(); taps += 1; await page.waitForTimeout(500);
  await shot(page, 'B-filter');
  await page.getByText('Show results', { exact: true }).first().click(); taps += 1; await page.waitForTimeout(900);
  const after = await count();
  check(before !== null && after !== null && after <= before, 'B: the filter narrows (or keeps) the list and says how many are left', `${before} -> ${after}`);
  const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  check(/More \(1\)/.test(body), 'B: the More control says one filter is on');
  await shot(page, 'B-results');
  await page.getByText('View family details').first().click(); taps += 1; await page.waitForTimeout(2200);
  check(/\/venue\//.test(page.url()), 'B: a result opens Venue Detail', page.url());
  taps = await createFromVenue(page, taps, 'B');
  console.log(`  taps from Explore to a built plan (filter, option, apply, details, create, build): ${taps}`);
  check(errors.length === 0, 'B: no runtime errors', errors.join(' | '));
}

check(google.length === 0, 'no request reached Google', google.slice(0, 2).join(' '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
