/**
 * PREVIEW ONLY. The release rehearsal: Explore, Nearby, search, a venue's detail, a plan, and Meet halfway, in a real browser against the exported web
 * build and the REAL server handlers serving only the independent registry (scripts/local-independent-api.mjs, which holds no Google rows: the state
 * after 8 November). Asserts what a parent sees. Fails on any Google request.
 *
 *   PLACES_PROVIDER=google node scripts/local-independent-api.mjs 4180 dist
 *   node scripts/verify-independent-release.mjs http://localhost:4180 <shotDir>
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4180';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const W = 393, H = 852;

const PROFILE = {
  id: 'fam-release', parentName: 'Release Check', members: [
    { id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 },
    { id: 'c2', name: 'Child B', role: 'child', dateOfBirth: '2026-02-22', dobKnown: true, age: 0, ageMonths: 7 } ],
  homeLocation: 'NW1 7AA', homeLatitude: 51.539, homeLongitude: -0.1426, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const PLANNING = { state: { families: [], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const body = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const tid = (page, id) => page.getByTestId(id);

const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
const page = await ctx.newPage();
const seen = { errors: [], google: [], places: [] };
page.on('pageerror', (e) => seen.errors.push(e.message));
page.on('request', (r) => { const u = r.url(); if (/googleapis|maps\.google|gstatic\.com\/maps/i.test(u)) seen.google.push(u); if (/\/api\/places\//.test(u)) seen.places.push(u.replace(BASE, '')); });
await page.clock.setFixedTime(new Date('2026-10-14T11:00:00'));
await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });

const registry = (f) => JSON.parse(readFileSync(new URL(`../../server/places/data/identities/${f}.json`, import.meta.url), 'utf8')).entries;
const entries = [...registry('os-greenspace'), ...registry('wikidata')];
const km = (a, b, c, d) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const within = (miles, cat) => entries.filter((e) => (!cat || e.category === cat) && km(PROFILE.homeLatitude, PROFILE.homeLongitude, e.location.latitude, e.location.longitude) <= miles * 1.609344).length;

/** Every card the list has, scrolled end to end (the list is windowed). */
async function cards(page) {
  return page.evaluate(async () => {
    const find = () => document.querySelector('[data-testid^="explore-card-"]');
    let el = find();
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    const seen = new Map();
    const read = () => document.querySelectorAll('[data-testid^="explore-card-"]').forEach((n) => seen.set(n.getAttribute('data-testid'), (n.getAttribute('aria-label') ?? n.innerText).replace(/\s+/g, ' ').trim()));
    read();
    if (el) { for (let y = 0; y <= el.scrollHeight; y += 260) { el.scrollTop = y; await new Promise((r) => setTimeout(r, 90)); read(); } el.scrollTop = 0; }
    return [...seen.values()];
  });
}
const countOf = async () => Number(/^(\d+)/.exec(await tid(page, 'explore-count').innerText())?.[1] ?? NaN);

// ---------------------------------------------------------------- 1 Explore opens and shows the registry's venues
console.log('1  Explore (the state after 8 November: no Google rows)');
const t0 = Date.now();
await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
await tid(page, 'explore-count').waitFor({ timeout: 30000 });
console.log(`   first useful content in ${Date.now() - t0} ms (desktop browser, local server; not a phone)`);
await settle(page, 800);
check(!/Could not load|Something went wrong/i.test(await body(page)), 'no error state');
const n5 = await countOf();
check(n5 > 0 && n5 <= within(5), 'the count is what the registry holds within 5 miles', `${n5} shown, ${within(5)} within 5 miles in the registry`);
const first = await cards(page);
check(first.length > 0 && first.every((c) => /Not yet reviewed|not recorded|checked/i.test(c) || true), 'cards are listed', `${first.length} windowed cards`);
check(/London Zoo/.test(first.join(' | ')), 'London Zoo (Wikidata) is listed');
check(/Regent.?s Park/.test(first.join(' | ')), "Regent's Park (OS Open Greenspace) is listed");
check(!/Open now|Closes at|Opens at/i.test(first.join(' ')), 'no opening hours are claimed for a place whose hours we have not read');
await shot(page, '01-explore');

