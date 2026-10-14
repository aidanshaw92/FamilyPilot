/**
 * Explore, Nearby, search and filters, as a parent uses them, in a real browser against the exported bundle and the Explore
 * catalogue stand-in (scripts/fixtures/explore-places.mjs). Each journey asserts what the parent SEES, not what the code returns.
 *
 *   1  genuine soft play within 5 miles (and the trampoline parks told apart)
 *   2  an indoor museum, with ages honestly uncertain
 *   3  a farm with confirmed parking and baby changing (none does): hidden, not checked, and one tap to relax
 *   4  a playground nearby, and the map
 *   5  a named attraction across London
 *   6  device location denied, then a postcode; device location granted, and where it is (and is not) kept
 *   7  restrictive filters, an honest explanation, a thin area, and relaxing without starting again
 *   8  open a venue and create a plan
 *   9  Google places: no Map and no Map/List toggle (a Google place is never drawn on the app's own map), a list that says so, and no Google request
 *   + one state across Nearby / Search all / List / Map, per-filter removal and Clear all, no provider call at any point.
 *
 * Journeys 9 and 10 (the optional lunch, and plans saved before it) belong to the lunch change and are run against a local merge
 * of both changes; see docs/EXPLORE_NEARBY.md.
 *
 * Serve first:  FIXTURE_SCENARIO=realistic FIXTURE_EXPLORE=1 node scripts/serve-places-fixture.mjs 4173 <distDir>
 * Usage:        node scripts/verify-explore-journeys.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

import { routePlacesAs } from './lib/place-provider.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const W = 393, H = 852;

const PROFILE = {
  id: 'fam-explore', parentName: 'Explore Test', members: [
    { id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 },
    { id: 'c2', name: 'Child B', role: 'child', dateOfBirth: '2026-02-22', dobKnown: true, age: 0, ageMonths: 7 } ],
  homeLocation: 'NW1 7AA', homeLatitude: 51.539, homeLongitude: -0.1426, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const PLANNING = { state: { families: [], options: { date: '2026-10-14', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const POSTCODES = {
  NW51TL: { latitude: 51.5512, longitude: -0.1469, outcode: 'NW5' },
  RM11AA: { latitude: 51.5762, longitude: 0.183, outcode: 'RM1' },
};

// `provider` serves the catalogue as that provider's places. The fixture catalogue is Google-shaped and a Google place is never drawn on the
// app's own map (src/utils/map-compliance.ts), so the journeys about the Map's behaviour serve independently located places (journey 9 covers Google).
async function person(label, { geolocation, denyLocation, provider } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/London', ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}) });
  const page = await ctx.newPage();
  const seen = { errors: [], google: [], places: [], postcodes: [], bodies: [] };
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('request', (r) => {
    const url = r.url();
    if (/googleapis|maps\.google/i.test(url)) seen.google.push(url);
    if (/\/api\/places\//.test(url) && !/\/photo/.test(url)) seen.places.push(url);
    if (/postcodes\.io/.test(url)) seen.postcodes.push(url);
    seen.bodies.push(`${url} ${r.postData() ?? ''}`);
  });
  await page.route('https://api.postcodes.io/**', (route) => {
    const key = decodeURIComponent(route.request().url().split('/').pop() ?? '').toUpperCase();
    const hit = POSTCODES[key];
    if (!hit) return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 404, error: 'Postcode not found' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 200, result: hit }) });
  });
  // A refusal, as the browser reports it: the user (or their settings) said no, so the call fails with PERMISSION_DENIED. Simulated here
  // because a headless browser has nobody to answer the prompt; the real prompt is part of the iPhone check.
  if (denyLocation) await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_ok, fail) => setTimeout(() => fail({ code: 1, message: 'User denied Geolocation' }), 150); });
  if (provider) await routePlacesAs(page, provider);
  await page.clock.setFixedTime(new Date('2026-10-14T11:00:00'));
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  return { page, ctx, seen, label };
}

const body = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const tid = (page, id) => page.getByTestId(id);
const open = async (page) => { await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await tid(page, 'explore-count').waitFor({ timeout: 30000 }); await settle(page, 600); };
const search = async (page, text) => { const box = page.getByLabel('Search places by name or kind'); await box.fill(text); await page.waitForTimeout(400); };
const category = async (page, id) => { await tid(page, `explore-category-${id}`).click(); await page.waitForTimeout(350); };
const setRadius = async (page, value) => { await tid(page, 'explore-distance-chip').click(); await tid(page, `explore-radius-${value}`).click(); await page.waitForTimeout(350); };
const toggleSheetFilters = async (page, labels) => {
  await tid(page, 'explore-more').click(); await page.waitForTimeout(500);
  for (const label of labels) await page.getByText(label, { exact: true }).last().click();
  await page.getByRole('button', { name: 'Show results' }).click(); await page.waitForTimeout(450);
};
/**
 * Everything the list has, in the order it is shown. The list is windowed (only the rows near the screen are mounted, on purpose:
 * see explore.tsx), so this scrolls it end to end, reads what is mounted at each step, and returns cards, headings and toggles by
 * their position in the list.
 */
