/**
 * Drives the exported web build through the saved-place reconnect experience, in a real browser, with the stored catalogue stubbed per case.
 *
 *   node scripts/serve-places-fixture.mjs 4310 &      (serves dist/ and a stand-in /api/places; nothing here spends money)
 *   node scripts/verify-saved-reconnect.mjs http://127.0.0.1:4310
 *
 * What it proves, case by case (each a separate browser context, with saved places and saved days seeded on the device as an existing family would have them):
 *   1  A saved place whose old listing is gone and which has one successor: the quiet line, the sheet, "Yes, this one": the row is repointed, a saved day built
 *      from it is repointed, that day's itinerary is byte-for-byte unchanged, and the notice says plans already made are unchanged.
 *   2  Look-alikes: both are offered with the "more than one place" note; "None of these" changes nothing at all (the stored data is identical).
 *   3  Nothing similar is listed: the line says the place is not listed any more, the sheet offers only Keep and Remove, and Keep changes nothing.
 *   4  A saved place whose id is still listed, and an independent one: no line, and the independent one makes no catalogue request.
 *   5  The catalogue is down (503): no line, no sheet, the rows are exactly as before. An outage is never read as "gone".
 *   6  The venue page for a saved place whose listing has gone: a reconnect offer instead of "Could not load this place ... try again"; confirming opens
 *      the new venue. For an address nobody saved, today's wording is unchanged.
 *   7  Every lookup was the stored-catalogue read; no request went to a Google host; no page error.
 *   8  axe-core finds no WCAG 2.x A/AA violation in the reconnect lines or the open sheet, and the controls are at least 44 px tall.
 * Exit code 1 when anything fails.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4310';
const GOOGLE_HOST = /(^|\.)(googleapis|google|gstatic|ggpht|googleusercontent)\.[a-z.]+$/i;

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  -- ${detail}` : ''}`); };

const PROFILE = { state: { profile: { id: 'family-demo', parentName: 'Aidan Shaw', members: [{ id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 }, { id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2021-01-01', age: 5 }], homeLocation: 'London', budgetTier: 'moderate', maxDriveMinutes: 60, completionPercent: 80 }, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1 }, version: 0 };

const venue = (id, name, lat, lng, provider, category = 'park') => ({ id, name, category, latitude: lat, longitude: lng, driveMinutes: 20, imageUrl: '', provider, familyScore: { score: 72, factors: {}, explanation: [] }, enrichmentStatus: 'provider_only' });
const record = (id, name, lat, lng, provider = 'os-greenspace', category = 'park') => ({ familypilotId: id, externalId: `x:${id}`, provider, name, category, latitude: lat, longitude: lng, photos: [], fetchedAt: '2026-10-14T00:00:00.000Z', enrichmentStatus: 'provider_only', googleTypes: [] });
const item = (v) => ({ id: `saved-${v.id}`, type: 'place', venue: v, group: 'want', savedAt: '2026-09-01T10:00:00.000Z' });
const itinerary = (label) => ({ marker: `the itinerary of ${label}`, stops: [{ name: 'Brockwell Park', start: '10:00' }, { name: 'Lunch', start: '12:30' }] });
const day = (id, venueId) => ({ id, createdAt: '2026-09-02T10:00:00.000Z', source: itinerary(id), draft: { venueId, params: { date: '2026-10-17' } } });

const BROCKWELL = venue('fp-google-ChIJbrock', 'Brockwell Park', 51.451, -0.1066, 'google');
const VICTORIA = venue('fp-google-ChIJvic', 'Victoria Park', 51.5362, -0.0414, 'google');
const SOFTPLAY = venue('fp-google-ChIJsoft', 'Tiny Tots Soft Play', 51.48, -0.2, 'google', 'soft_play');
const STILL = venue('fp-google-ChIJstill', 'Still Listed Museum', 51.52, -0.13, 'google', 'museum');
const INDEP = venue('fp-os-keepme', 'Ruskin Park', 51.464, -0.092, 'os-greenspace');
const SAVED = [BROCKWELL, VICTORIA, SOFTPLAY, STILL, INDEP];
const DAYS = [day('d-brockwell', BROCKWELL.id), day('d-other', INDEP.id)];

/** What the stored catalogue answers near each saved place. */
function catalogueFor(lat, lng) {
  const near = (a, b, m) => Math.hypot((a - lat) * 111320, (b - lng) * 70000) < m;
  const rows = [];
  if (near(51.451, -0.1066, 600)) rows.push(record('fp-os-brockwell', 'Brockwell Park', 51.4512, -0.1068));
  if (near(51.5362, -0.0414, 600)) rows.push(record('fp-os-vic-a', 'Victoria Park', 51.5361, -0.0415), record('fp-os-vic-b', 'Victoria Park Gardens', 51.5364, -0.0412));
  if (near(51.52, -0.13, 600)) rows.push(record('fp-google-ChIJstill', 'Still Listed Museum', 51.52, -0.13, 'google', 'museum'));
  if (near(51.48, -0.2, 600)) rows.push(record('fp-os-elsewhere', 'Peckham Rye Park', 51.4801, -0.2001));
  return rows;
}