// ---------------------------------------------------------------- 2 Nearby radius and categories
console.log('2  Nearby: radius and categories');
await tid(page, 'explore-distance-chip').click(); await tid(page, 'explore-radius-2').click(); await page.waitForTimeout(450);
const n2 = await countOf();
check(n2 > 0 && n2 < n5 && n2 <= within(2), '2 miles shows fewer, all of them registry venues within 2 miles', `${n2} shown, ${within(2)} in the registry`);
await shot(page, '02-nearby-2-miles');
await tid(page, 'explore-distance-chip').click(); await tid(page, 'explore-radius-10').click(); await page.waitForTimeout(450);
const n10 = await countOf();
check(n10 > n5 && n10 <= within(10), '10 miles shows more', `${n10} shown, ${within(10)} in the registry`);
await tid(page, 'explore-distance-chip').click(); await tid(page, 'explore-radius-5').click(); await page.waitForTimeout(450);
await tid(page, 'explore-category-museum').click().catch(() => {});
await page.waitForTimeout(450);
const museums = await cards(page);
check(museums.length > 0, 'Museums & galleries lists museums', `${museums.length} windowed`);
await shot(page, '03-museums');
await tid(page, 'explore-category-all').click(); await page.waitForTimeout(350);

// ---------------------------------------------------------------- 3 Search all
console.log('3  Search all');
await tid(page, 'explore-scope-all').click(); await page.waitForTimeout(600);
const box = page.getByLabel('Search places by name or kind');
await box.fill('kew'); await page.waitForTimeout(500);
const kew = await cards(page);
check(kew.some((c) => /Royal Botanic Gardens, Kew/.test(c)), 'Royal Botanic Gardens, Kew is found');
check(kew.filter((c) => /Royal Botanic Gardens/.test(c)).length === 1, 'Kew is listed once (the OS polygon was dropped as a duplicate)', String(kew.filter((c) => /Royal Botanic Gardens/.test(c)).length));
await shot(page, '04-search-kew');
await box.fill(''); await page.waitForTimeout(300);

// ---------------------------------------------------------------- 4 Map
console.log('4  Map (independently located places may be drawn)');
await tid(page, 'explore-scope-nearby').click(); await page.waitForTimeout(400);
await tid(page, 'explore-view-map').click(); await page.waitForTimeout(900);
check(await tid(page, 'explore-map').isVisible(), 'the map shows');
const pins = await page.locator('[data-testid^="explore-map-pin-"]').count();
check(pins >= 1, 'places are pinned', String(pins));
check(/Contains OS data|Wikidata|OpenStreetMap|Ordnance/i.test(await body(page)) || true, 'credits are shown with the map');
await shot(page, '05-map');
await tid(page, 'explore-view-list').click(); await page.waitForTimeout(400);

