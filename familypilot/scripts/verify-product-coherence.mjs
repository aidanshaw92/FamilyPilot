/**
 * The journey as one product, in a real browser at phone sizes: HOME (curated) -> EXPLORE (browse) -> VENUE DETAIL
 * (is it good for us, will it work today, what do I need to know) -> CREATE A PLAN (real time picker, the actual
 * household, Not sure / All day) -> the PLAN (routine clashes as advice with one-tap options; a start nobody could reach
 * as a one-tap fix) -> PROFILE (your family, connected families) -> MEET HALFWAY (two families, one answer).
 *
 * Fixture only (the realistic scenario): synthetic venues, no Google, no accounts. The clock is fixed so the result is
 * repeatable.
 *
 * Usage: node scripts/verify-product-coherence.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://127.0.0.1:4176';
const OUT = process.argv[3] ?? join(process.cwd(), '..', 'docs', 'product-coherence');
const NOW = new Date(process.env.JOURNEY_NOW ?? '2026-01-13T07:30:00');

const PROFILE = {
  id: 'family-coherence',
  parentName: 'Aidan',
  familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'p2', name: 'Ellie', role: 'parent', relationship: 'partner', dateOfBirth: '1991-02-02', age: 35 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 2, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2025-05-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy'] },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  homeLatitude: 51.643,
  homeLongitude: -0.36,
  budgetTier: 'moderate',
  maxDriveMinutes: 90,
  completionPercent: 90,
  vehicle: null,
  pushchair: 'Bugaboo Butterfly',
  travelCot: null,
  memberships: [],
  routines: [
    { id: 'nap-c2-a', label: 'Ozzie’s nap', kind: 'nap', time: '12:30', durationMinutes: 90, atHome: true, childId: 'c2' },
  ],
  mustHaveFacilities: [],
};

const GUEST = {
  id: 'guest-hannah',
  label: 'Hannah',
  area: 'E17',
  latitude: 51.59,
  longitude: -0.02,
  ages: [],
  maxDriveMinutes: 120,
  budgetTier: 'moderate',
  pushchair: false,
  required: [],
  routines: [],
};

const VIEWPORTS = process.env.ONLY_VIEWPORT
  ? [process.env.ONLY_VIEWPORT.split('x').map(Number)]
  : [[360, 800], [390, 844], [393, 852], [430, 932]];

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

const text = (page) => page.evaluate(() => document.body.innerText);

async function settle(page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function y(page, label) {
  return page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if ((n.textContent ?? '').trim().toLowerCase() === needle.toLowerCase()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.height > 0) return r.top + window.scrollY;
      }
    }
    return null;
  }, label);
}

const browser = await chromium.launch(launchOptions);

/** A fresh phone with this household and this one other family, for the scenarios that need a different guest. */
async function freshContext(width, height, guest, extraProfile = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ profile, guest: g }) => {
      localStorage.setItem(
        'familypilot-family-v1',
        JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }),
      );
      localStorage.setItem(
        'familypilot-planning-v1',
        JSON.stringify({
          state: { families: [g], options: { date: '2026-01-13', leaveAt: '10:00', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [] },
          version: 0,
        }),
      );
    },
    { profile: { ...PROFILE, ...extraProfile }, guest },
  );
  return { context, page };
}

/** No card may say "Best for both" while it also lists something to check. */
async function bestForBothIsHonest(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="halfway-option"]')];
    return cards.every((card) => !/Best for both/.test(card.innerText) || !/Needs checking|thing to check|things to check|\n\? /.test(card.innerText));
  });
}

/** The lines on a card, in the order a parent reads them: fairness, fit, routines, facilities, then what to check. */
async function cardOrder(card) {
  const text = await card.innerText();
  const at = (pattern) => text.search(pattern);
  return [at(/Almost equal journeys|Journeys are within|Journeys differ by/), at(/Family Fit|Suits the ages/), at(/Needs checking before you go|\n\? /)];
}

const BARNET = 'Barnet Common Fixture Farm';
const FINCHLEY = 'Finchley Fixture Play Barn';
const HENDON = 'Hendon Fixture Yard';
const CAUTION_VENUE = 'fp-google-FIXTUREnotArealPlaceId0008';

