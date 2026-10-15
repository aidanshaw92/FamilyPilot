/**
 * The editable timeline against PERSISTED storage, in a real browser (fixture server, synthetic household, no account):
 *
 *   build a day -> change arrival, how long and the restaurant -> save
 *   -> hard refresh and open it again          (the same day, the same restaurant)
 *   -> a brand-new browser context seeded only from the saved storage state, as if the app had been closed and reopened
 *   -> edit it again (a different restaurant, a different arrival) and save: the SAME day is updated, not duplicated
 *   -> an edit that is not saved leaves the stored day untouched
 *   -> saving what is already saved adds nothing
 *
 * Reads the stored state back from localStorage (where the app's AsyncStorage persists on the web) after every step.
 * Also counts requests to Google, which must be zero.
 *
 * Serve first:   FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4173 dist
 * Usage:         node scripts/verify-timeline-persistence.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const W = 390, H = 844;
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
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };

const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const google = [];
const track = (page) => page.on('request', (r) => { if (/googleapis|maps\.google/i.test(r.url())) google.push(r.url()); });
const settle = async (page, ms = 1500) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{"state":{}}').state.savedDays ?? [], KEY);
const timelineText = async (page) => (await page.getByTestId('plan-timeline').last().innerText()).replace(/\s+/g, ' ');
const waitPlan = async (page) => { await page.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 }); await settle(page, 800); };
const lunchNames = (text) => [...text.matchAll(/Lunch at ([^|]+?)(?= Or about| About| High chairs| No high chair| Outdoor seating| \d+ min at)/g)].map((m) => m[1].trim());

// ---------------------------------------------------------------- 1. build, edit, save
console.log('1. build a day, change arrival, how long and the restaurant, save');
const ctx1 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/London' });
const page = await ctx1.newPage(); track(page);
await page.clock.setFixedTime(new Date('2026-10-14T07:30:00'));
await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(PLANNING), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
await page.goto(`${BASE}/explore`); await settle(page, 2200);
await page.getByText('View family details').first().click(); await settle(page, 1800);
await page.getByTestId('venue-create-plan').click(); await page.waitForTimeout(900);
await page.getByTestId('create-plan-submit').click(); await waitPlan(page);
const built = await timelineText(page);
check(lunchNames(built).length === 0 && (await page.getByTestId('plan-lunch-ask').count()) === 1, 'the day is built without a lunch, and asks whether to add one');
// Lunch is chosen and confirmed by the parent; the discovery's first place is the one picked here.
await page.getByTestId('plan-lunch-choose').click(); await page.waitForTimeout(600);
await page.getByTestId('plan-edit-lunch-option').first().click(); await page.waitForTimeout(300);
await page.getByTestId('plan-lunch-confirm').click(); await waitPlan(page);
const first = await timelineText(page);
const firstLunch = lunchNames(first)[0];
check(Boolean(firstLunch), 'the chosen lunch is in the day', firstLunch);

await page.getByTestId('plan-timeline-edit-arrival').first().click(); await page.waitForTimeout(600);
await page.getByTestId('plan-edit-arrival-10:30').click(); await waitPlan(page);
check(/10:30 Arrive at/.test(await timelineText(page)), 'changing arrival re-plans: the day now arrives at 10:30');

await page.getByTestId('plan-timeline-edit-visit').first().click(); await page.waitForTimeout(600);
await page.getByTestId('plan-edit-visit-60').click(); await waitPlan(page);
const afterVisit = await timelineText(page);
check(/Leave for lunch/.test(afterVisit) && /11:30 Leave for lunch/.test(afterVisit), 'changing how long re-plans: leaving for lunch moved to 11:30', '');

await page.getByTestId('plan-timeline-edit-lunch').first().click(); await page.waitForTimeout(600);
const options = page.getByTestId('plan-edit-lunch-option');
const optionCount = await options.count();
check(optionCount >= 3, 'the restaurant sheet offers the real candidates found nearby', `${optionCount} candidates`);
const optionNames = await options.locator('div').filter({ hasText: /^[A-Z]/ }).allInnerTexts();
await options.nth(1).click(); await page.waitForTimeout(300);
await page.getByTestId('plan-lunch-confirm').click(); await waitPlan(page);
const secondLunch = lunchNames(await timelineText(page))[0];
check(secondLunch && secondLunch !== firstLunch, 'changing the restaurant re-plans with the other place', `${firstLunch} -> ${secondLunch}`);

await page.getByTestId('plan-save').click(); await page.waitForTimeout(2000);
let days = await stored(page);
check(days.length === 1, 'saved: exactly one day in persisted storage', `${days.length}`);
const id = days[0]?.id;
const createdAt = days[0]?.createdAt;
check(days[0]?.draft?.params?.start === '10:30' && days[0]?.draft?.params?.visit === '60' && Boolean(days[0]?.draft?.params?.lunchPlace), 'the answers the day was built from are stored with it', JSON.stringify(days[0]?.draft?.params));
check(!JSON.stringify(days[0]).match(/Child A|Child B|Parent One/), 'no child or parent name is in the stored plan');

// ---------------------------------------------------------------- 2. hard refresh
console.log('2. hard refresh, then open it again');
await page.goto(`${BASE}/trips`); await settle(page, 2000);
await page.reload(); await settle(page, 2200);
const rowCount = await page.getByTestId('plans-saved-days').getByRole('button').count();
check(rowCount === 1, 'after a hard refresh, Plans lists the one saved day', `${rowCount}`);
await page.getByTestId('plans-saved-days').getByRole('button').first().click(); await waitPlan(page);
const reopened = await timelineText(page);
check(lunchNames(reopened)[0] === secondLunch, 'it reopens with the edited restaurant', lunchNames(reopened)[0]);
check(/10:30 Arrive at/.test(reopened) && /11:30 Leave for lunch/.test(reopened), 'and the edited arrival and length');

// ---------------------------------------------------------------- 3. closed and reopened (new browser context)
console.log('3. a new browser context, seeded only from the saved storage state');
const state = await ctx1.storageState();
await ctx1.close();
const ctx2 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/London', storageState: state });
const page2 = await ctx2.newPage(); track(page2);
await page2.clock.setFixedTime(new Date('2026-10-14T07:30:00'));
await page2.goto(`${BASE}/trips`); await settle(page2, 2400);
check((await page2.getByTestId('plans-saved-days').getByRole('button').count()) === 1, 'the new session lists the one saved day');
await page2.getByTestId('plans-saved-days').getByRole('button').first().click(); await waitPlan(page2);
check(lunchNames(await timelineText(page2))[0] === secondLunch, 'and opens it with the same restaurant', secondLunch);

// ---------------------------------------------------------------- 4. an unsaved edit changes nothing stored
console.log('4. edit again, without saving');
await page2.getByTestId('plan-edit').click(); await waitPlan(page2);
check(new URL(page2.url()).searchParams.get('savedId') === id, 'Edit opens the Plan screen from the saved answers, carrying the saved id');
await page2.getByTestId('plan-timeline-edit-arrival').first().click(); await page2.waitForTimeout(600);
await page2.getByTestId('plan-edit-arrival-11:00').click(); await waitPlan(page2);
days = await stored(page2);
check(days.length === 1 && days[0].draft.params.start === '10:30', 'an edit that is not saved leaves the stored day as it was', days[0]?.draft?.params?.start);

// ---------------------------------------------------------------- 5. edit again and save: the same day is updated
console.log('5. change the restaurant and arrival again, save: the original is updated, not duplicated');
await page2.getByTestId('plan-timeline-edit-lunch').first().click(); await page2.waitForTimeout(600);
await page2.getByTestId('plan-edit-lunch-option').nth(2).click(); await page2.waitForTimeout(300);
await page2.getByTestId('plan-lunch-confirm').click(); await waitPlan(page2);
const thirdLunch = lunchNames(await timelineText(page2))[0];
check(thirdLunch && thirdLunch !== secondLunch, 'a third restaurant is chosen', `${secondLunch} -> ${thirdLunch}`);
await page2.getByTestId('plan-save').click(); await page2.waitForTimeout(2000);
days = await stored(page2);
check(days.length === 1, 'still exactly one saved day', `${days.length}`);
check(days[0].id === id && days[0].createdAt === createdAt, 'the same id and the same created time: the original was updated in place');
check(days[0].draft.params.start === '11:00' && days[0].draft.params.lunchPlace !== undefined, 'with the new answers', JSON.stringify(days[0].draft.params));

// ---------------------------------------------------------------- 6. refresh again, and saving the same thing adds nothing
console.log('6. refresh; saving what is already saved adds nothing');
await page2.goto(`${BASE}/trips`); await settle(page2, 2000); await page2.reload(); await settle(page2, 2200);
check((await page2.getByTestId('plans-saved-days').getByRole('button').count()) === 1, 'Plans still lists one day');
await page2.getByTestId('plans-saved-days').getByRole('button').first().click(); await waitPlan(page2);
const final = await timelineText(page2);
check(lunchNames(final)[0] === thirdLunch && /11:00 Arrive at/.test(final), 'it opens with the latest edits', `${lunchNames(final)[0]}, arrives 11:00`);
await page2.getByTestId('plan-edit').click(); await waitPlan(page2);
const saveText = (await page2.evaluate(() => document.body.innerText));
check(/Already in your plans/.test(saveText), 'reopened for editing with nothing changed, it says it is already saved');
days = await stored(page2);
check(days.length === 1, 'and nothing was added', `${days.length}`);

check(google.length === 0, 'no request to Google in any step', `${google.length}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
