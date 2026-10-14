/**
 * Google's Places terms do not allow Places content to be used with a map that is not a Google map. FamilyPilot's Meet halfway map is
 * drawn on the device (Natural Earth), not by Google, and every place it is served today is a Google Places row. This proves, in a real
 * browser, that:
 *
 *   A. Google places           no map, no Map/List toggle, a plain list that says the map is off, every card able to open the place and
 *                              plan the day, Google's credit shown, and no request to a Google host
 *   B. independent places      the map, the pins and the toggle are all there (so the compliant path still works)
 *   C. a mix                   one Google place among independent ones switches the map off (Google content is never beside the map)
 *   D. no places yet           the map shows only the two families' areas, with no pin
 *
 * Serve first: node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/verify-map-compliance.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { asProvider } from './lib/place-provider.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const FIGMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'halfway-figma-places.json'), 'utf8'));

const PROFILE = {
  id: 'family-mc', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy'] },
  ],
  homeLocation: 'NW3', homeLatitude: 51.556, homeLongitude: -0.178, budgetTier: 'moderate', completionPercent: 90, vehicle: null,
  pushchair: 'Bugaboo Butterfly', travelCot: null, memberships: [], mustHaveFacilities: [], routines: [],
};
const KEVIN = { id: 'guest-k', label: 'Kevin’s family', area: 'E8', latitude: 51.545, longitude: -0.06, ages: [2], pushchair: true, required: ['toilets'], routines: [] };
const PLANNING = JSON.stringify({ state: { families: [KEVIN], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 });
const FAMILY = JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 });

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

/** Open Meet halfway served `payload`, and return what the screen did. */
async function open(label, payload, waitFor) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  const googleRequests = [];
  const errors = [];
  page.on('request', (r) => { if (/googleapis|maps\.google|google\.com\/maps|gstatic/i.test(r.url())) googleRequests.push(r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-17T07:00:00'));
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: PLANNING, f: FAMILY });
  await page.route((u) => /intent=between/.test(u.toString()), (route) => route.fulfill({ json: payload }));
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' });
  await page.getByTestId(waitFor).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-${name}.png`) }); };
  return { context, page, googleRequests, errors, shot };
}

// ---------------------------------------------------------------- A. Google places
console.log('A. Google places: no map, a usable list');
{
  const { context, page, googleRequests, errors, shot } = await open('A-google', FIGMA, 'halfway-list');
  await shot('list');
  check((await page.getByTestId('halfway-map').count()) === 0, 'no map is drawn');
  check((await page.getByTestId('halfway-toggle').count()) === 0, 'there is no Map and List toggle to switch it on');
  check((await page.locator('[data-testid^="halfway-map-pin"],[data-testid="halfway-map-venue"]').count()) === 0, 'no pin of any kind');
  const off = page.getByTestId('halfway-map-off');
  check((await off.count()) === 1 && /list/i.test(await off.innerText()), 'it says the map is off and the list is the way in', (await off.count()) ? await off.innerText() : 'missing');
  const cards = await page.getByTestId('halfway-option').count();
  check(cards >= 3, 'every place is listed as a card', `${cards} cards`);
  const plans = await page.getByTestId('halfway-plan').count();
  check(plans === cards, 'every card can plan the day without a map', `${plans} of ${cards}`);
  const text = await page.evaluate(() => document.body.innerText);
  check(/Google Maps/.test(text), "Google's credit is shown with Google's places");
  check(!/numbered pin|on the map/i.test(text), 'no copy still refers to pins or to the map');
  const firstName = await page.getByTestId('halfway-option-head').first().getAttribute('aria-label');
  check(/Open this place/.test(firstName ?? ''), 'the card says what a tap does', (firstName ?? '').slice(-40));
  await page.getByTestId('halfway-option-head').first().click();
  await page.waitForTimeout(2000);
  check(/\/venue\//.test(page.url()), 'tapping a card opens the place, not a map that is off', page.url().replace(BASE, ''));
  check(googleRequests.length === 0, 'no request reached a Google host', googleRequests.join(', '));
  check(errors.length === 0, 'no runtime errors', errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- B. independent places
console.log('B. independently located places: the map still works');
{
  const { context, page, googleRequests, errors, shot } = await open('B-osm', asProvider(FIGMA, 'osm'), 'halfway-sheet-collapsed');
  await shot('map');
  check((await page.getByTestId('halfway-map').count()) === 1, 'the map is drawn');
  const pins = await page.locator('[data-testid^="halfway-map-pin"],[data-testid="halfway-map-venue"]').count();
  check(pins >= 3, 'the places are pins', `${pins}`);
  check((await page.getByTestId('halfway-toggle').count()) === 1, 'the Map and List toggle is there');
  check((await page.getByTestId('halfway-map-off').count()) === 0, 'there is no "map is off" note');
  const text = await page.evaluate(() => document.body.innerText);
  check(!/Google Maps/.test(text), "no Google credit where there is no Google place");
  await page.getByTestId('halfway-mode-list').click();
  await page.waitForTimeout(800);
  check((await page.getByTestId('halfway-list').count()) === 1, 'the list is one tap away');
  check(googleRequests.length === 0, 'no request reached a Google host');
  check(errors.length === 0, 'no runtime errors', errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- C. a mix
console.log('C. one Google place among independent ones: no map');
{
  const mixed = { ...FIGMA, places: FIGMA.places.map((p, i) => ({ ...p, provider: i === 1 ? 'google' : 'osm' })) };
  const { context, page, shot } = await open('C-mixed', mixed, 'halfway-list');
  await shot('list');
  check((await page.getByTestId('halfway-map').count()) === 0, 'no map');
  check((await page.getByTestId('halfway-toggle').count()) === 0, 'no toggle');
  check((await page.getByTestId('halfway-map-off').count()) === 1, 'the list says why');
  await context.close();
}

// ---------------------------------------------------------------- D. no places
console.log('D. no places yet: the map shows only the two families, no pin');
{
  const { context, page, shot } = await open('D-empty', { ...FIGMA, places: [], considered: 0, shortlisted: 0 }, 'halfway-map');
  await shot('map');
  check((await page.getByTestId('halfway-map').count()) === 1, 'the map is drawn with the two areas');
  check((await page.getByTestId('halfway-map-area-mine').count()) === 1 && (await page.getByTestId('halfway-map-area-other').count()) === 1, 'both families are drawn as areas');
  check((await page.locator('[data-testid^="halfway-map-pin"],[data-testid="halfway-map-venue"]').count()) === 0, 'no pin');
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