async function sweep(page) {
  return page.evaluate(async () => {
    const find = () => document.querySelector('[data-testid^="explore-card-"], [data-testid$="-toggle"], [data-testid="explore-empty"]');
    let el = find();
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    const seen = new Map();
    const top = () => (el ? el.scrollTop : 0);
    const read = () => {
      document.querySelectorAll('[data-testid^="explore-card-"], [data-testid$="-toggle"], [data-testid^="explore-also-"], [data-testid="explore-outside"], [data-testid="explore-empty"]').forEach((n) => {
        const id = n.getAttribute('data-testid');
        const text = (n.getAttribute('aria-label') ?? n.innerText).replace(/\s+/g, ' ').trim();
        const kind = id.startsWith('explore-card-') ? 'card' : id === 'explore-empty' ? 'empty' : id.endsWith('-toggle') ? 'toggle' : 'heading';
        seen.set(id, { kind, text: kind === 'card' ? text.split(',')[0].trim() : text, y: n.getBoundingClientRect().top + top() });
      });
    };
    read();
    if (el) {
      for (let y = 0; y <= el.scrollHeight; y += 260) { el.scrollTop = y; await new Promise((r) => setTimeout(r, 140)); read(); }
      el.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 120));
    }
    return [...seen.values()].sort((a, b) => a.y - b.y);
  });
}
const cardNames = async (page) => (await sweep(page)).filter((x) => x.kind === 'card').map((x) => x.text);

// ---------------------------------------------------------------- the screen itself
console.log('The screen: hierarchy and state');
{
  const { page, seen } = await person('screen');
  await open(page);
  const t = await body(page);
  check(/^.*Explore/.test(t) && (await tid(page, 'explore-title').innerText()) === 'Explore', 'the heading is Explore');
  const order = await page.evaluate(() => ['explore-title', 'explore-switch', 'explore-where', 'explore-category-all', 'explore-distance-chip', 'explore-count'].map((id) => { const el = document.querySelector(`[data-testid="${id}"]`); return el ? Math.round(el.getBoundingClientRect().top) : -1; }));
  check(order.every((y, i) => y >= 0 && (i === 0 || y > order[i - 1])), 'top to bottom: heading, Nearby | Search all, where, categories, quick filters, results', order.join(' < '));
  check((await tid(page, 'explore-scope-nearby').getAttribute('aria-checked')) === 'true', 'Nearby is the default');
  check(/Near NW1/.test(await tid(page, 'explore-where-title').innerText()) && /home area/i.test(await tid(page, 'explore-where-detail').innerText()), 'where: the home area, as its first half', await tid(page, 'explore-where-title').innerText());
  const chips = await page.locator('[data-testid^="explore-category-"]').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  check(JSON.stringify(chips) === JSON.stringify(['All', 'Parks & playgrounds', 'Museums & galleries', 'Farms & animals', 'Soft play & trampolines', 'Attractions & activities']), 'the five approved groups, in order', chips.join(' | '));
  check(!/Swimming|Classes/.test(t), 'no Swimming or Classes');
  check(/within 5 miles/.test(await tid(page, 'explore-count').innerText()), 'Nearby says within 5 miles by default', await tid(page, 'explore-count').innerText());
  await shot(page, 'explore-nearby');
  check(seen.google.length === 0, 'no Google request on open', String(seen.google.length));
  check(seen.errors.length === 0, 'no runtime errors', seen.errors.join(' | '));
}

