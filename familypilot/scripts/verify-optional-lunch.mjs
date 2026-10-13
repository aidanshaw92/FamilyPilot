/**
 * Lunch is the parent's call, end to end in a real browser: the day is built without a lunch; the plan asks once; "No thanks"
 * is remembered through save, reopen and edit; a place is chosen with its evidence and confirmed before it enters the day; the
 * parent's own place is shown as entered with nothing invented; a day saved before lunch was optional keeps its lunch; and no
 * request reaches Google at any point (places to eat come from the OpenStreetMap lookup the venue page already made).
 *
 * Serve first: FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4173 <dist>
 * Usage: node scripts/verify-optional-lunch.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const KEY = 'familypilot-planning-v1';
const PROFILE = { id: 'fam-l', parentName: 'Sarah Test', members: [
  { id: 'p1', name: 'Sarah Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
  { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2023-04-10', dobKnown: true, age: 3 },
  { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2026-02-22', dobKnown: true, age: 0, ageMonths: 7 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.539, homeLongitude: -0.142, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const PLANNING = { state: { families: [], options: { date: '2026-10-14', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const google = [];
const settle = async (page, ms = 1200) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const flat = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const waitPlan = async (page) => { await page.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 }); await settle(page, 900); };
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{"state":{}}').state.savedDays ?? [], KEY);
const disabled = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true' || (await loc.isDisabled());
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
const page = await ctx.newPage();
page.on('request', (r) => { if (/googleapis|maps\.google/i.test(r.url())) google.push(r.url()); });
await page.clock.setFixedTime(new Date('2026-10-14T07:30:00'));
await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });

// ------------------------------------------------------------------ 1. built without lunch; the question
console.log('1. the plan is built around the place, the journey and the routines; lunch is a question');
await page.goto(`${BASE}/explore`); await settle(page, 2200);
await page.getByText(/View (family )?details/).first().click(); await settle(page, 1800);
await page.getByTestId('venue-create-plan').click(); await page.waitForTimeout(900);
await page.getByTestId('create-plan-submit').click(); await waitPlan(page);
let text = await flat(page);
check(!/Lunch at /.test(text) && !/Leave for lunch/.test(text), 'no lunch stop in the day as built');
check(!/Lunch isn’t added/.test(text), 'and nothing is said about a lunch being dropped');
check((await page.getByTestId('plan-lunch-ask').count()) === 1 && /Add lunch to your day\?/.test(text), 'the plan asks: "Add lunch to your day?"');
check(/We can suggest somewhere near your activity, or you can add your own place\./.test(text), 'with the approved supporting text');
check((await page.getByTestId('plan-lunch-choose').count()) === 1 && (await page.getByTestId('plan-lunch-decline').count()) === 1, 'and the two answers: Choose a place, No thanks');
await shot(page, '1-ask');

// ------------------------------------------------------------------ 2. no thanks: remembered
console.log('2. "No thanks" adds nothing and is remembered through save, reopen and edit');
await page.getByTestId('plan-lunch-decline').click(); await waitPlan(page);
text = await flat(page);
check(!/Lunch at /.test(text) && (await page.getByTestId('plan-lunch-ask').count()) === 0, 'no lunch, and the question is not asked again');
check((await page.getByTestId('plan-lunch-declined').count()) === 1 && (await page.getByTestId('plan-lunch-add').count()) === 1, 'a quiet "No lunch in this day. Add lunch" remains');
await page.getByTestId('plan-save').click(); await page.waitForTimeout(2000);
let days = await stored(page);
check(days.length === 1 && days[0].draft?.params?.lunch === 'off' && !days[0].draft?.params?.lunchPlace, 'saved with the answer: lunch off, no place', JSON.stringify({ lunch: days[0]?.draft?.params?.lunch, lunchPlace: days[0]?.draft?.params?.lunchPlace }));
const savedId = days[0].id;
await page.goto(`${BASE}/saved-plan?id=${savedId}`); await settle(page, 2000);
check(!/Lunch at /.test(await flat(page)), 'the saved plan has no lunch');
await page.getByTestId('plan-edit').click(); await waitPlan(page);
check((await page.getByTestId('plan-lunch-ask').count()) === 0 && (await page.getByTestId('plan-lunch-declined').count()) === 1, 'editing the saved day keeps the answer: not asked again, Add lunch still there');
await shot(page, '2-declined');

// ------------------------------------------------------------------ 3. choose a place: evidence, confirm
console.log('3. a place is chosen with its evidence, and enters the day only on confirm');
await page.getByTestId('plan-lunch-add').click(); await page.waitForTimeout(700);
const sheet = page.getByTestId('plan-edit-sheet');
let sheetText = (await sheet.innerText()).replace(/\s+/g, ' ');
check(/from OpenStreetMap/.test(sheetText) && /Listed first: places with the facilities your family needs on record, then the shortest walk/.test(sheetText), 'the picker says where the places come from and how they are ordered');
const options = page.getByTestId('plan-edit-lunch-option');
const n = await options.count();
check(n >= 3, 'it lists the real places found nearby', `${n}`);
const firstOption = (await options.first().innerText()).replace(/\s+/g, ' ');
check(/about \d+ min walk, estimated from distance|\d+ min walk, measured|km away in a straight line/.test(firstOption), 'each place says how far, and that the figure is estimated unless measured', firstOption.slice(0, 120));
check(/listed on OpenStreetMap|No family facilities listed: not the same as none/.test(firstOption), 'and which facilities are listed, or that none are listed (not that there are none)');
check(/Hours as mapped: |Opening hours not mapped: check before you go/.test(firstOption), 'and the mapped opening hours, or that none are mapped');
check(/Would start about \d\d:\d\d/.test(firstOption), 'and when lunch would start');
check(!/rating|★|available now|open now|Family Fit/i.test(sheetText), 'nothing invented: no rating, availability, "open now" or Family Fit for a restaurant');
check(await disabled(page.getByTestId('plan-lunch-confirm')), 'confirm is disabled until a place is selected');
await options.first().click(); await page.waitForTimeout(300);
check(!/Lunch at /.test(await flat(page)), 'selecting a place adds nothing yet');
check(!(await disabled(page.getByTestId('plan-lunch-confirm'))), 'now it can be confirmed');
await shot(page, '3-picker');
const chosenName = firstOption.split(/Cafe|Restaurant|Fast food/)[0].trim();
await page.getByTestId('plan-lunch-confirm').click(); await waitPlan(page);
text = await flat(page);
check(/Lunch at /.test(text) && /Leave for lunch/.test(text), 'confirmed: lunch is in the day', text.match(/\d\d:\d\d (?:to \d\d:\d\d )?Lunch at [^.]{0,40}/)?.[0] ?? '');
check(chosenName.length > 0 && text.includes(`Lunch at ${chosenName}`), 'at the place that was chosen', chosenName);
check((await page.getByTestId('plan-lunch-ask').count()) === 0 && (await page.getByTestId('plan-toggle-lunch').count()) === 1, 'the question is gone; lunch can be taken out');
await page.getByTestId('plan-save').click(); await page.waitForTimeout(2000);
days = await stored(page);
check(days.length === 1 && days[0].draft?.params?.lunch === 'on' && Boolean(days[0].draft?.params?.lunchPlace), 'saved as the parent’s choice, with the place', JSON.stringify({ lunch: days[0]?.draft?.params?.lunch, place: days[0]?.draft?.params?.lunchPlace }));
const chosenPlaceId = days[0]?.draft?.params?.lunchPlace ?? '';
await page.reload(); await waitPlan(page);
check((await flat(page)).includes(`Lunch at ${chosenName}`), 'reopening keeps the chosen lunch');
await shot(page, '3-chosen');

// ------------------------------------------------------------------ 4. their own place
console.log('4. their own place: name and time only, nothing invented, kept through save and reopen');
await page.getByTestId('plan-timeline-edit-lunch').first().click(); await page.waitForTimeout(600);
await page.getByTestId('plan-lunch-own').click(); await page.waitForTimeout(400);
check(await disabled(page.getByTestId('plan-lunch-own-confirm')), 'needs a name before it can be added');
await page.getByTestId('plan-lunch-own-name').fill('Sam’s Kitchen');
const timeInput = page.getByLabel('Time (optional)');
if (await timeInput.count()) await timeInput.first().fill('12:30');
await page.waitForTimeout(300);
sheetText = (await sheet.innerText()).replace(/\s+/g, ' ');
check(/We add nothing about it: no hours, facilities, journey or availability/.test(sheetText), 'says plainly that nothing is added about their place');
await page.getByTestId('plan-lunch-own-confirm').click(); await waitPlan(page);
text = await flat(page);
check(/Lunch at Sam’s Kitchen/.test(text), 'their place is in the day', text.match(/\d\d:\d\d (?:to \d\d:\d\d )?Lunch at Sam’s Kitchen/)?.[0] ?? '');
check(/You added this place/.test(text) && /We don’t know where it is, so the journey there and your time home aren’t adjusted\./.test(text), 'with no journey estimate and the time home left as it was, said plainly');
check(!new RegExp('walk from .*Sam’s Kitchen|Sam’s Kitchen.*min walk').test(text), 'no walk or drive is claimed to it');
if (await timeInput.count()) check(/12:30 (?:to 13:15 )?Lunch at Sam’s Kitchen/.test(text), 'at the time the parent gave', text.match(/\d\d:\d\d (?:to \d\d:\d\d )?Lunch at Sam/)?.[0] ?? '');
await page.getByTestId('plan-save').click(); await page.waitForTimeout(2000);
days = await stored(page);
check(days.length === 1 && days[0].draft?.params?.lunchOwn === 'Sam’s Kitchen' && days[0].draft?.params?.lunch === 'on' && !days[0].draft?.params?.lunchPlace, 'saved with their place, not a discovered one', JSON.stringify(days[0]?.draft?.params));
await page.reload(); await waitPlan(page);
check(/Lunch at Sam’s Kitchen/.test(await flat(page)), 'reopening keeps their place');
await page.goto(`${BASE}/saved-plan?id=${savedId}`); await settle(page, 2000);
check(/Lunch at Sam’s Kitchen/.test(await flat(page)) && /We don’t know where it is/.test(await flat(page)), 'the saved plan shows it the same way');
await shot(page, '4-own');

// ------------------------------------------------------------------ 5. a day saved before lunch was optional
console.log('5. a day saved before this change keeps the lunch it was saved with');
// Such a day carries the place (lunchPlace) with no decision (no lunch parameter): the shape every day saved before this change has.
const legacy = await page.evaluate((k) => {
  const day = JSON.parse(localStorage.getItem(k)).state.savedDays[0];
  const params = { ...day.draft.params };
  delete params.lunch; delete params.lunchOwn; delete params.lunchOwnAt; delete params.lunchPlace;
  return { venue: day.draft.venueId, params, id: day.id };
}, KEY);
await page.goto(`${BASE}/plan?${new URLSearchParams({ venue: legacy.venue, ...legacy.params, lunchPlace: chosenPlaceId, savedId: legacy.id }).toString()}`); await waitPlan(page);
text = await flat(page);
check(text.includes(`Lunch at ${chosenName}`), 'opened with only the place recorded, the day keeps its lunch', text.match(/Lunch at [^.]{0,30}/)?.[0] ?? '');
check((await page.getByTestId('plan-lunch-ask').count()) === 0, 'and is not asked again');
await page.getByTestId('plan-save').click(); await page.waitForTimeout(2000);
days = await stored(page);
check(days.length === 1 && days[0].draft?.params?.lunch === 'on' && days[0].draft?.params?.lunchPlace === chosenPlaceId, 'saving it again records the lunch as chosen, with the same place', JSON.stringify({ lunch: days[0]?.draft?.params?.lunch, place: days[0]?.draft?.params?.lunchPlace }));
// And a day saved with no lunch at all before this change (no lunch, no place) is simply asked, once.
await page.goto(`${BASE}/plan?${new URLSearchParams({ venue: legacy.venue, ...legacy.params, savedId: legacy.id }).toString()}`); await waitPlan(page);
check(!/Lunch at /.test(await flat(page)) && (await page.getByTestId('plan-lunch-ask').count()) === 1, 'a day saved with no lunch and no answer is asked, once');

check(google.length === 0, 'no request reached Google at any point', google.slice(0, 2).join(' '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
