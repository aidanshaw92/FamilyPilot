/**
 * The Meet halfway -> place -> Create a plan journey on a real clock, with the choices that must survive it. Reproduces three defects
 * seen on a real iPhone (see src/__tests__/iphone-journey-corrections.test.ts for what each was):
 *
 *   1. The day, the arrival and the other family chosen on Meet halfway are what the Create a plan sheet opens on, whether the
 *      parent taps "Plan this day" or goes through "See the place", even with a different day remembered from an earlier plan.
 *   2. No lunch is added on the parent's behalf at any hour: the plan asks once ("Add lunch to your day?"), the picker says when
 *      each place would start (and warns when that is late), and a lunch enters the day only when the parent confirms it.
 *   3. A family typed in on the phone is said to be on this phone only, and Families says nobody is connected.
 *
 * Serve first: FIXTURE_SCENARIO=realistic FIXTURE_CATALOGUE_ROWS=<rows.json> node scripts/serve-places-fixture.mjs 4175 dist
 * Usage: node scripts/verify-halfway-handoff.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4175';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PROFILE = { id: 'fam-h', parentName: 'Mina Test', members: [
  { id: 'p1', name: 'Mina Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
  { id: 'c1', name: 'Kid One', role: 'child', dateOfBirth: '2023-04-10', dobKnown: true, age: 3 },
  { id: 'c2', name: 'Kid Two', role: 'child', dateOfBirth: '2026-02-22', dobKnown: true, age: 0, ageMonths: 7 } ],
  homeLocation: 'Camden, London', homeLatitude: 51.5390, homeLongitude: -0.1420, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const emma = { id: 'guest-emma', label: 'Emma', area: 'Walthamstow', latitude: 51.5850, longitude: -0.0200, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] };

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function open(now, remembered) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  const options = { leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either', ...(remembered ? { date: remembered } : {}) };
  const planning = { state: { families: [emma], options, saved: [], savedDays: [], planningWith: null }, version: 1 };
  await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: JSON.stringify(planning), f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
  return { ctx, page, errors };
}
const flat = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
async function halfwayAtAfternoon(page) {
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const chip = page.getByRole('button', { name: 'Emma’s family', exact: true }).first();
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(2500); }
  // 13:05 on the Tuesday: the morning start has gone, so Meet halfway offers the earliest both could be there.
  const start = page.getByRole('button', { name: /^Start at/ });
  await start.first().waitFor({ timeout: 15000 });
  const label = (await start.first().innerText()).replace('Start at ', '').trim();
  await start.first().click(); await page.waitForTimeout(2500);
  await page.getByTestId('halfway-plan').first().waitFor({ timeout: 20000 });
  return label;
}
const planText = async (page) => { await page.getByTestId('plan-timeline').last().waitFor({ timeout: 40000 }); await page.waitForTimeout(1200); return flat(page); };

// ------------------------------------------------------------------ 1 + 2: Tuesday afternoon, with a Saturday remembered from before
console.log('Tuesday 13 Oct, 13:05, a Saturday remembered from an earlier plan');
{
  const { ctx, page, errors } = await open('2026-10-13T13:05:00', '2026-10-17');
  const arrive = await halfwayAtAfternoon(page);
  const header = await flat(page);
  check(/Tue 13 Oct · arrive \d\d:\d\d/.test(header), 'Meet halfway shows Tuesday 13 October and an arrival', arrive);
  const ruleOfThumb = (hhmm) => Number(hhmm.split(':')[0]) * 60 + Number(hhmm.split(':')[1]);

  // A: Plan this day
  await page.getByTestId('halfway-plan').first().click();
  const planA = await planText(page);
  check(/Tue 13 Oct/.test(planA) && !/Sat 17 Oct/.test(planA), 'Plan this day: the plan is for Tuesday 13 October', planA.slice(0, 70));
  check(new RegExp(`${arrive} Arrive at`).test(planA), 'Plan this day: it arrives at the time Meet halfway showed', arrive);
  check(!/Lunch at /.test(planA) && !/Lunch isn’t added/.test(planA), 'an afternoon arrival has no lunch added for it, and nothing is said about one being dropped', '');
  check(await page.getByTestId('plan-lunch-ask').count() === 1 && /Add lunch to your day\?/.test(planA), 'the plan asks once whether to add lunch');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a-plan-afternoon.png` });
  // The picker says when lunch would start and that it is late; it is advice, and the choice stays the parent's.
  await page.getByTestId('plan-lunch-choose').click(); await page.waitForTimeout(700);
  const sheetA = (await page.getByTestId('plan-edit-sheet').innerText()).replace(/\s+/g, ' ');
  check(/Would start about \d\d:\d\d, later than most families eat lunch\. Your call\./.test(sheetA), 'the picker says a lunch would start late, and leaves it to the parent', sheetA.match(/Would start about [^.]*\./)?.[0] ?? '');
  check(/OpenStreetMap/.test(sheetA) && /“not listed” doesn’t mean “not there”/.test(sheetA), 'and says where the places come from and what "not listed" means');
  await page.getByRole('button', { name: 'Cancel' }).last().click(); await page.waitForTimeout(500);
  check(!/Lunch at /.test(await planText(page)), 'closing the picker adds nothing');

  // B: See the place -> Create a plan
  await page.goBack(); await page.waitForTimeout(1500);
  if (!(await page.getByTestId('halfway-details').count())) { await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); }
  await page.waitForTimeout(1500);
  await page.getByTestId('halfway-details').first().click(); await page.waitForTimeout(1200);
  await page.getByTestId('halfway-see-place').click(); await page.waitForTimeout(2500);
  check(/\/venue\//.test(page.url()) && /date=2026-10-13/.test(decodeURIComponent(page.url())), 'See the place carries the day to the venue', page.url().replace(BASE, '').slice(0, 120));
  const context = await page.getByTestId('venue-outing-context').innerText().catch(() => '');
  check(/Tue 13 Oct · arrive \d\d:\d\d · with Emma’s family/.test(context), 'the venue says which day and family it is planning for', context);
  const ctaLabel = (await page.getByTestId('venue-create-plan').innerText()).trim();
  check(/Plan this day/.test(ctaLabel), 'from an active outing the venue’s action reads “Plan this day”', ctaLabel);
  check(await page.getByTestId('venue-outing-change').count() === 1, 'and the outing line has a Change action');
  // Change opens the sheet on this outing, this place kept: no going back to Meet halfway.
  await page.getByTestId('venue-outing-change').click(); await page.waitForTimeout(1200);
  check(await page.getByTestId('create-plan-sheet').isVisible(), 'Change opens the Create a plan sheet in place');
  await page.getByTestId('create-plan-sheet').getByText('Sat 17 Oct', { exact: true }).first().click(); await page.waitForTimeout(500);
  const changed = (await page.getByTestId('create-plan-sheet').innerText()).replace(/\s+/g, ' ');
  check(/START \d\d:\d\d/.test(changed) && /Emma’s family/.test(changed), 'the sheet kept the arrival and the family while the day is changed', changed.slice(0, 140));
  await page.getByTestId('create-plan-sheet').getByText('Today', { exact: true }).first().click(); await page.waitForTimeout(400);
  const sheet = (await page.getByTestId('create-plan-sheet').innerText()).replace(/\s+/g, ' ');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/b-sheet.png` });
  const chosen = await page.getByTestId('create-plan-sheet').locator('[role="button"][aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]').allInnerTexts().catch(() => []);
  check(new RegExp(`START ${arrive}`).test(sheet) || sheet.includes(arrive), 'the sheet opens on the arrival Meet halfway chose, not its own default', sheet.slice(0, 160));
  check(/Emma’s family/.test(sheet), 'Emma’s family is in the sheet');
  await page.getByTestId('create-plan-submit').click();
  const planB = await planText(page);
  check(/Tue 13 Oct/.test(planB) && !/Sat 17 Oct/.test(planB), 'See the place: the plan is for Tuesday 13 October, not the remembered Saturday', planB.slice(0, 70));
  check(/parties=mine(%2C|,)guest-emma/.test(page.url()), 'and it is planned with Emma’s family', page.url().replace(BASE, '').slice(0, 150));
  // Change from the plan itself: back to the sheet, same place, same answers.
  await page.getByTestId('plan-change-outing').click(); await page.waitForTimeout(2500);
  const reopened = (await page.getByTestId('create-plan-sheet').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/\/venue\//.test(page.url()) && /START /.test(reopened) && /Emma’s family/.test(reopened), 'Change on the plan reopens the sheet at the same place with the same answers', page.url().replace(BASE, '').slice(0, 80));
  await page.getByTestId('create-plan-submit').click();
  const planC = await planText(page);
  check(/Tue 13 Oct/.test(planC) && /parties=mine(%2C|,)guest-emma/.test(page.url()), 'and the rebuilt plan is still Tuesday with Emma’s family', planC.slice(0, 60));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('familypilot-planning-v1') ?? '{"state":{}}').state.options);
  check(stored?.date === '2026-10-17', 'the outing did not overwrite the remembered date', JSON.stringify(stored));
  check(errors.length === 0, 'no runtime errors', errors.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ 2b: a morning day gets a lunch only when the parent adds one
console.log('Monday morning: lunch is offered, chosen, kept, and taken out again');
{
  const { ctx, page } = await open('2026-10-12T08:00:00');
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const chip = page.getByRole('button', { name: 'Emma’s family', exact: true }).first();
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(2500); }
  await page.getByTestId('halfway-plan').first().waitFor({ timeout: 20000 });
  await page.getByTestId('halfway-plan').first().click();
  const plan = await planText(page);
  check(!/Lunch at /.test(plan) && (await page.getByTestId('plan-lunch-ask').count()) === 1, 'a 10:00 arrival has no lunch until one is chosen: the plan asks', '');
  await page.getByTestId('plan-lunch-choose').click(); await page.waitForTimeout(700);
  const sheet = (await page.getByTestId('plan-edit-sheet').innerText()).replace(/\s+/g, ' ');
  check(/Would start about \d\d:\d\d · 45 minutes at the table\./.test(sheet) && !/later than most families/.test(sheet), 'the picker says when lunch would start, with no warning in the morning');
  const confirmBtn = page.getByTestId('plan-lunch-confirm');
  check((await confirmBtn.getAttribute('aria-disabled')) === 'true' || (await confirmBtn.isDisabled()), 'nothing can be confirmed before a place is selected');
  await page.getByTestId('plan-edit-lunch-option').first().click(); await page.waitForTimeout(300);
  await page.getByTestId('plan-lunch-confirm').click();
  const withLunch = await planText(page);
  const lunch = withLunch.match(/(\d\d):(\d\d) (?:to \d\d:\d\d )?Lunch at/);
  check(Boolean(lunch) && Number(lunch[1]) * 60 + Number(lunch[2]) <= 14 * 60, 'the chosen lunch is in the day, and starts by 14:00', lunch ? `${lunch[1]}:${lunch[2]}` : 'none');
  check((await page.getByTestId('plan-lunch-ask').count()) === 0 && (await page.getByTestId('plan-toggle-lunch').count()) === 1, 'the question is gone and lunch can be taken out');
  await page.getByTestId('plan-toggle-lunch').click();
  const without = await planText(page);
  check(!/Lunch at /.test(without) && (await page.getByTestId('plan-lunch-declined').count()) === 1, 'taken out: no lunch, and a quiet way to add one back');
  await ctx.close();
}

// ------------------------------------------------------------------ 5: ordinary browsing keeps "Create a plan"
console.log('Ordinary venue browsing');
{
  const { ctx, page } = await open('2026-10-13T13:05:00');
  // A place opened on its own (no outing on the route), as a link or from a list would.
  await page.goto(`${BASE}/venue/fp-google-ChIJH7vcjOYddkgRQAmHYvUaK-U`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const label = (await page.getByTestId('venue-create-plan').innerText()).trim();
  check(/Create a plan/.test(label) && !/Plan this day/.test(label), 'a venue opened from Explore still says “Create a plan”', label);
  check(await page.getByTestId('venue-outing-change').count() === 0, 'and has no outing line');
  await ctx.close();
}

// ------------------------------------------------------------------ 6: Details says "not yet reviewed" once
console.log('Meet halfway Details');
{
  const { ctx, page } = await open('2026-10-12T08:00:00');
  await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const chip = page.getByRole('button', { name: 'Emma’s family', exact: true }).first();
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(2500); }
  await page.getByTestId('halfway-details').first().waitFor({ timeout: 20000 });
  const collapsed = (await page.getByTestId('halfway-sheet-collapsed').innerText()).replace(/\s+/g, ' ');
  check((collapsed.match(/Not yet reviewed/g) ?? []).length === 1 && await page.getByTestId('halfway-fit-both').count() === 1, 'the collapsed card says “Not yet reviewed” once, for both families', collapsed.slice(0, 120));
  await page.getByTestId('halfway-details').first().click(); await page.waitForTimeout(1200);
  const sheetText = (await page.getByTestId('halfway-sheet-expanded').innerText()).replace(/\s+/g, ' ');
  check((sheetText.match(/Not yet reviewed/gi) ?? []).length <= 1, 'Details says “Not yet reviewed” once', String((sheetText.match(/Not yet reviewed/gi) ?? []).length));
  check(/haven’t reviewed this place for families yet/.test(sheetText), 'and says plainly the place has not been reviewed for families, so neither family is graded');
  check(/Journeys/.test(sheetText) && /Before you go|Not yet:|Baby changing|to be checked/i.test(sheetText), 'uncertainty stays visible: the journeys and what is still to check');
  const unreviewedCard = (await page.getByTestId('halfway-fit-unreviewed-card').innerText()).replace(/\s+/g, ' ');
  check((unreviewedCard.match(/Emma/g) ?? []).length <= 1, 'the other family is named once (in the chip) and nothing is said about them as confirmed or checked', unreviewedCard.slice(0, 160));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/d-details.png` });
  await ctx.close();
}

// ------------------------------------------------------------------ 3: the family Meet halfway plans with is on Families, and what it is
console.log('Families and Meet halfway agree');
{
  const { ctx, page } = await open('2026-10-13T13:05:00');
  await page.goto(`${BASE}/families`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const t = await flat(page);
  check(/Emma’s family/.test(t), 'Families lists Emma’s family, the family Meet halfway plans with');
  check(/On this phone only · not connected/.test(t), 'and says she is on this phone only, not connected');
  check(await page.getByTestId('families-local-heading').count() === 1, 'under its own heading, apart from connected families');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/c-families.png` });
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