// ---------------------------------------------------------------- 1 soft play
console.log('Journey 1: genuine soft play within 5 miles');
{
  const { page, seen } = await person('j1');
  await open(page);
  const placesAfterLoad = seen.places.length;
  await search(page, 'soft play');
  let names = await cardNames(page);
  check(names.some((n) => /Babylon Park/.test(n)) && names.some((n) => /Flip Out Brent Cross/.test(n)), 'within 5 miles: Babylon Park and Flip Out Brent Cross', names.join(' | '));
  check(!names.some((n) => /AirHop|Jump In|Canary/.test(n)), 'no trampoline park and nothing beyond 5 miles', names.join(' | '));
  const babylon = await tid(page, `explore-evidence-fp-google-ChIJ7_PV980bdkgROekbwOVWVfo`).innerText();
  check(/Soft play: its FAQ mentions soft play areas/.test(babylon) && /Ages: soft play usually suits under-fives; no limit recorded/.test(babylon), 'the card says where soft play comes from, and that the age is typical, not a limit', babylon.replace(/\n/g, ' / '));
  await shot(page, 'j1-soft-play');
  await setRadius(page, 10);
  const t = await body(page);
  names = await cardNames(page);
  check(names.some((n) => /Flip Out Canary Wharf/.test(n)), 'within 10 miles adds Flip Out Canary Wharf', names.join(' | '));
  check(/Also: trampoline parks, soft play not on record/.test(t), 'the trampoline parks are under their own heading');
  const order = await sweep(page);
  const headingAt = order.findIndex((x) => x.kind === 'heading' && /trampoline parks/.test(x.text));
  const airhopAt = order.findIndex((x) => x.kind === 'card' && /AirHop/.test(x.text));
  const softAt = order.findIndex((x) => x.kind === 'card' && /Flip Out Canary Wharf/.test(x.text));
  check(headingAt >= 0 && airhopAt > headingAt && softAt >= 0 && softAt < headingAt, 'AirHop is listed under that heading, and the soft play venues above it', order.map((x) => `${x.kind[0]}:${x.text.slice(0, 22)}`).join(' > '));
  const canary = await tid(page, 'explore-evidence-fp-google-ChIJ2fFKeuMDdkgRLHMNKVOxX_s').innerText();
  check(/No trampolines: its own page says so/.test(canary), 'Flip Out Canary Wharf says it has no trampolines');
  await search(page, 'trampoline');
  names = await cardNames(page);
  check(names.some((n) => /AirHop/.test(n)) && names.some((n) => /Flip Out Brent Cross/.test(n)) && !names.some((n) => /Canary/.test(n)), 'searching "trampoline" lists trampoline parks and not the one that has none', names.join(' | '));
  check(seen.places.length === placesAfterLoad, 'searching and widening made no further places request', `${seen.places.length - placesAfterLoad} extra`);
  check(seen.google.length === 0, 'no Google request', String(seen.google.length));
}

// ---------------------------------------------------------------- 2 indoor museum, ages uncertain
console.log('Journey 2: an indoor museum, ages uncertain');
{
  const { page } = await person('j2');
  await open(page);
  await category(page, 'museums');
  await tid(page, 'explore-quick-indoor').click(); await page.waitForTimeout(350);
  const names = await cardNames(page);
  check(names.some((n) => /Postal Museum/.test(n)) && names.some((n) => /British Museum/.test(n)), 'Museums + Indoor within 5 miles', names.join(' | '));
  const postal = await page.locator('[data-testid^="explore-evidence-"]').first().innerText();
  check(/Ages: typical for museums, no limit recorded/.test(postal), 'ages are said to be typical, with no limit recorded', postal.replace(/\n/g, ' / '));
  const t = await body(page);
  check(!/Suitable for/.test(t) && !/Ages: [^.]*recommended/.test(t), 'no standalone "suitable for my children" filter and no invented age', '');
  check(/Usually indoor/.test(t), 'indoor is "usually", because it comes from the kind of place and not from a check');
  const chipsNow = await tid(page, 'explore-active-filters').innerText();
  check(/Museums & galleries/.test(chipsNow) && /Indoor/.test(chipsNow), 'the active chips say Museums & galleries and Indoor');
  await shot(page, 'j2-museums-indoor');
}