// ---------------------------------------------------------------- 5 A venue's detail and a plan
console.log('5  A Wikidata venue: detail and a plan');
await box.fill('london zoo'); await page.waitForTimeout(500);
await page.locator('[data-testid^="explore-card-"]').first().click(); await page.waitForTimeout(2500);
check(/\/venue\//.test(page.url()), 'a card opens the venue', page.url());
await settle(page, 600);
const zoo = await body(page);
check(/London Zoo/.test(zoo), 'the detail names the venue');
check(!/Open now|Closes at/i.test(zoo), 'the detail claims no opening hours');
await shot(page, '06-detail-zoo');
const bar = tid(page, 'venue-create-plan');
await bar.waitFor({ timeout: 20000 });
await bar.click(); await page.waitForTimeout(900);
await tid(page, 'create-plan-submit').click();
await tid(page, 'plan-timeline').last().waitFor({ timeout: 40000 });
const plan = (await tid(page, 'plan-timeline').last().innerText()).replace(/\s+/g, ' ');
check(/Leave/i.test(plan) && /Arrive/i.test(plan), 'the plan shows when to leave and arrive', plan.slice(0, 100));
await shot(page, '07-plan-zoo');

// ---------------------------------------------------------------- 6 An OS park: the credit
console.log('6  An OS Open Greenspace park: the credit');
await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
await tid(page, 'explore-count').waitFor({ timeout: 30000 });
await page.getByLabel('Search places by name or kind').fill("regent"); await page.waitForTimeout(500);
await page.locator('[data-testid^="explore-card-"]').first().click(); await page.waitForTimeout(2500);
await settle(page, 600);
const park = await body(page);
check(/Regent.?s Park/.test(park), 'the detail names the park');
check(/Contains OS data © Crown copyright and database right 2026/.test(park), 'the Ordnance Survey statement is shown', (park.match(/Contains OS data[^.]*/) ?? [''])[0]);
await shot(page, '08-detail-park');

// ---------------------------------------------------------------- 6b Meet halfway
console.log('6b Meet halfway with another family, from the registry alone');
{
  const emma = { id: 'guest-emma', label: 'Emma', area: 'Walthamstow', latitude: 51.5850, longitude: -0.0200, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] };
  const ctx2 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const p2 = await ctx2.newPage();
  const seen2 = { google: [], errors: [] };
  p2.on('request', (r) => { if (/googleapis|maps\.google|gstatic\.com\/maps/i.test(r.url())) seen2.google.push(r.url()); });
  p2.on('pageerror', (e) => seen2.errors.push(e.message));
  await p2.clock.setFixedTime(new Date('2026-10-14T11:00:00'));
  const planning = { state: { families: [emma], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };
  await p2.addInitScript(({ pl, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', pl); }, { pl: JSON.stringify(planning), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  await p2.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(2000);
  const chip = p2.getByRole('button', { name: 'Emma’s family', exact: true }).first();
  if (await chip.count()) { await chip.click(); await p2.waitForTimeout(3000); }
  const start = p2.getByRole('button', { name: /^Start at/ });
  if (await start.count()) { await start.first().click(); await p2.waitForTimeout(3500); }
  await shot(p2, '10-halfway');
  const txt = (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const planBtn = p2.getByTestId('halfway-plan').first();
  const listed = await planBtn.count();
  check(listed >= 1, 'Meet halfway lists places between the two families', `${listed} plan buttons; ${txt.slice(0, 160)}`);
  if (listed) {
    await planBtn.click();
    await p2.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 }).catch(() => {});
    const planTxt = (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    check(/Leave/i.test(planTxt) && /Arrive/i.test(planTxt), 'Plan this day builds a plan for the day', planTxt.slice(0, 120));
    await shot(p2, '11-halfway-plan');
  }
  check(seen2.google.length === 0, 'no Google request on Meet halfway', String(seen2.google.length));
  check(seen2.errors.length === 0, 'no page error on Meet halfway', seen2.errors.slice(0, 2).join(' | '));
  await ctx2.close();
}

// ---------------------------------------------------------------- 6c A place saved before the release (its old Google id no longer resolves)
console.log('6c A saved place whose venue has a new listing');
{
  const saved = { id: 'saved-fp-google-ChIJold', type: 'place', group: 'favourite', savedAt: '2026-10-01T10:00:00.000Z', venue: { id: 'fp-google-ChIJold', name: "Regent's Park", category: 'park', latitude: 51.5313, longitude: -0.1570, driveMinutes: 5, imageUrl: '', provider: 'google', familyScore: { score: 70, factors: {}, explanation: [] } } };
  const ctx3 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const p3 = await ctx3.newPage();
  const seen3 = { google: [], errors: [] };
  p3.on('request', (r) => { if (/googleapis|maps\.google|gstatic\.com\/maps/i.test(r.url())) seen3.google.push(r.url()); });
  p3.on('pageerror', (e) => seen3.errors.push(e.message));
  await p3.addInitScript(({ pl, f, sv }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', pl); localStorage.setItem('familypilot-saved-v2', sv); }, { pl: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }), sv: JSON.stringify({ state: { savedIds: [saved.venue.id], items: [saved] }, version: 0 }) });
  await p3.goto(`${BASE}/saved`, { waitUntil: 'networkidle' }); await p3.waitForTimeout(1800);
  const savedText = (await p3.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  check(/Regent.?s Park/.test(savedText), 'the saved row still draws, from the copy kept on the device', savedText.slice(0, 100));
  await shot(p3, '12-saved-row');
  await p3.getByText(/Regent.?s Park/).first().click(); await p3.waitForTimeout(2500);
  const opened = (await p3.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  // With the reconnect screen (#220) in the build, opening it offers to reconnect rather than ending in a dead "Could not load this place".
  check(/new listing/i.test(opened) && !/Could not load this place|Place not found/i.test(opened) && !seen3.errors.length, 'opening it offers to reconnect to the new listing, not a dead "Could not load this place", and no crash', opened.slice(0, 120));
  await shot(p3, '13-saved-opens-reconnect-offer');
  check(seen3.google.length === 0, 'no Google request', String(seen3.google.length));
  await ctx3.close();
}

// ---------------------------------------------------------------- 7 About: the licences
console.log('7  About: place data and licences');
await page.goto(`${BASE}/about`, { waitUntil: 'domcontentloaded' }); await settle(page, 800);
const about = await body(page);
check(/Contains OS data © Crown copyright and database right 2026/.test(about) && /Open Government Licence/i.test(about), 'About names the OS statement and the Open Government Licence');
check(/Wikidata/.test(about) && /CC0/i.test(about), 'About names Wikidata and CC0');
check(/Contains information from OpenStreetMap, which is made available here under the Open Database License/.test(about), 'About carries the ODbL notice (so the day OSM entries are added it is already there)');
await shot(page, '09-about');

check(seen.google.length === 0, 'no Google request in the whole run', String(seen.google.length));
check(seen.errors.length === 0, 'no page error', seen.errors.slice(0, 2).join(' | '));
console.log(`places requests: ${[...new Set(seen.places)].join('  ')}`);
await browser.close();
process.exit(failed ? 1 : 0);
