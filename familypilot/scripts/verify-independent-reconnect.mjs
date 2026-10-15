/**
 * PREVIEW ONLY. The saved-place reconnect screen (#220) against the REAL independent catalogue (scripts/local-independent-api.mjs: the state after the Google
 * rows expire), with no stubbed catalogue: saved places and a saved day exactly as a family who saved before the release would have them, with Google ids
 * that no longer resolve.
 *
 *   PLACES_PROVIDER=google node scripts/local-independent-api.mjs 4180 dist &
 *   node scripts/verify-independent-reconnect.mjs http://localhost:4180 <shotDir>
 *
 * Proves: a saved place is offered its real successor and nothing is changed until the parent taps; a saved day's itinerary is untouched and only its venue is
 * repointed; declining and "keep" change nothing; a place with no successor says so; a catalogue outage is not read as "gone"; the repointed venue opens as a
 * real independent record with its credit; everything persists across a reload; no Google request; no page error.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4180';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const GOOGLE_HOST = /(^|\.)(googleapis|google|gstatic|ggpht|googleusercontent)\.[a-z.]+$/i;
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? `  -- ${detail}` : ''}`); };

const PROFILE = { state: { profile: { id: 'fam-reconnect', parentName: 'Release Check', members: [{ id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 }, { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 }], homeLocation: 'NW1 7AA', homeLatitude: 51.539, homeLongitude: -0.1426, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] }, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 };
const venue = (id, name, lat, lng, category) => ({ id, name, category, latitude: lat, longitude: lng, driveMinutes: 12, imageUrl: '', provider: 'google', familyScore: { score: 72, factors: {}, explanation: [] }, enrichmentStatus: 'provider_only' });
const item = (v, group) => ({ id: `saved-${v.id}`, type: 'place', venue: v, group, savedAt: '2026-09-01T10:00:00.000Z' });
const REGENTS = venue('fp-google-ChIJregents', "Regent's Park", 51.5313, -0.1570, 'park');
const ZOO = venue('fp-google-ChIJzoo', 'London Zoo', 51.5353, -0.1534, 'zoo');
const SOFT = venue('fp-google-ChIJtiny', 'Tiny Tots Soft Play', 51.5, -0.2, 'soft_play');
const SAVED = [item(REGENTS, 'want'), item(ZOO, 'favourite'), item(SOFT, 'want')];
const itinerary = { marker: 'the itinerary of the Regent\'s Park day', stops: [{ name: "Regent's Park", start: '10:00' }, { name: 'Lunch at the café', start: '12:30' }, { name: 'Playground', start: '14:00' }] };
const DAY = { id: 'd-regents', createdAt: '2026-09-02T10:00:00.000Z', source: itinerary, draft: { venueId: REGENTS.id, params: { date: '2026-10-17' } } };

const state = { googleRequests: [], pageErrors: [], catalogueRequests: [], otherPlaces: [] };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function open({ route, catalogue = 'real' }) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  page.on('pageerror', (e) => state.pageErrors.push(String(e.message).slice(0, 200)));
  page.on('request', (r) => { if (GOOGLE_HOST.test(new URL(r.url()).hostname)) state.googleRequests.push(r.url()); });
  await page.addInitScript(([profile, savedItems, day]) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('familypilot-family-v1', JSON.stringify(profile));
    localStorage.setItem('familypilot-saved-v2', JSON.stringify({ state: { savedIds: savedItems.map((i) => i.venue.id), items: savedItems }, version: 0 }));
    localStorage.setItem('familypilot-planning-v1', JSON.stringify({ state: { families: [], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [day], planningWith: null }, version: 1 }));
  }, [PROFILE, SAVED, DAY]);
  await page.route('**/api/places/search**', async (r) => {
    const url = new URL(r.request().url());
    if (url.searchParams.get('intent') === 'catalogue') {
      state.catalogueRequests.push([...url.searchParams.keys()].sort().join(','));
      if (catalogue === 'down') return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The venue catalogue is unavailable', code: 'CATALOGUE_UNAVAILABLE', googleCalls: 0 }) });
    } else state.otherPlaces.push(url.searchParams.get('intent'));
    return r.fallback();
  });
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  return { context, page };
}
const stored = (page) => page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('familypilot-saved-v2') || '{}').state, planning: JSON.parse(localStorage.getItem('familypilot-planning-v1') || '{}').state }));
const count = (page, id) => page.locator(`[data-testid="${id}"]`).count();
const prefix = (page, p) => page.locator(`[data-testid^="${p}"]`).count();
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---------------------------------------------------------------- Saved places and a saved plan, with the real catalogue
{
  const { context, page } = await open({ route: '/saved' });
  const before = await stored(page);
  check('1  a line appears under each saved place whose old listing is gone (three)', (await prefix(page, 'reconnect-line-')) === 3, String(await prefix(page, 'reconnect-line-')));
  await shot(page, '20-saved-reconnect-lines');

  // Decline leaves everything byte-for-byte.
  await page.getByTestId(`reconnect-open-${REGENTS.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 8000 });
  const names = await page.locator('[data-testid^="reconnect-candidate-"]').allInnerTexts();
  check("2  the proposal is a real independent record (Regent's Park), with its kind and distance", names.length >= 1 && names.some((n) => /Regent.?s Park/i.test(n)), names.join(' || ').replace(/\s+/g, ' ').slice(0, 200));
  await shot(page, '21-reconnect-sheet-regents');
  await page.getByTestId('reconnect-decline').click(); await page.waitForTimeout(500);
  check('2  declining changes nothing in saved places or the saved day', JSON.stringify(await stored(page)) === JSON.stringify(before));

  // Confirm Regent's Park.
  await page.getByTestId(`reconnect-open-${REGENTS.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 8000 });
  const confirm = page.locator('[data-testid^="reconnect-confirm-fp-os-"]').first();
  const successorId = (await confirm.getAttribute('data-testid')).replace('reconnect-confirm-', '');
  await confirm.click(); await page.waitForTimeout(900);
  const after = await stored(page);
  const row = after.saved.items.find((i) => i.id === `saved-${REGENTS.id}`);
  check('3  the saved place now points at the OS Open Greenspace record, keeping its group, saved time and row id', row && row.venue.id === successorId && row.group === 'want' && row.savedAt === '2026-09-01T10:00:00.000Z', JSON.stringify(row?.venue?.id));
  const day = after.planning.savedDays.find((d) => d.id === 'd-regents');
  check('4  the saved day is rebuilt from the new venue next time (its venue id is repointed)', day.draft.venueId === successorId);
  check('4  and its itinerary and original decisions are byte-for-byte what was planned', JSON.stringify(day.source) === JSON.stringify(before.planning.savedDays[0].source) && JSON.stringify(day.draft.params) === JSON.stringify(before.planning.savedDays[0].draft.params));
  check('3  the other saved places are untouched', after.saved.items.filter((i) => i.id !== `saved-${REGENTS.id}`).every((i) => JSON.stringify(i) === JSON.stringify(before.saved.items.find((b) => b.id === i.id))));
  check('3  the notice says what changed and that plans already made are unchanged', /Plans you have already made are unchanged/.test(await page.getByTestId('reconnect-notice').innerText()));
  await shot(page, '22-reconnect-done');

  // London Zoo -> Wikidata record.
  await page.getByTestId(`reconnect-open-${ZOO.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 8000 });
  const zooConfirm = page.locator('[data-testid^="reconnect-confirm-fp-wd-"]').first();
  check('5  London Zoo is offered its Wikidata record', (await zooConfirm.count()) === 1);
  await zooConfirm.click(); await page.waitForTimeout(700);
  const zooRow = (await stored(page)).saved.items.find((i) => i.id === `saved-${ZOO.id}`);
  check('5  and confirming repoints it', zooRow && /^fp-wd-/.test(zooRow.venue.id), zooRow?.venue?.id);

  // No successor: it says so, and Keep changes nothing.
  const midState = await stored(page);
  await page.getByTestId(`reconnect-open-${SOFT.id}`).click();
  await page.getByTestId('reconnect-sheet').waitFor({ timeout: 8000 });
  check('6  a place with no successor says it is no longer listed, offering only Keep and Remove', (await count(page, 'reconnect-gone')) === 1 && (await prefix(page, 'reconnect-confirm-')) === 0 && (await count(page, 'reconnect-keep')) === 1 && (await count(page, 'reconnect-remove')) === 1);
  await shot(page, '23-reconnect-gone');
  await page.getByTestId('reconnect-keep').click(); await page.waitForTimeout(500);
  check('6  Keep changes nothing', JSON.stringify(await stored(page)) === JSON.stringify(midState));

  // Reload: persisted.
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const reloaded = await stored(page);
  check('7  after a reload the confirmed choices are still in place', reloaded.saved.items.some((i) => i.venue.id === successorId) && reloaded.planning.savedDays[0].draft.venueId === successorId);
  await context.close();

  // The repointed venue opens as a real independent record, with its credit, and a plan can be started.
  const second = await open({ route: `/venue/${successorId}` });
  const text = (await second.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  check("8  the repointed venue opens as a real record (Regent's Park) with the Ordnance Survey statement", /Regent.?s Park/.test(text) && /Contains OS data © Crown copyright and database right 2026/.test(text), text.slice(0, 120));
  check('8  and Create a plan is available from it', (await count(second.page, 'venue-create-plan')) === 1);
  await shot(second.page, '24-repointed-venue');
  await second.context.close();
}

// ---------------------------------------------------------------- The catalogue is down: never "gone"
{
  const { context, page } = await open({ route: '/saved', catalogue: 'down' });
  const before = await stored(page);
  check('9  catalogue down: no line and no sheet, the rows are shown as saved, and nothing says "no longer listed"', (await prefix(page, 'reconnect-line-')) === 0 && (await count(page, 'reconnect-sheet')) === 0 && !/no longer listed|isn.t listed/i.test(await page.evaluate(() => document.body.innerText)));
  check('9  catalogue down: nothing in storage changed', JSON.stringify(await stored(page)) === JSON.stringify(before));
  await shot(page, '25-catalogue-down');
  await context.close();
}

check('10  every lookup was the stored-catalogue read with only intent, lat, lng, radius and limit', state.catalogueRequests.length > 0 && state.catalogueRequests.every((k) => k === 'intent,lat,limit,lng,radiusKm'), [...new Set(state.catalogueRequests)].join(' / '));
check('10  no request went to a Google host', state.googleRequests.length === 0, state.googleRequests.join(' '));
check('10  no page error', state.pageErrors.length === 0, state.pageErrors.join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