// ---------------------------------------------------------------- 3 farm, parking and baby changing
console.log('Journey 3: a farm with confirmed parking and baby changing');
{
  const { page } = await person('j3');
  await open(page);
  await category(page, 'animals');
  await setRadius(page, 10);
  await toggleSheetFilters(page, ['Parking', 'Baby changing']);
  const t = await body(page);
  check(/Nothing matches all of these/.test(t), 'no farm confirms both, and it says so', '');
  check(/2 places are hidden because a confirmed fact rules them out/.test(t), 'two farms are hidden, counted');
  check(/not checked for parking or baby changing|not checked for baby changing or parking/.test(t) || /not checked for/.test(t), 'the farms nobody has checked are listed apart as not checked');
  await shot(page, 'j3-empty-relax');
  await tid(page, 'explore-hidden-toggle-action').click(); await page.waitForTimeout(350);
  const reasons = await body(page);
  check(/Parking: its own page says there is none/.test(reasons) && /Hackney City Farm/.test(reasons) && /Kentish Town City Farm/.test(reasons), 'Show lists them with the reason', '');
  await tid(page, 'explore-relax-filter:parking').click(); await page.waitForTimeout(450);
  const after = await cardNames(page);
  check(after.some((n) => /Hackney City Farm/.test(n)) && after.some((n) => /Mudchute/.test(n)), 'one tap takes Parking off and brings the farms that confirm baby changing back', after.join(' | '));
  check((await tid(page, 'explore-active-filters').innerText()).includes('Farms & animals'), 'and keeps the group');
}

// ---------------------------------------------------------------- 4 playground, map
console.log('Journey 4: a playground nearby, on the map');
{
  const { page, seen } = await person('j4', { provider: 'osm' });
  await open(page);
  await category(page, 'parks');
  await toggleSheetFilters(page, ['Playground']);
  let names = await cardNames(page);
  check(names.includes('Clissold Park') || names.some((n) => /Clissold/.test(n)), 'Clissold Park, where a playground is confirmed', names.join(' | '));
  check(!names.some((n) => /Highbury/.test(n)), 'Highbury Fields, with nothing recorded, is not a match');
  const marks = (await sweep(page)).filter((x) => x.kind === 'toggle').map((x) => x.text).join(' | ');
  check(/not checked for playground/.test(marks), 'it is listed apart as not checked', marks);
  const before = await tid(page, 'explore-count').innerText();
  await tid(page, 'explore-view-map').click(); await page.waitForTimeout(800);
  check(await tid(page, 'explore-map').isVisible(), 'the map shows');
  check((await tid(page, 'explore-map-ring').count()) === 1, 'Nearby draws its ring');
  const pins = await page.locator('[data-testid^="explore-map-pin-"]').count();
  check(pins >= 1, 'the places are pinned', String(pins));
  check(/Your area/.test(await page.evaluate(() => document.querySelector('[data-testid="explore-map"]').textContent)) || (await tid(page, 'explore-map-area').count()) === 1, 'where you are is drawn as an area');
  check(/same list, same filters/.test(await body(page)), 'the selected place is from the same list');
  check((await tid(page, 'explore-count').innerText()) === before, 'switching to the map kept the count');
  await shot(page, 'j4-map');
  await page.locator('[data-testid^="explore-map-pin-"]').last().click({ force: true }); await page.waitForTimeout(300);
  check((await tid(page, 'explore-active-filters').innerText()).includes('Playground'), 'the filters survive the map');
  await tid(page, 'explore-view-list').click(); await page.waitForTimeout(400);
  names = await cardNames(page);
  check(names.length >= 1 && (await tid(page, 'explore-active-filters').innerText()).includes('Playground'), 'and the list again');
  check(seen.google.length === 0, 'no Google request', String(seen.google.length));
}

// ---------------------------------------------------------------- 5 named attraction
console.log('Journey 5: a named attraction across London');
{
  const { page } = await person('j5');
  await open(page);
  await tid(page, 'explore-scope-all').click(); await page.waitForTimeout(400);
  check(/All of London/.test(await tid(page, 'explore-where-title').innerText()), 'Search all says all of London');
  await search(page, 'london eye');
  const names = await cardNames(page);
  check(/London Eye/.test(names[0] ?? ''), 'London Eye is listed first', names.join(' | '));
  await tid(page, 'explore-scope-nearby').click(); await page.waitForTimeout(400);
  check((await page.getByLabel('Search places by name or kind').inputValue()) === 'london eye', 'switching back to Nearby kept the search');
  await shot(page, 'j5-named');
}

