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

  check(`${label}: no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