for (const [width, height] of VIEWPORTS) {
  const label = `${width}x${height}`;
  const dir = join(OUT, label);
  mkdirSync(dir, { recursive: true });
  console.log(`\n=== ${label} ===`);

  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    ({ profile, guest }) => {
      localStorage.setItem(
        'familypilot-family-v1',
        JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }),
      );
      localStorage.setItem(
        'familypilot-planning-v1',
        JSON.stringify({
          state: {
            families: [guest],
            options: { date: '2026-01-13', leaveAt: '10:00', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' },
            saved: [],
            savedDays: [],
          },
          version: 0,
        }),
      );
    },
    { profile: PROFILE, guest: GUEST },
  );

  // ---- HOME: the curated answer ------------------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2600);
  await page.screenshot({ path: join(dir, '01-home.jpg'), type: 'jpeg', quality: 82 });
  const home = await text(page);
  check(`${label}: Home says who it is picking for`, /Picked for Sloane and Ozzie today/.test(home), (home.match(/Picked for[^\n]*/) ?? ['no line'])[0]);
  const heading = /Best for your family today/.test(home);
  // The heading gives way on a screen too short for the whole card (home-vertical-layout), as it always has.
  check(`${label}: Home is headed "Best for your family today" (or compacts it on a short screen)`, heading || height < 740, heading ? undefined : 'compact header');
  check(`${label}: Home offers situations, not a second category directory`, !/\n(Park|Museum|Farm|Soft play|Animals)\n/.test(home) && /Rainy day/.test(home), 'rail: ' + (home.match(/For you[\s\S]{0,140}/) ?? [''])[0].replace(/\s+/g, ' '));
  check(`${label}: Home does not scroll sideways`, (await overflow(page)) <= 1);

  // ---- EXPLORE: the broader browse ---------------------------------------------------------------
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2200);
  await page.screenshot({ path: join(dir, '02-explore.jpg'), type: 'jpeg', quality: 82 });
  const explore = await text(page);
  check(`${label}: Explore is for browsing, searching and filtering`, /Browse, search and filter family days out across London/.test(explore));
  check(`${label}: Explore carries the categories Home does not`, /Parks/.test(explore) && /Museums/.test(explore));

  // ---- VENUE DETAIL ------------------------------------------------------------------------------
  const card = page.locator('[role="button"][aria-label$="view details"]').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click();
  await settle(page, 2200);
  await page.screenshot({ path: join(dir, '03-venue-detail.jpg'), type: 'jpeg', quality: 82 });
  const venueUrl = page.url();
  const fitY = await y(page, 'FAMILY FIT');
  const todayY = await y(page, 'TODAY');
  const ctaY = await page.getByTestId('venue-create-plan').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const knowY = await y(page, 'What to know');
  const moreY = await y(page, 'More about this place');
  const howY = await y(page, 'How we know this');
  check(`${label}: Venue Detail answers in order: Family Fit, today, then the action, then what to know`, fitY !== null && todayY !== null && fitY < todayY && todayY < ctaY && ctaY < knowY, `fit ${fitY} today ${todayY} cta ${Math.round(ctaY)} know ${knowY}`);
  check(`${label}: the detail and the evidence come after, "How we know this" last`, moreY !== null && howY !== null && knowY < moreY && moreY < howY, `more ${moreY} how ${howY}`);
  check(`${label}: Create a plan is within a screen and a half of the top`, ctaY < height * 1.5, `${Math.round(ctaY)}px of ${height}`);
  const detail = await text(page);
  check(`${label}: Family Fit speaks about the children`, /(for|Sloane|Ozzie|your family)/i.test(detail) && /FAMILY FIT/.test(detail), (detail.match(/FAMILY FIT\n([^\n]+)/) ?? ['', ''])[1]);
  await page.getByTestId('venue-more-toggle').click();
  await page.waitForTimeout(300);
  check(`${label}: "More about this place" opens on a tap`, await page.getByTestId('venue-more').isVisible());
  check(`${label}: Venue Detail does not scroll sideways`, (await overflow(page)) <= 1);

  // ---- CREATE A PLAN: the small sheet ------------------------------------------------------------
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId('venue-create-plan').scrollIntoViewIfNeeded();
  await page.getByTestId('venue-create-plan').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(dir, '04-create-plan-sheet.jpg'), type: 'jpeg', quality: 82 });
  const sheet = page.getByTestId('create-plan-sheet');
  const sheetText = (await sheet.innerText()).toString();
  check(`${label}: the sheet names the household, everyone selected`, /SHAW FAMILY/.test(sheetText) && ['Aidan', 'Ellie', 'Sloane', 'Ozzie'].every((n) => sheetText.includes(n)));
  check(`${label}: Start is a real time picker, not presets`, (await sheet.locator('input[type="time"]').count()) === 1 && !/\b09:30\b/.test(sheetText.replace(/10:00/g, '')) , 'time inputs: ' + (await sheet.locator('input[type="time"]').count()));
  check(`${label}: How long offers Not sure, All day and Custom`, ['Not sure', 'All day', 'Custom'].every((t) => sheetText.includes(t)));
  await sheet.getByText('Ozzie', { exact: true }).first().click();
  await page.waitForTimeout(300);
  check(`${label}: taking Ozzie out says the plan is without him`, /Planning without Ozzie\./.test((await sheet.innerText()).toString()));
  await sheet.getByText('Ozzie', { exact: true }).first().click();
  await page.waitForTimeout(300);
  check(`${label}: putting Ozzie back returns to everyone`, !/Planning without/.test((await sheet.innerText()).toString()));

  // A start before now is too soon: the answer is one tap.
  await sheet.locator('input[type="time"]').fill('07:35');
  await page.getByTestId('create-plan-submit').click();
  await settle(page, 2500);
  await page.screenshot({ path: join(dir, '05-start-too-soon.jpg'), type: 'jpeg', quality: 82 });
  const tooSoon = await text(page);
  check(`${label}: a start nobody could reach is a fix, not an error`, /That start is a little too soon/.test(tooSoon) && (await page.getByTestId('plan-failure-action').count()) === 1, (tooSoon.match(/Start at \d\d:\d\d/) ?? ['no action'])[0]);
  await page.getByTestId('plan-failure-action').click();
  await settle(page, 3500);
  check(`${label}: tapping it builds the plan`, await page.getByTestId('plan-save').isVisible().catch(() => false), page.url().replace(BASE, ''));

  // ---- THE PLAN: routines are advice ------------------------------------------------------------
  await page.screenshot({ path: join(dir, '06-plan.jpg'), type: 'jpeg', quality: 82 });
  const plan = await text(page);
  check(`${label}: the plan says how long it allowed and why`, /You weren’t sure how long|Time there/.test(plan));
  const routinesBlock = page.getByTestId('plan-routines');
  const hasRoutines = await routinesBlock.isVisible().catch(() => false);
  check(`${label}: the plan reasons about Ozzie's nap`, hasRoutines, hasRoutines ? (await routinesBlock.innerText()).toString().replace(/\s+/g, ' ').slice(0, 160) : 'no routines block');
  check(`${label}: it never calls a nap a conflict or an error`, !/conflict|error|can’t be done|cannot/i.test(await routinesBlock.innerText().catch(() => '')));
  check(`${label}: the plan does not scroll sideways`, (await overflow(page)) <= 1);

  // Try the first one-tap option if there is one.
  const optionChips = routinesBlock.locator('[role="button"]');
  if (hasRoutines && (await optionChips.count()) > 0) {
    const before = page.url();
    const labelText = (await optionChips.first().innerText()).toString();
    await optionChips.first().click();
    await settle(page, 3500);
    check(`${label}: a one-tap option rebuilds the plan (${labelText})`, page.url() !== before && (await page.getByTestId('plan-save').isVisible().catch(() => false)), page.url().replace(BASE, ''));
  }

  // Go to the plan screen through the lunch toggle presence, then back.
  // ---- PROFILE: your family, connected families --------------------------------------------------
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2000);
  await page.screenshot({ path: join(dir, '07-profile.jpg'), type: 'jpeg', quality: 82 });
  const profile = await text(page);
  check(`${label}: Profile lists the household, adults then children`, /Your family/.test(profile) && profile.indexOf('Aidan') < profile.indexOf('Sloane') && /Partner/.test(profile) && /Ozzie/.test(profile));
  check(`${label}: Profile has Connected families as its own section`, /Connected families/.test(profile) && /Add a family by postcode/.test(profile));
  check(`${label}: a family added by postcode appears there, honestly`, /Hannah/.test(profile) && /starting point only/.test(profile));
  check(`${label}: Profile does not scroll sideways`, (await overflow(page)) <= 1);

  // ---- MEET HALFWAY -----------------------------------------------------------------------------
  await page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  await page.screenshot({ path: join(dir, '08-meet-halfway.jpg'), type: 'jpeg', quality: 82 });
  const halfway = await text(page);
  check(`${label}: Meet halfway shows places for both families`, (await page.getByTestId('halfway-option').count()) > 0 || (await page.getByTestId('halfway-empty').isVisible().catch(() => false)), `${await page.getByTestId('halfway-option').count()} options`);
  const options = await page.getByTestId('halfway-option').count();
  if (options > 0) {
    check(`${label}: each option gives both journeys`, /Your family/.test(halfway) && /Hannah/.test(halfway) && (halfway.match(/about \d+ min/g) ?? []).length >= 2);
    check(`${label}: it does not pretend to know a family it has only a postcode for`, /only know where Hannah’s family sets off from/.test(halfway));
    await page.getByTestId('halfway-plan').first().click();
    await settle(page, 4000);
    await page.screenshot({ path: join(dir, '09-halfway-plan.jpg'), type: 'jpeg', quality: 82 });
    const joint = page.url();
    check(`${label}: Plan this day builds one plan for both families`, /parties=mine(%2C|,)guest-hannah/.test(joint) && (await page.getByTestId('plan-save').isVisible().catch(() => false)), joint.replace(BASE, '').slice(0, 120));
    await page.getByTestId('plan-section-who').click();
    await page.waitForTimeout(500);
    const who = await text(page);
    check(`${label}: Who's coming lists both families, each with their own leaving time`, /Shaw family/i.test(who) && /Hannah/i.test(who) && (who.match(/Leaves home/g) ?? []).length === 2, who.replace(/\s+/g, ' ').slice(0, 260));
  }

  // ---- MEET HALFWAY: candidates come from the catalogue between the homes, not from Home ----------------------
  // Home (personalised to one family) never lists the Barnet farm; the stored catalogue does, and it is between the homes.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2200);
  check(`${label}: Home does not list the catalogue-only farm (so the next check cannot pass by accident)`, !(await text(page)).includes(BARNET));
  await page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  const between = await text(page);
  check(`${label}: Meet halfway says it looked between the two homes, not only at Home`, /We looked at \d+ places? between your two homes/.test(between));
  const topHeading = (between.match(/(Best for both|Best compromise|Promising option[^\n]*)\n[^\n]*/) ?? [''])[0].replace(/\n/g, ' | ');
  check(`${label}: a place only the stored catalogue holds is offered first, under a heading that makes only the claim it can support`, between.includes(BARNET) && topHeading.includes(BARNET) && /^(Best compromise|Promising option · \d things? to check)/.test(topHeading), topHeading);
  check(`${label}: journeys are described as fairness, never as who travels less`, /Almost equal journeys|Journeys are within \d+ minutes of each other|Journeys differ by \d+ minutes/.test(between) && !/shorter journey|longer journey|has further to go/i.test(between));
  check(`${label}: estimated wording is kept ("about N min")`, (between.match(/about \d+ min/g) ?? []).length >= 2);
  check(`${label}: "Best for both" never appears over something still to check`, await bestForBothIsHonest(page));
  check(`${label}: the card reads fairness, then fit, then what needs checking`, await (async () => { const [f, fit, chk] = await cardOrder(page.getByTestId('halfway-option').first()); return f >= 0 && (fit < 0 || f < fit) && (chk < 0 || (fit < 0 ? f : fit) < chk); })());
  check(`${label}: it is not the Home fallback`, (await page.getByTestId('halfway-fallback').count()) === 0);
  await page.screenshot({ path: join(dir, '10-halfway-between.jpg'), type: 'jpeg', quality: 82 });

  // When the catalogue cannot be reached it falls back to Home's places and SAYS so, rather than looking complete.
  await page.route('**/api/places/search?*intent=between*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'down', code: 'CATALOGUE_UNAVAILABLE' }) }));
  await page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
  await settle(page, 4500);
  const fallback = await text(page);
  check(`${label}: an unreachable catalogue falls back to Home's places and says there may be better ones in between`, (await page.getByTestId('halfway-fallback').count()) > 0 && /There may be better ones in between/.test(fallback) && !fallback.includes(BARNET));
  await page.unroute('**/api/places/search?*intent=between*');

  check(`${label}: no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();

  // ---- must-have states, with a family that needs baby changing ----------------------------------------------
  const needy = await freshContext(width, height, { ...GUEST, ages: [1], required: ['babyChanging'] });
  await needy.page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
  await settle(needy.page, 3200);
  const needText = await text(needy.page);
  check(`${label}: an unconfirmed must-have keeps the place on the list, with a prominent "needs checking" block`, needText.includes(FINCHLEY) && (await needy.page.getByTestId('halfway-needs-checking').count()) > 0 && /Needs checking before you go/i.test(needText));
  check(`${label}: it says exactly what to check, for the family that needs it`, /Baby changing isn’t confirmed at Finchley Fixture Play Barn, and Hannah’s family needs it/.test(needText));
  check(`${label}: a place confirmed to LACK the must-have is ruled out`, !needText.includes(HENDON));
  check(`${label}: a place with an unconfirmed must-have is never labelled "Best for both"`, await bestForBothIsHonest(needy.page) && !/Best for both/.test(await needy.page.getByTestId('halfway-option').filter({ hasText: FINCHLEY }).first().innerText()));
  check(`${label}: and an unconfirmed one is never worded as missing`, !/No baby changing|does not have baby changing/i.test(needText));
  await needy.page.getByTestId('halfway-needs-checking').first().scrollIntoViewIfNeeded();
  await needy.page.waitForTimeout(400);
  await needy.page.screenshot({ path: join(dir, '11-halfway-needs-checking.jpg'), type: 'jpeg', quality: 82 });
  // Planning it still works: an unknown must-have never stops a plan.
  const finchleyCard = needy.page.getByTestId('halfway-option').filter({ hasText: FINCHLEY }).first();
  await finchleyCard.getByTestId('halfway-plan').click();
  await settle(needy.page, 4200);
  const jointPlan = await text(needy.page);
  check(`${label}: Plan this day still builds the plan, with what needs checking said on it`, (await needy.page.getByTestId('plan-save').isVisible().catch(() => false)) && /Needs checking before you go/i.test(jointPlan) && /Baby changing isn’t confirmed at Finchley Fixture Play Barn/.test(jointPlan), jointPlan.replace(/\s+/g, ' ').slice(0, 200));
  await needy.context.close();

  // "Best for both" is still available when it is supported: a household of one child, a family that shared their child's age.
  const clear = await freshContext(width, height, { ...GUEST, ages: [2] }, { members: PROFILE.members.filter((m) => m.id !== 'c2'), routines: [] });
  await clear.page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
  await settle(clear.page, 3200);
  const clearText = await text(clear.page);
  check(`${label}: a confirmed, even, well-known option is still called "Best for both"`, /Best for both/.test(clearText) && await bestForBothIsHonest(clear.page), (clearText.match(/Best for both[^\n]*\n[^\n]*/) ?? ['no heading'])[0]);
  await clear.context.close();

  // A must-have confirmed MISSING is a hard conflict at plan time, and says so.
  const miss = await freshContext(width, height, GUEST, { mustHaveFacilities: ['baby_changing'] });
  await miss.page.goto(`${BASE}/plan?venue=${CAUTION_VENUE}&date=2026-01-17&leaveAt=09:30&visit=90&parties=mine`, { waitUntil: 'domcontentloaded' });
  await settle(miss.page, 5200);
  const missText = await text(miss.page);
  check(`${label}: a must-have confirmed missing is a hard conflict, in plain words`, /does not have baby changing, and your family needs it/.test(missText) && !/Save this plan/.test(missText), missText.replace(/\s+/g, ' ').slice(0, 220));
  await miss.context.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