// ---------------------------------------------------------------- 6 location
console.log('Journey 6: device location denied, then a postcode');
{
  const { page, seen } = await person('j6', { denyLocation: true });
  await open(page);
  const placesAtOpen = seen.places.length;
  await tid(page, 'explore-where-change').click(); await page.waitForTimeout(500);
  check(await tid(page, 'explore-where-sheet').isVisible(), 'the where sheet opens');
  check((await tid(page, 'explore-where-option-device').count()) === 1, 'it offers the current location, the home area and another area');
  check(seen.places.length === placesAtOpen, 'nothing was requested because the sheet opened', `${seen.places.length - placesAtOpen} extra`);
  await tid(page, 'explore-where-option-device').click(); await page.waitForTimeout(1500);
  const notice = await tid(page, 'explore-where-notice').innerText().catch(() => '');
  check(/Location is off|not available|could not get/.test(notice), 'a refusal is an ordinary answer: it says what happened', notice.slice(0, 80));
  check(/Near NW1/.test(await tid(page, 'explore-where-title').innerText()), 'and Nearby still works from the home area', await tid(page, 'explore-where-title').innerText());
  await shot(page, 'j6-denied');
  await tid(page, 'explore-where-input').fill('NW5 1TL');
  await tid(page, 'explore-where-go').click(); await page.waitForTimeout(900);
  check(/Near NW5/.test(await tid(page, 'explore-where-title').innerText()), 'a postcode continues', await tid(page, 'explore-where-title').innerText());
  check(seen.postcodes.length === 1 && /postcodes\/NW51TL$/.test(seen.postcodes[0]), 'the postcode went to postcodes.io only, once', seen.postcodes.join(' '));
  check(seen.google.length === 0, 'no Google request, and no geocoder for a town name', String(seen.google.length));
  await tid(page, 'explore-where-change').click(); await page.waitForTimeout(400);
  await tid(page, 'explore-where-input').fill('Grimsby'); await tid(page, 'explore-where-go').click(); await page.waitForTimeout(500);
  check(/Other town names are not looked up yet/.test(await tid(page, 'explore-where-notice').innerText()), 'an unknown town says what can be looked up instead of guessing');
  check(seen.postcodes.length === 1 && seen.google.length === 0, 'and nothing was sent anywhere for it');
}
console.log('Journey 6b: device location granted, and where it is (and is not) kept');
{
  const { page, seen, ctx } = await person('j6b', { geolocation: { latitude: 51.5873, longitude: -0.2231 }, provider: 'osm' });
  await open(page);
  await tid(page, 'explore-where-change').click(); await page.waitForTimeout(500);
  await tid(page, 'explore-where-option-device').click(); await page.waitForTimeout(1500);
  check(/Near you/.test(await tid(page, 'explore-where-title').innerText()) && /current location/i.test(await tid(page, 'explore-where-detail').innerText()), 'the current location is used, and said to be', await tid(page, 'explore-where-title').innerText());
  const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  check(!/51\.587|-0\.223/.test(stored), 'the position is not in local or session storage');
  check(!seen.bodies.some((b) => /51\.587|-0\.223/.test(b)), 'the position is in no request', '');
  await tid(page, 'explore-view-map').click(); await page.waitForTimeout(800);
  const label = await page.evaluate(() => document.querySelector('[data-testid="explore-map"] [role="img"], [data-testid="explore-map"] [aria-label]')?.getAttribute('aria-label') ?? '');
  check(/approximate area, not an address/.test(label), 'the map draws it as an approximate area', label.slice(0, 90));
  await ctx.close();
}

