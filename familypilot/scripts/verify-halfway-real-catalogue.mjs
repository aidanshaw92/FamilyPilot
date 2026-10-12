/**
 * Meet halfway against REAL stored catalogue rows (read-only data from the hosted database, supplied as a file), through
 * the real first-pass logic, with two synthetic households. Nothing is fetched from Google or any provider.
 *
 * Checks the numbered pins match the cards, a card selects its pin and a pin selects its card, each family's journey is
 * its own estimated line, a place that is shut on the chosen day is not offered (Monday versus Saturday, from the stored
 * opening hours), choosing the other family changes the answer, only areas (never a precise home) are shown, and the only
 * network traffic is the fixture's own origin with zero requests to Google.
 *
 * Serve first:
 *   FIXTURE_SCENARIO=realistic FIXTURE_CATALOGUE_ROWS=<rows.json> node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/verify-halfway-real-catalogue.mjs <baseUrl> <rows.json>
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const ROWS = JSON.parse(readFileSync(process.argv[3] ?? '/tmp/claude-0/ux/real-catalogue.json', 'utf8'));
const REAL_IDS = new Set(ROWS.map((r) => r.familypilot_place_id));
const CLOSED_MONDAY = ['Whitechapel Gallery', 'Museum of the Home', 'Hackney City Farm', 'The Postal Museum'];

const PROFILE = {
  id: 'fam-halfway', parentName: 'Mina Test', members: [
    { id: 'p1', name: 'Mina Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Kid One', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.5390, homeLongitude: -0.1420, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const guest = (id, label, area, latitude, longitude) => ({ id: `guest-${id}`, label, area, latitude, longitude, ages: [3], maxDriveMinutes: 60, pushchair: false, required: [], routines: [] });
const PLANNING = { state: { families: [guest('hannah', 'Hannah', 'Lewisham', 51.4600, -0.0100), guest('priya', 'Priya', 'Walthamstow', 51.5850, -0.0200)], options: { date: '2026-10-19', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function run(label, today) {
  console.log(`\n${label} (${today})`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${today}T07:00:00`));
  const outside = []; const google = []; const between = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/googleapis|maps\.google/i.test(r.url())) google.push(r.url()); if (u.origin !== BASE && !r.url().startsWith('data:')) outside.push(r.url()); });
  page.on('response', async (resp) => { if (resp.url().includes('intent=between')) { try { between.push({ url: resp.url(), body: await resp.json() }); } catch {} } });
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Hannah’s family', exact: true }).first().click();
  await page.getByTestId('halfway-results').waitFor({ timeout: 30000 }); await page.waitForTimeout(1500);

  const cards = page.getByTestId('halfway-option');
  // The card's head says its place in its accessible name: "3. Show Imperial War Museum on the map".
  const heads = () => page.getByTestId('halfway-option-head').evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? '').replace(/^\d+\. Show (.*) on the map$/, '$1')));
  const cardNames = await heads();
  const names = cardNames;
  console.log(`  places: ${cardNames.join(', ')}`);
  check(names.length >= 3, 'real stored places are offered', `${names.length}`);
  const ids = (between[0]?.body.places ?? []).map((p) => p.familypilotId);
  check(ids.length > 0 && ids.every((id) => REAL_IDS.has(id)), 'every candidate is a real stored row', `${ids.length} of ${REAL_IDS.size} stored`);
  check(between[0]?.body.googleCalls === 0 && between[0]?.body.provider === 'stored-catalogue', 'the lookup is a stored-catalogue read with googleCalls 0');

  // pins match the cards
  const pinCount = (await page.getByTestId(/^halfway-map-pin-\d+$/).count()) + (await page.getByTestId('halfway-map-venue').count());
  check(pinCount === names.length, 'one numbered pin per card', `${pinCount} pins, ${names.length} cards`);
  const sel0 = await page.getByTestId('halfway-selected-name').innerText();
  check(sel0.startsWith('1 · '), 'the top recommendation starts selected', sel0);

  // each family's journey is its own estimated line
  const first = (await cards.first().innerText()).replace(/\n+/g, ' | ');
  check(/Your family \| about \d+ min/.test(first) && /Hannah’s family \| about \d+ min/.test(first), 'each family’s journey is its own estimated line', first.match(/Your family \| about \d+ min \| Hannah’s family \| about \d+ min/)?.[0] ?? '');
  const body = (await page.evaluate(() => document.body.innerText));
  check(!/\bscore\b|\bpoints\b|\d+ pts/i.test(body), 'no score or points are shown');
  check(!/51\.46|-0\.01\b|51\.539|-0\.142/.test(body), 'no precise home coordinates are shown');
  check((await page.getByTestId('halfway-map-area-other').count()) === 1, 'the other family is an approximate area on the map');

  // card -> pin, pin -> card
  if (names.length >= 3) {
    await page.getByTestId('halfway-option-head').nth(1).click(); await page.waitForTimeout(700);
    check((await page.getByTestId('halfway-selected-name').innerText()).startsWith('2 · ') && (await page.getByTestId('halfway-selected-name').innerText()).includes(cardNames[1]), 'tapping card 2 selects pin 2', await page.getByTestId('halfway-selected-name').innerText());
    await page.getByTestId('halfway-map-pin-3').click(); await page.waitForTimeout(900);
    const s3 = await page.getByTestId('halfway-selected-name').innerText();
    check(s3.startsWith('3 · ') && s3.includes(cardNames[2]), 'tapping pin 3 selects place 3 and scrolls to its card', s3);
    await page.mouse.wheel(0, 700); await page.waitForTimeout(500);
    const box = await page.getByTestId('halfway-map').boundingBox();
    check(Boolean(box) && box.y >= 0 && box.y < 200, 'the map stays on screen while the cards scroll', box ? `top ${Math.round(box.y)}` : 'none');
  }

  // the other family changes the answer
  await page.mouse.wheel(0, -3000); await page.waitForTimeout(400);
  const hannahSet = ids.join(',');
  await page.getByRole('button', { name: 'Priya’s family', exact: true }).first().click(); await page.waitForTimeout(2500);
  const priyaIds = (between[between.length - 1]?.body.places ?? []).map((p) => p.familypilotId);
  const priyaFirst = (await page.getByTestId('halfway-option').first().innerText()).replace(/\n+/g, ' | ');
  check(between.length >= 2 && priyaIds.join(',') !== hannahSet, 'choosing Priya’s family asks the catalogue again and changes the answer', `${between.length} lookups`);
  check(/Priya’s family \| about \d+ min/.test(priyaFirst), 'and the journeys now name Priya’s family');
  const priyaNames = await heads();
  console.log(`  Priya's places: ${priyaNames.join(', ')}`);

  check(google.length === 0, 'no request to Google', `${google.length}`);
  check(outside.length === 0, 'no request left the fixture origin', outside.slice(0, 2).join(' '));
  await ctx.close();
  return { cardNames, priyaNames, ids };
}

const monday = await run('Monday', '2026-10-19');
const saturday = await run('Saturday', '2026-10-17');
// The corridor to Walthamstow runs through Hackney, where several stored places are shut on Mondays.
const shutOnMonday = CLOSED_MONDAY.filter((n) => monday.priyaNames.some((c) => c.includes(n)));
check(shutOnMonday.length === 0, 'Monday: places the stored hours say are shut on Mondays are not offered', shutOnMonday.join(', ') || 'none offered');
const openSaturday = CLOSED_MONDAY.filter((n) => saturday.priyaNames.some((c) => c.includes(n)));
check(openSaturday.length > 0, 'Saturday: at least one of them is offered (so the Monday absence is the opening hours, not the corridor)', openSaturday.join(', '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
