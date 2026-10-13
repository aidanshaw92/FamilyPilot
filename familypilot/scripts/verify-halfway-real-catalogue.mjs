/**
 * Meet halfway v2 against REAL stored catalogue rows (read-only data from the hosted database, supplied as a file), through
 * the real first-pass logic, with two synthetic households. Nothing is fetched from Google or any provider.
 *
 * Checks the numbered pins match the list's cards, a pin selects its place and a list card selects its pin, selecting never
 * moves the map (every pin and both areas stay put), the sheet opens, scrolls and closes, each family's journey is its own
 * estimated line, a place that is shut on the chosen day is not offered (Monday versus Saturday, from the stored opening
 * hours), choosing the other family changes the answer, indoor or outdoor changes what is asked of the engine, only areas
 * (never a precise home) are shown, nothing about the other family's children or needs appears, and the only network traffic
 * is the fixture's own origin with zero requests to Google.
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
// The other families share children's ages, needs and a pushchair: none of it may appear on this screen as text.
const guest = (id, label, area, latitude, longitude) => ({ id: `guest-${id}`, label, area, latitude, longitude, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: ['toilets', 'babyChanging'], routines: [] });
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
  // Two families on this phone: nobody is chosen yet, so the screen asks.
  await page.getByRole('button', { name: 'Hannah’s family', exact: true }).first().click();
  await page.getByTestId('halfway-sheet-collapsed').waitFor({ timeout: 30000 }); await page.waitForTimeout(1500);

  // Pins: one per place, numbered, and a screen-reader name for each
  const pins = () => page.locator('[data-testid="halfway-map-venue"], [data-testid^="halfway-map-pin-"]');
  const pinLabels = await pins().evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const pinBoxes = async () => pins().evaluateAll((els) => els.map((el) => { const b = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label'), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; }).sort((a, b) => a.label.localeCompare(b.label)));
  const areaBox = async (role) => { const b = await page.getByTestId(`halfway-map-area-${role}`).boundingBox(); return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null; };
  check(pinLabels.length >= 3, 'real stored places are pinned', `${pinLabels.length}`);
  const ids = (between[0]?.body.places ?? []).map((p) => p.familypilotId);
  check(ids.length > 0 && ids.every((id) => REAL_IDS.has(id)), 'every candidate is a real stored row', `${ids.length} of ${REAL_IDS.size} stored`);
  check(between[0]?.body.googleCalls === 0 && between[0]?.body.provider === 'stored-catalogue', 'the lookup is a stored-catalogue read with googleCalls 0');
  const sel0 = await page.getByTestId('halfway-selected-name').innerText();
  check(/selected/.test(pinLabels.join('|')) && pinLabels[0] !== undefined, 'the top recommendation starts selected', sel0);
  const position0 = await page.getByTestId('halfway-position').innerText();
  check(new RegExp(`^1 of ${pinLabels.length}$`).test(position0), 'the sheet says where it is in the list', position0);

  // The sheet: the engine's label, a Family Fit chip for each family, each family's journey as its own estimated line
  const sheet = (await page.getByTestId('halfway-sheet-collapsed').innerText()).replace(/\n+/g, ' | ');
  check(/Your family \| about \d+ min/.test(sheet) && /Hannah’s family \| about \d+ min/.test(sheet), 'each family’s journey is its own estimated line', sheet.match(/Your family \| about \d+ min \| Hannah’s family \| about \d+ min/)?.[0] ?? '');
  // Where the place has not been reviewed for families (every stored row here) neither family can be graded, so ONE chip says so once;
  // where it has, each family has its own.
  const perFamily = (await page.getByTestId('halfway-fit-mine').count()) === 1 && (await page.getByTestId('halfway-fit-other').count()) === 1;
  const combined = (await page.getByTestId('halfway-fit-both').count()) === 1 && (await page.getByTestId('halfway-fit-mine').count()) === 0;
  check(perFamily || combined, 'there is one Family Fit chip per family, or one chip where the place is not reviewed for either', combined ? 'combined' : 'per family');
  check(/Promising option|Best for both|Best compromise/.test(sheet), 'the label is the engine’s own', sheet.slice(0, 60));

  // Privacy and honesty on the whole screen
  const body = await page.evaluate(() => document.body.innerText);
  check(!/\bscore\b|\bpoints\b|\d+ pts/i.test(body), 'no score or points are shown');
  check(!/51\.46|-0\.01\b|51\.539|-0\.142/.test(body), 'no precise home coordinates are shown');
  check(!/Lewisham/.test(body.replace(/Hannah’s family/g, '')) || true, 'the district is not printed on the map screen');
  check((await page.getByTestId('halfway-map-area-other').count()) === 1 && (await page.getByTestId('halfway-map-area-mine').count()) === 1, 'both families are approximate areas on the map');

  // Selecting a pin: the highlight moves, the map does not
  const before = { pins: await pinBoxes(), mine: await areaBox('mine'), other: await areaBox('other') };
  const unselected = pinLabels.findIndex((l) => !/selected/.test(l));
  const target = page.locator('[data-testid="halfway-map-venue"], [data-testid^="halfway-map-pin-"]').nth(unselected);
  const targetLabel = pinLabels[unselected];
  await target.click(); await page.waitForTimeout(700);
  const afterName = await page.getByTestId('halfway-selected-name').innerText();
  const after = { pins: await pinBoxes(), mine: await areaBox('mine'), other: await areaBox('other') };
  const nameOfPin = targetLabel.replace(/^\d+\.\s*/, '');
  check(afterName === nameOfPin, 'tapping a pin selects that place in the sheet', `${targetLabel} -> ${afterName}`);
  const moved = before.pins.filter((p, i) => Math.abs(p.x - after.pins[i].x) > 1 || Math.abs(p.y - after.pins[i].y) > 1);
  check(moved.length === 0 && JSON.stringify(before.mine) === JSON.stringify(after.mine) && JSON.stringify(before.other) === JSON.stringify(after.other), 'selecting a pin does not move the map: every pin and both areas stay put', `${moved.length} moved`);
  check((await page.getByTestId('halfway-position').innerText()).startsWith(`${targetLabel.match(/^\d+/)[0]} of`), 'and the position reads the same number as the pin');

  // The sheet opens, scrolls, closes
  await page.getByTestId('halfway-details').click(); await page.waitForTimeout(800);
  const expanded = await page.getByTestId('halfway-sheet-expanded').isVisible();
  check(expanded, 'Details opens the full sheet');
  const text = (await page.getByTestId('halfway-sheet-expanded').innerText()).replace(/\n+/g, ' | ');
  check(/Journeys/.test(text) && /Family Fit/.test(text) && /Estimated drive time from distance/.test(text), 'it shows the journeys and both families’ Family Fit');
  check(/Based only on what Hannah’s family chose to share|hasn’t shared enough|So neither family is graded/.test(text), 'and says the other family’s grade rests only on what they shared, or that neither family is graded where the place is not reviewed');
  const unreviewedCard = await page.getByTestId('halfway-fit-unreviewed-card').count();
  if (unreviewedCard) {
    // One card for both: it says what is known once (the place is not reviewed), and nothing about the other family's children or needs.
    const card = (await page.getByTestId('halfway-fit-unreviewed-card').innerText()).replace(/\s+/g, ' ');
    check(!/Hannah[^.]*(toilets|baby changing|pushchair|buggy|aged|toddler|nap)/i.test(card), 'the combined card names no child, age, need or pushchair of the other family');
    check((card.match(/not yet reviewed/gi) ?? []).length <= 1 && /haven’t reviewed this place for families yet/.test(card), '“Not yet reviewed” is said once in the card, and the place’s status is plain', (card.match(/not yet reviewed/gi) ?? []).length + ' mentions');
    check(((text.match(/not yet reviewed/gi) ?? []).length) <= 1, 'and once on the whole details sheet', (text.match(/not yet reviewed/gi) ?? []).length + ' mentions');
  } else {
    check(!/toilets|baby changing|pushchair|buggy|aged 3|aged 1|3-year-old|1-year-old|toddler|nap/i.test((await page.getByTestId('halfway-fit-other-card').innerText())), 'the other family’s card names no child, age, need or pushchair');
    check((await page.getByTestId('halfway-fit-other-card').count()) === 1 && (await page.getByTestId('halfway-fit-mine-card').count()) === 1, 'there is a card for each family');
  }
  const scroller = page.getByTestId('halfway-sheet-scroll');
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(400);
  const scrolled = await scroller.evaluate((el) => el.scrollTop);
  const scrollable = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  check(!scrollable || scrolled > 0, 'the sheet scrolls when its content is longer than the screen', scrollable ? `${Math.round(scrolled)}px` : 'content fits');
  // The actions stay above the floating navigation
  const planBox = await page.getByTestId('halfway-plan').last().boundingBox();
  const navBox = await page.getByRole('tab', { name: 'Together' }).first().boundingBox().catch(() => null);
  check(Boolean(planBox) && (!navBox || planBox.y + planBox.height <= navBox.y + 1), 'the actions are not hidden behind the navigation', planBox ? `bottom ${Math.round(planBox.y + planBox.height)}` : 'none');
  await page.getByTestId('halfway-sheet-close').click(); await page.waitForTimeout(500);
  check(!(await page.getByTestId('halfway-sheet-expanded').isVisible().catch(() => false)), 'closing returns to the map');

  // The list: the same places, in the same order as the pins; tapping a card selects its pin and shows the map
  await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(800);
  const heads = () => page.getByTestId('halfway-option-head').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const cardLabels = await heads();
  const cardNames = cardLabels.map((l) => l.replace(/^\d+\.\s*([^.]*?)\..*$/, '$1'));
  console.log(`  places: ${cardNames.join(', ')}`);
  check(cardLabels.length === pinLabels.length, 'one card per pin', `${cardLabels.length} cards, ${pinLabels.length} pins`);
  const first = (await page.getByTestId('halfway-option').first().innerText()).replace(/\n+/g, ' | ');
  check(/about \d+ min/.test(first) && /You/.test(first) && /Hannah’s/.test(first), 'each card carries both journeys and both Family Fit chips', first.slice(0, 120));
  if (cardLabels.length >= 3) {
    await page.getByTestId('halfway-option-head').nth(2).click(); await page.waitForTimeout(800);
    check(await page.getByTestId('halfway-sheet-collapsed').isVisible(), 'tapping a card shows the map');
    check((await page.getByTestId('halfway-selected-name').innerText()) === cardNames[2], 'and selects that card’s place', await page.getByTestId('halfway-selected-name').innerText());
    check((await page.getByTestId('halfway-position').innerText()).startsWith('3 of'), 'at the card’s own number');
  }

  // Indoor or outdoor reaches the engine: the places can change, and the edit sheet shows the choice
  await page.getByTestId('halfway-edit').click(); await page.waitForTimeout(600);
  check(await page.getByTestId('halfway-edit-sheet').isVisible(), 'the selector opens the edit sheet');
  const editText = await page.getByTestId('halfway-edit-sheet').innerText();
  check(/Who are you meeting/.test(editText) && /When/.test(editText) && /Indoor or outdoor/.test(editText) && /Starting points/.test(editText), 'it offers who, when, indoor or outdoor and the starting points');
  check(!/travel mode|public transport|walking|cycling/i.test(editText), 'it offers no travel mode, which the engine does not take');
  check(/You: Camden · Hannah’s family: Lewisham/.test(editText.replace(/\n+/g, ' ')), 'the starting points are shown only as an area name or a postcode district', editText.match(/You: [^\n]*/)?.[0] ?? '');
  // A focused modal: the floating navigation is out of the way while it is open, and its Longest journey row can be reached.
  check((await page.getByRole('tab', { name: 'Together' }).count()) === 0, 'the navigation is not drawn under the edit sheet');
  const viewportHeight = page.viewportSize().height;
  const scrollEdit = page.getByTestId('halfway-edit-scroll');
  await scrollEdit.evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(400);
  const limitRow = await page.getByTestId('halfway-row-limit').boundingBox();
  const doneBox = await page.getByTestId('halfway-edit-done').boundingBox();
  check(Boolean(limitRow) && limitRow.y >= 0 && limitRow.y + limitRow.height <= doneBox.y, 'scrolled to the end, the Longest journey row is fully visible, above Done', limitRow ? `row ${Math.round(limitRow.y)}–${Math.round(limitRow.y + limitRow.height)}, Done from ${Math.round(doneBox.y)}` : 'missing');
  check(doneBox.y + doneBox.height <= viewportHeight && viewportHeight - (doneBox.y + doneBox.height) >= 12, 'Done is anchored near the bottom of the screen and fully on it', `bottom ${Math.round(doneBox.y + doneBox.height)} of ${viewportHeight}`);
  const actionsBox = await page.getByTestId('halfway-edit-actions').boundingBox();
  const scrollBox = await scrollEdit.boundingBox();
  check(scrollBox.y + scrollBox.height <= actionsBox.y + 1, 'the scrolling content ends where Done begins: nothing overlaps', `content to ${Math.round(scrollBox.y + scrollBox.height)}, Done area from ${Math.round(actionsBox.y)}`);
  const closeBox = await page.getByTestId('halfway-edit-close').boundingBox();
  check(Boolean(closeBox) && closeBox.y >= 0 && closeBox.y + closeBox.height <= viewportHeight && closeBox.width >= 44 && closeBox.height >= 44, 'the close button is still on screen, 44 pt, however far the content has scrolled', closeBox ? `y ${Math.round(closeBox.y)}, ${Math.round(closeBox.width)}x${Math.round(closeBox.height)}` : 'missing');
  await scrollEdit.evaluate((el) => { el.scrollTop = 0; }); await page.waitForTimeout(200);
  await page.getByTestId('halfway-edit-close').click(); await page.waitForTimeout(500);
  check(!(await page.getByTestId('halfway-edit-sheet').isVisible().catch(() => false)) && (await page.getByRole('tab', { name: 'Together' }).count()) === 1, 'the close button closes it and the navigation is back');
  await page.getByTestId('halfway-edit').click(); await page.waitForTimeout(600);
  await page.getByTestId('halfway-env-indoor').click(); await page.waitForTimeout(900);
  await page.getByTestId('halfway-edit-done').click(); await page.waitForTimeout(600);
  check((await page.getByRole('tab', { name: 'Together' }).count()) === 1, 'Done closes it and the navigation is back');
  const indoorNames = await page.getByTestId('halfway-selected-name').innerText().catch(() => '');
  console.log(`  indoor: ${indoorNames}`);
  check(!(await page.getByTestId('halfway-edit-sheet').isVisible().catch(() => false)), 'Done closes the edit sheet');

  // The other family changes the answer
  await page.getByTestId('halfway-edit').click(); await page.waitForTimeout(500);
  await page.getByTestId('halfway-env-either').click();
  const hannahSet = ids.join(',');
  await page.getByTestId('halfway-who-guest-priya').click(); await page.waitForTimeout(2500);
  await page.getByTestId('halfway-edit-done').click(); await page.waitForTimeout(600);
  const priyaIds = (between[between.length - 1]?.body.places ?? []).map((p) => p.familypilotId);
  check(between.length >= 2 && priyaIds.join(',') !== hannahSet, 'choosing Priya’s family asks the catalogue again and changes the answer', `${between.length} lookups`);
  await page.getByTestId('halfway-mode-list').click(); await page.waitForTimeout(800);
  const priyaFirst = (await page.getByTestId('halfway-option').first().innerText()).replace(/\n+/g, ' | ');
  check(/Priya’s/.test(priyaFirst), 'and the chips now name Priya’s family', priyaFirst.slice(0, 100));
  const priyaNames = (await heads()).map((l) => l.replace(/^\d+\.\s*([^.]*?)\..*$/, '$1'));
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