// ---------------------------------------------------------------- 7 relax, thin
console.log('Journey 7: restrictive filters, an honest explanation, relaxing without starting again');
{
  const { page } = await person('j7');
  await open(page);
  await category(page, 'play');
  await setRadius(page, 2);
  await tid(page, 'explore-quick-outdoor').click(); await page.waitForTimeout(450);
  const t = await body(page);
  check(/Nothing matches all of these/.test(t), 'Soft play + Outdoor + 2 miles: nothing matches, and it says so');
  const relax = await page.locator('[data-testid^="explore-relax-"]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  check(relax.some((r) => /Take off Outdoor · 1 place/.test(r)), 'one tap to take Outdoor off, with what it brings back', relax.join(' | '));
  await shot(page, 'j7-empty');
  await tid(page, 'explore-relax-filter:outdoor').click(); await page.waitForTimeout(450);
  const names = await cardNames(page);
  check(names.some((n) => /Babylon/.test(n)), 'Babylon Park is back', names.join(' | '));
  const chips = await tid(page, 'explore-active-filters').innerText();
  check(/Soft play & trampolines/.test(chips) && /Within 2 miles/.test(chips) && !/Outdoor/.test(chips), 'the group and the distance stayed; only Outdoor went', chips.replace(/\n/g, ' '));
  await tid(page, 'explore-clear-all').click(); await page.waitForTimeout(400);
  check((await tid(page, 'explore-active-filters').count()) === 0, 'Clear all clears them all');
  check(/within 5 miles/.test(await tid(page, 'explore-count').innerText()), 'and the distance returns to 5 miles');
}
console.log('Journey 7b: a thin area');
{
  const { page } = await person('j7b');
  await open(page);
  await tid(page, 'explore-where-change').click(); await page.waitForTimeout(400);
  await tid(page, 'explore-where-input').fill('RM1 1AA'); await tid(page, 'explore-where-go').click(); await page.waitForTimeout(900);
  const t = await body(page);
  check(/No places we know within 5 miles/.test(t), 'RM1: nothing within 5 miles, said plainly', '');
  check(/not every place there is/.test(t), 'and that it is the places on record, not every place there is');
  const relax = await page.locator('[data-testid^="explore-relax-"]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  check(relax.some((r) => /Search all of London/.test(r)), 'it offers Search all of London', relax.join(' | '));
  await shot(page, 'j7b-thin');
}

// ---------------------------------------------------------------- 8 venue and plan
console.log('Journey 8: open a venue and create a plan');
{
  const { page, seen } = await person('j8');
  await open(page);
  await search(page, 'kentish town');
  await page.locator('[data-testid^="explore-card-"]').first().click(); await page.waitForTimeout(2200);
  check(/\/venue\//.test(page.url()), 'a card opens the venue', page.url());
  const bar = tid(page, 'venue-create-plan');
  await bar.waitFor({ timeout: 20000 });
  await bar.click(); await page.waitForTimeout(900);
  await tid(page, 'create-plan-submit').click();
  await tid(page, 'plan-timeline').last().waitFor({ timeout: 40000 });
  const plan = (await tid(page, 'plan-timeline').last().innerText()).replace(/\s+/g, ' ');
  check(/Leave/i.test(plan) && /Arrive/i.test(plan), 'the plan shows when to leave and arrive', plan.slice(0, 90));
  check(seen.google.length === 0, 'no Google request', String(seen.google.length));
}

// ---------------------------------------------------------------- 9 Google places are not drawn on the app's own map
console.log("Journey 9: Google places get a list, not a map");
{
  const { page, seen } = await person('j9');
  await open(page);
  await tid(page, 'explore-scope-all').click(); await page.waitForTimeout(600);
  await search(page, 'park');
  check((await page.locator('[data-testid^="explore-card-"]').count()) >= 1, 'the places are listed');
  check((await tid(page, 'explore-view-map').count()) === 0 && (await tid(page, 'explore-view-list').count()) === 0, 'there is no Map / List toggle');
  check((await tid(page, 'explore-map-off').count()) === 1, 'the list says the map is switched off');
  check((await tid(page, 'explore-map').count()) === 0 && (await page.locator('[data-testid^="explore-map-pin-"]').count()) === 0, 'nothing is drawn');
  // A parent who chose the Map earlier (the choice is remembered) is not sent to a map that is off.
  await page.evaluate(() => { try { const k = Object.keys(localStorage).find((x) => /explore/i.test(x)); if (k) { const v = JSON.parse(localStorage.getItem(k)); if (v?.state) { v.state.exploreView = 'map'; localStorage.setItem(k, JSON.stringify(v)); } } } catch {} });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  check((await tid(page, 'explore-map').count()) === 0, 'a remembered Map choice still shows the list');
  await shot(page, 'j9-map-off');
  check(seen.google.length === 0, 'no Google request', String(seen.google.length));
}

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll Explore journey checks passed');
process.exit(failed ? 1 : 0);