const state = { catalogueRequests: [], googleRequests: [], pageErrors: [] };

async function open(browser, { route, saved = SAVED, days = DAYS, catalogue = 'normal', width = 393 }) {
  const context = await browser.newContext({ viewport: { width, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  page.on('pageerror', (e) => state.pageErrors.push(String(e.message).slice(0, 200)));
  page.on('request', (r) => { if (GOOGLE_HOST.test(new URL(r.url()).hostname)) state.googleRequests.push(r.url()); });
  await page.addInitScript(([profile, savedItems, planned]) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('familypilot-family-v1', JSON.stringify(profile));
    localStorage.setItem('familypilot-saved-v2', JSON.stringify({ state: { savedIds: savedItems.map((i) => i.venue.id), items: savedItems }, version: 0 }));
    localStorage.setItem('familypilot-planning-v1', JSON.stringify({ state: { families: [], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: planned, planningWith: null }, version: 1 }));
  }, [PROFILE, saved.map(item), days]);
  await page.route('**/api/places/search**', async (r) => {
    const url = new URL(r.request().url());
    if (url.searchParams.get('intent') !== 'catalogue') return r.fallback();
    state.catalogueRequests.push({ lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')), keys: [...url.searchParams.keys()].sort() });
    if (catalogue === 'down') return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The venue catalogue is unavailable', code: 'CATALOGUE_UNAVAILABLE', googleCalls: 0 }) });
    const places = catalogueFor(Number(url.searchParams.get('lat')), Number(url.searchParams.get('lng')));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ places, total: places.length, returned: places.length, hasMore: false, nextCursor: null, countsByCategory: {}, provider: 'catalogue', intent: 'catalogue', googleCalls: 0, fetchedAt: new Date().toISOString() }) });
  });
  // The old Google listings no longer resolve (the server answers as it will after the cutover).
  await page.route('**/api/places/detail**', (r) => {
    const id = new URL(r.request().url()).searchParams.get('id') ?? '';
    if (id.startsWith('fp-google-')) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Live place details are switched off', code: 'PLACES_DISABLED' }) });
    return r.fallback();
  });
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1800);
  return { context, page };
}

const stored = (page) => page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('familypilot-saved-v2') || '{}').state, planning: JSON.parse(localStorage.getItem('familypilot-planning-v1') || '{}').state }));
const count = (page, testId) => page.locator(`[data-testid="${testId}"]`).count();
const withPrefix = (page, prefix) => page.locator(`[data-testid^="${prefix}"]`).count();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });

// ---------- 1 and 2 and 3 and 4: the Saved screen
{
  const { context, page } = await open(browser, { route: '/saved' });
  const before = await stored(page);
  check('1  the line shows under a place whose old listing is gone (three of them)', (await withPrefix(page, 'reconnect-line-')) === 3, `lines: ${await withPrefix(page, 'reconnect-line-')}`);
  check('4  no line for a place that is still listed, or for an independent one', (await count(page, `reconnect-line-${STILL.id}`)) === 0 && (await count(page, `reconnect-line-${INDEP.id}`)) === 0);
  check('4  the independent place made no catalogue request (it cannot have lost its listing)', !state.catalogueRequests.some((q) => Math.abs(q.lat - INDEP.latitude) < 1e-6 && Math.abs(q.lng - INDEP.longitude) < 1e-6));
  check('1  the line says "has a new listing" with a Reconnect control', /new listing/i.test(await page.getByTestId(`reconnect-line-${BROCKWELL.id}`).innerText()) && (await count(page, `reconnect-open-${BROCKWELL.id}`)) === 1);

  // axe on the screen with the lines, then with the sheet open
  // axe over exactly what this change adds (the lines, and the sheet). The rows themselves already have one finding on main (a button nested in the
  // row's button, `nested-interactive`; measured on main with three saved rows), which is not this change's to fix, so it is not in scope here.
  const runAxe = async (label, selector) => {
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(async (sel) => axe.run({ include: [[sel]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }), selector);
    check(`8  axe: no WCAG A/AA violation (${label})`, result.violations.length === 0, result.violations.map((v) => `${v.id} x${v.nodes.length} [${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}]`).join('; '));
  };
  await runAxe('the reconnect lines', '[data-testid^="reconnect-line-"]');

  // 2: look-alikes, decline
  await page.getByTestId(`reconnect-open-${VICTORIA.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 5000 });
  check('2  both look-alikes are offered, with the "more than one place" note', (await withPrefix(page, 'reconnect-candidate-')) === 2 && (await count(page, 'reconnect-ambiguous')) === 1);
  const box = await page.getByTestId('reconnect-decline').boundingBox();
  check('8  "None of these" is at least 44 px tall', box && box.height >= 44, `${box?.height}`);
  await runAxe('the sheet open', '[data-testid="reconnect-sheet"]');
  await page.getByTestId('reconnect-decline').click();
  await page.waitForTimeout(500);
  check('2  declining closes the sheet', (await count(page, 'reconnect-sheet')) === 0);
  const afterDecline = await stored(page);
  check('2  declining changes nothing in the saved places or the saved days', JSON.stringify(afterDecline) === JSON.stringify(before));
  check('2  the line is still there to reopen', (await count(page, `reconnect-line-${VICTORIA.id}`)) === 1);

  // 3: nothing similar
  await page.getByTestId(`reconnect-open-${SOFTPLAY.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 5000 });
  check('3  no successor: the line and sheet say it is not listed, and offer only Keep and Remove', /isn.t listed any more/i.test(await page.getByTestId(`reconnect-line-${SOFTPLAY.id}`).innerText()) && (await count(page, 'reconnect-gone')) === 1 && (await count(page, 'reconnect-keep')) === 1 && (await count(page, 'reconnect-remove')) === 1 && (await withPrefix(page, 'reconnect-candidate-')) === 0);
  await page.getByTestId('reconnect-keep').click();
  await page.waitForTimeout(400);
  check('3  Keep changes nothing', JSON.stringify(await stored(page)) === JSON.stringify(before));

  // 1: confirm Brockwell
  await page.getByTestId(`reconnect-open-${BROCKWELL.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 5000 });
  check('1  one candidate is offered, with its kind and distance', (await withPrefix(page, 'reconnect-candidate-')) === 1 && /Park/.test(await page.getByTestId('reconnect-candidate-fp-os-brockwell').innerText()));
  await page.getByTestId('reconnect-confirm-fp-os-brockwell').click();
  await page.waitForTimeout(900);
  const after = await stored(page);
  const row = after.saved.items.find((i) => i.id === `saved-${BROCKWELL.id}`);
  check('1  the saved place now points at the new venue and keeps its group, saved time and row id', row && row.venue.id === 'fp-os-brockwell' && row.group === 'want' && row.savedAt === '2026-09-01T10:00:00.000Z', JSON.stringify(row?.venue?.id));
  check('1  the saved ids are updated in place', after.saved.savedIds.includes('fp-os-brockwell') && !after.saved.savedIds.includes(BROCKWELL.id));
  const d1 = after.planning.savedDays.find((d) => d.id === 'd-brockwell');
  check('1  the day built from it will rebuild from the new venue', d1.draft.venueId === 'fp-os-brockwell');
  check('1  that day\'s itinerary is byte-for-byte what was planned', JSON.stringify(d1.source) === JSON.stringify(before.planning.savedDays.find((d) => d.id === 'd-brockwell').source));
  check('1  the other saved day is untouched', JSON.stringify(after.planning.savedDays.find((d) => d.id === 'd-other')) === JSON.stringify(before.planning.savedDays.find((d) => d.id === 'd-other')));
  check('1  the other saved places are untouched', after.saved.items.filter((i) => i.id !== `saved-${BROCKWELL.id}`).every((i) => JSON.stringify(i) === JSON.stringify(before.saved.items.find((b) => b.id === i.id))));
  const notice = await page.getByTestId('reconnect-notice').innerText();
  check('1  the notice says what happened and that plans already made are unchanged', /Brockwell Park is now your saved place\. Plans you have already made are unchanged\./.test(notice), notice);
  check('1  the line for that place is gone', (await count(page, `reconnect-line-${BROCKWELL.id}`)) === 0);

  // remove path
  await page.getByTestId(`reconnect-open-${SOFTPLAY.id}`).click();
  await page.getByTestId('reconnect-remove').click();
  await page.waitForTimeout(600);
  const afterRemove = await stored(page);
  check('3  Remove is its own tap and removes only that place', !afterRemove.saved.items.some((i) => i.venue.id === SOFTPLAY.id) && afterRemove.saved.items.length === after.saved.items.length - 1);
  await context.close();
}

// ---------- 5: the catalogue is down
{
  const { context, page } = await open(browser, { route: '/saved', catalogue: 'down' });
  const before = await stored(page);
  check('5  catalogue down: no line, no sheet, the rows as before', (await withPrefix(page, 'reconnect-line-')) === 0 && (await count(page, 'reconnect-sheet')) === 0 && (await page.locator('text=Brockwell Park').count()) > 0);
  check('5  catalogue down: nothing in storage changed', JSON.stringify(await stored(page)) === JSON.stringify(before));
  await context.close();
}

// ---------- 6: the venue page
{
  const { context, page } = await open(browser, { route: `/venue/${BROCKWELL.id}` });
  await page.getByTestId('reconnect-offer').waitFor({ timeout: 15000 }).catch(() => {});
  const text = await page.evaluate(() => document.body.innerText);
  check('6  the venue page offers to reconnect instead of "Could not load this place"', (await count(page, 'reconnect-offer')) === 1 && /new listing/i.test(text) && !/Could not load this place/.test(text), text.slice(0, 160));
  await page.getByText('Look at the new listing').first().click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 5000 });
  await page.getByTestId('reconnect-confirm-fp-os-brockwell').click();
  await page.waitForTimeout(1500);
  check('6  confirming opens the new venue', page.url().includes('/venue/fp-os-brockwell'), page.url());
  const after = await stored(page);
  check('6  and the saved place and day were repointed', after.saved.items.some((i) => i.venue.id === 'fp-os-brockwell') && after.planning.savedDays.some((d) => d.draft?.venueId === 'fp-os-brockwell'));
  await context.close();
}
{
  const { context, page } = await open(browser, { route: '/venue/fp-google-ChIJnobodysaved' });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  check('6  an address nobody saved keeps today\'s wording', (await count(page, 'reconnect-offer')) === 0 && /Could not load this place|Place not found/.test(text), text.slice(0, 120));
  await context.close();
}

// ---------- 7
check('7  every lookup was the stored-catalogue read with only intent, lat, lng, radius and limit', state.catalogueRequests.length > 0 && state.catalogueRequests.every((q) => q.keys.join(',') === 'intent,lat,limit,lng,radiusKm'), JSON.stringify(state.catalogueRequests[0]));
check('7  no request went to a Google host', state.googleRequests.length === 0, state.googleRequests.join(' '));
check('7  no page error', state.pageErrors.length === 0, state.pageErrors.join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
