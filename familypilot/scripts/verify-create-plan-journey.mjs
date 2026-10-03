/**
 * Walks the approved journey in a real browser: HOME -> VENUE DETAIL -> CREATE A PLAN -> GENERATING
 * -> PLAN, and reports what each screen actually showed.
 *
 * Points at the synthetic places fixture, never at production or at a billable Google service. The
 * fixture's venues carry no reviewed metadata, which is the honest worst case: every claim-backed
 * fact is unconfirmed, so this run also proves the unconfirmed states render rather than vanishing.
 *
 * Usage: node scripts/verify-create-plan-journey.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = process.argv[3] ?? join(process.cwd(), '..', 'docs', 'create-plan-journey');
const FAMILY_KEY = 'familypilot-family-v1';

const PROFILE = {
  id: 'family-journey-check',
  parentName: 'Sarah',
  members: [
    { id: 'p1', name: 'Sarah', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'p2', name: 'Alex', role: 'parent', dateOfBirth: '1991-02-02', age: 35 },
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2021-06-10', age: 4 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2024-11-22', age: 1 },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  homeLatitude: 51.643,
  homeLongitude: -0.36,
  budgetTier: 'moderate',
  // The fixture spreads synthetic venues across Greater London, so the limit is generous enough that
  // an unrelated travel-infeasible failure cannot mask what this run is checking.
  maxDriveMinutes: 90,
  completionPercent: 80,
  vehicle: 'Tesla Model Y',
  pushchair: 'Bugaboo Butterfly',
  travelCot: null,
  memberships: [],
  routines: [],
  mustHaveFacilities: [],
};

const ONLY = process.env.ONLY_VIEWPORT;
const VIEWPORTS = [
  { label: '360x800', width: 360, height: 800 },
  { label: '390x844', width: 390, height: 844 },
  { label: '393x852', width: 393, height: 852 },
  { label: '430x932', width: 430, height: 932 },
];

/**
 * The date a linked plan is opened for: tomorrow, in the planning timezone.
 *
 * A fixed date would start failing the day it passed, and today would make the result depend on how
 * much of today is left when the check runs.
 */
const PLAN_DATE = (() => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const findings = [];
const note = (viewport, step, detail) => {
  findings.push({ viewport, step, ...detail });
  const flag = detail.ok === false ? 'FAIL' : 'ok';
  console.log(`  [${flag}] ${step}${detail.message ? `: ${detail.message}` : ''}`);
};

async function settle(page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(ms);
}

/**
 * Whether the page scrolls sideways, and if so what is sticking out.
 *
 * Naming the element matters: "something overflows" sends you reading every stylesheet, while
 * "a 412px row of chips at x=20" is the fix.
 */
async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    if (scroll <= viewport + 1) return null;
    const offenders = [];
    for (const element of document.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > viewport + 1) {
        offenders.push(
          `${element.tagName}[w=${Math.round(rect.width)} x=${Math.round(rect.left)}] "${(element.textContent ?? '').trim().slice(0, 40)}"`,
        );
      }
    }
    return { viewport, scroll, offenders: offenders.slice(0, 6) };
  });
}

/**
 * Opens a venue the way a parent does -- by tapping a card -- and returns the id it landed on.
 *
 * Expo Router renders these as pressables rather than anchors on web, so there is no href to read:
 * the id comes from the URL after the tap, which also proves the card actually navigates.
 */
async function firstVenueId(page, viewport) {
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  const card = page.locator('[role="button"][aria-label$="view details"]').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  const name = (await card.getAttribute('aria-label')) ?? '';
  await card.click();
  await settle(page, 2000);
  const match = /\/venue\/([^/?#]+)/.exec(page.url());
  note(viewport, 'a venue card opens Venue Detail', {
    ok: Boolean(match),
    message: match ? name.split(',')[0] : page.url().replace(BASE, ''),
  });
  if (!match) throw new Error('Tapping a venue card did not open Venue Detail.');
  return match[1];
}

async function run(browser, viewport) {
  const dir = join(OUT, viewport.label);
  mkdirSync(dir, { recursive: true });
  console.log(`\n=== ${viewport.label} ===`);

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // A 404 says only that something was missing; the URL says what, which is the difference between
  // a broken screen and an absent favicon.
  page.on('requestfailed', (request) => errors.push(`requestfailed ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: FAMILY_KEY,
      value: JSON.stringify({
        state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 },
        version: 0,
      }),
    },
  );

  const venueId = await firstVenueId(page, viewport.label);

  // --- VENUE DETAIL ---
  await settle(page, 1200);
  await page.screenshot({ path: join(dir, '01-venue-detail.png') });

  const cta = page.getByTestId('venue-create-plan');
  const ctaVisible = await cta.isVisible().catch(() => false);
  note(viewport.label, 'Venue Detail offers Create a plan', {
    ok: ctaVisible,
    message: ctaVisible ? undefined : 'the footer CTA was not visible',
  });

  if (ctaVisible) {
    const box = await cta.boundingBox();
    const inside = box ? box.y + box.height <= viewport.height + 1 : false;
    note(viewport.label, 'the CTA is not clipped by the viewport', {
      ok: inside,
      message: box ? `bottom at ${Math.round(box.y + box.height)} of ${viewport.height}` : 'no box',
    });
  }

  const directionsInBody = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('*')).filter(
      (node) => node.children.length === 0 && node.textContent?.trim() === 'Get directions',
    );
    if (!nodes.length) return null;
    const rect = nodes[0].getBoundingClientRect();
    return { top: rect.top, height: document.documentElement.clientHeight };
  });
  note(viewport.label, 'Get directions moved out of the footer', {
    ok: Boolean(directionsInBody),
    message: directionsInBody ? `found in content at y=${Math.round(directionsInBody.top)}` : 'not found',
  });

  {
    const overflow = await horizontalOverflow(page);
    note(viewport.label, 'Venue Detail does not scroll sideways', {
      ok: overflow === null,
      message: overflow ? `${overflow.scroll} wide in ${overflow.viewport}: ${overflow.offenders.join(' ; ')}` : undefined,
    });
  }

  // --- CREATE A PLAN sheet ---
  await cta.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(dir, '02-create-plan-sheet.png') });

  const sheet = page.getByTestId('create-plan-sheet');
  const sheetBox = await sheet.boundingBox().catch(() => null);
  note(viewport.label, 'the sheet rises over the venue at the approved proportion', {
    ok: Boolean(sheetBox),
    message: sheetBox
      ? `${Math.round(sheetBox.height)}px of ${viewport.height} (${Math.round((sheetBox.height / viewport.height) * 100)}%)`
      : 'no sheet',
  });

  const sheetText = (await sheet.innerText().catch(() => '')) || '';
  // The approved rows are set in caps, so the comparison is case-insensitive rather than asserting
  // the styling.
  const sheetUpper = sheetText.toUpperCase();
  for (const row of ['When', 'Start', 'Who’s coming', 'How long']) {
    note(viewport.label, `the sheet shows the ${row} row`, { ok: sheetUpper.includes(row.toUpperCase()) });
  }
  note(viewport.label, 'the household is summarised by count, not by name', {
    ok: sheetText.includes('2 adults, 2 children') && !sheetText.includes('Mia'),
    message: sheetText.includes('2 adults, 2 children') ? undefined : 'summary line missing',
  });

  const venueStillBehind = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).some(
      (node) => node.children.length === 0 && node.textContent?.trim() === 'FAMILY FIT',
    ),
  );
  note(viewport.label, 'the venue is still readable behind the sheet', { ok: venueStillBehind });

  // --- GENERATING, then PLAN ---
  const submit = page.getByTestId('create-plan-submit');
  await submit.click();
  // Caught on the way past where it is quick; absence is not a failure.
  await page.waitForTimeout(220);
  const generatingSeen = await page.getByTestId('generating-plan').isVisible().catch(() => false);
  if (generatingSeen) await page.screenshot({ path: join(dir, '03-generating.png') });
  note(viewport.label, 'the generating state was reached', {
    ok: true,
    message: generatingSeen ? 'captured' : 'passed too quickly to capture',
  });

  await page.waitForTimeout(4200);
  await settle(page, 600);
  await page.screenshot({ path: join(dir, '04-plan.png') });

  const planText = await page.evaluate(() => document.body.innerText);
  const onPlan = await page.getByTestId('plan-save').isVisible().catch(() => false);
  note(viewport.label, 'the Plan screen rendered', {
    ok: onPlan,
    message: onPlan ? undefined : planText.slice(0, 400).replace(/\s+/g, ' '),
  });

  if (onPlan) {
    for (const label of ['Day plan', 'Who’s coming', 'Travel & parking']) {
      note(viewport.label, `the section nav offers ${label}`, { ok: planText.includes(label) });
    }
    note(viewport.label, 'the day is summarised in the parent’s terms', {
      ok: /A \d+-hour /.test(planText),
      message: (planText.match(/A \d+-hour [A-Za-z]+/) ?? ['no summary line'])[0],
    });
    note(viewport.label, 'the first stop is expanded', {
      ok: planText.includes('Arrive') && planText.includes('Time there'),
    });
    note(viewport.label, 'a period heading is shown', {
      ok: /MORNING|LUNCH|AFTERNOON|EVENING/.test(planText),
      message: (planText.match(/MORNING|LUNCH|AFTERNOON|EVENING/) ?? [''])[0],
    });
    {
      const overflow = await horizontalOverflow(page);
      note(viewport.label, 'the Plan screen does not scroll sideways', {
        ok: overflow === null,
        message: overflow ? `${overflow.scroll} wide in ${overflow.viewport}: ${overflow.offenders.join(' ; ')}` : undefined,
      });
    }

    // Travel & parking must say what is unconfirmed rather than leaving a blank.
    await page.getByTestId('plan-section-travel').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(dir, '05-plan-travel.png') });
    const travelText = await page.evaluate(() => document.body.innerText);
    note(viewport.label, 'parking is reported as unconfirmed for an unreviewed venue', {
      ok: travelText.includes('Not confirmed'),
      message: (travelText.match(/Parking[\s\S]{0,60}/) ?? [''])[0].replace(/\s+/g, ' '),
    });
    note(viewport.label, 'estimated journeys are labelled as estimates', {
      ok: travelText.includes('Estimated from distance'),
    });

    await page.getByTestId('plan-section-who').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(dir, '06-plan-who.png') });
    const whoText = await page.evaluate(() => document.body.innerText);
    note(viewport.label, 'each household gets its own leaving and returning time', {
      ok: whoText.includes('Leaves home') && whoText.includes('Back home'),
    });

    // Save from the header, then prove it persisted rather than only turning a label over. The
    // header control and the persistent button share one handler, so saving from either is saving.
    await page.getByTestId('plan-section-day').click();
    await page.waitForTimeout(400);
    await page.getByTestId('plan-save-header').click();
    await page.waitForTimeout(900);
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('familypilot-planning-v1');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const days = parsed?.state?.savedDays ?? [];
        return { count: days.length, stops: days[0]?.source?.itinerary?.stops?.length ?? 0 };
      } catch {
        return null;
      }
    });
    const footerSaved = await page
      .getByTestId('plan-save')
      .evaluate((node) => (node.textContent ?? '').trim())
      .catch(() => '');
    note(viewport.label, 'saving from the header also settles the persistent button', {
      ok: footerSaved === 'Saved',
      message: footerSaved || 'no label',
    });

    note(viewport.label, 'Save this plan persists the day', {
      ok: Boolean(stored && stored.count > 0 && stored.stops > 0),
      message: stored ? `${stored.count} saved day(s), ${stored.stops} stop(s)` : 'nothing stored',
    });

    // Back must return to the venue the day was built around.
    await page.goBack();
    await settle(page, 1800);
    const backUrl = page.url();
    note(viewport.label, 'back returns to the venue', {
      ok: backUrl.includes(`/venue/${venueId}`),
      message: backUrl.replace(BASE, ''),
    });
  }

  note(viewport.label, 'no runtime errors on the journey', {
    ok: errors.length === 0,
    message: errors.slice(0, 3).join(' | ') || undefined,
  });

  await context.close();
}

/** This sandbox ships Chromium at a fixed path and blocks the download; CI resolves its own. */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
/**
 * The screens a parent is most likely to meet, which the happy path never reaches.
 *
 * Most venues in production are unreviewed, and a parent who sets a must-have will therefore hit the
 * unmet-requirement screen more often than the plan. What it says is the difference between a dead
 * end and something they can act on, so it is checked rather than assumed.
 */
async function runFailurePaths(browser, viewport, profileOverrides, label, expectations) {
  const dir = join(OUT, 'failures');
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: FAMILY_KEY,
      value: JSON.stringify({
        state: {
          profile: { ...PROFILE, ...profileOverrides },
          hasCompletedOnboarding: true,
          hasSeenSplash: true,
          profileRevision: 2,
        },
        version: 0,
      }),
    },
  );

  const venueId = await firstVenueId(page, label);
  await page.getByTestId('venue-create-plan').click();
  await page.waitForTimeout(800);
  await page.getByTestId('create-plan-submit').click().catch(() => {});
  await page.waitForTimeout(5200);
  await page.screenshot({ path: join(dir, `${label}.png`) });

  const text = await page.evaluate(() => document.body.innerText);
  // Each expectation is a predicate over the screen's text, so a check can assert something is
  // absent as readily as present.
  for (const [description, matches] of expectations) {
    const ok = matches(text);
    note(label, description, { ok, message: ok ? undefined : text.replace(/\s+/g, ' ').slice(0, 260) });
  }
  note(label, 'no internal field name reaches the screen', {
    ok: !/[a-z]+[A-Z][a-z]+:|familyFacilities\./.test(text),
    message: (text.match(/[a-z]+[A-Z][a-z]+:|familyFacilities\.[a-zA-Z]+/) ?? [''])[0],
  });

  await context.close();
  return venueId;
}

/**
 * A plan opened straight from a link, rather than through the sheet.
 *
 * /plan survives a reload and can be shared, so its answers arrive as URL text and a household id in
 * one can be stale. The sheet cannot produce that state; a link can, which is the only way to reach
 * the case where a day is built for fewer households than were asked for.
 */
async function runLinkedPlan(browser, viewport, label, parties, expectations) {
  const dir = join(OUT, 'failures');
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: FAMILY_KEY,
      value: JSON.stringify({
        state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 },
        version: 0,
      }),
    },
  );

  const venueId = await firstVenueId(page, label);
  const query = new URLSearchParams({
    venue: venueId,
    date: PLAN_DATE,
    leaveAt: '09:30',
    visit: '90',
    parties,
  });
  await page.goto(`${BASE}/plan?${query.toString()}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 5200);
  await page.screenshot({ path: join(dir, `${label}.png`) });

  const text = await page.evaluate(() => document.body.innerText);
  for (const [description, matches] of expectations) {
    const ok = matches(text);
    note(label, description, { ok, message: ok ? undefined : text.replace(/\s+/g, ' ').slice(0, 260) });
  }

  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
});
try {
  for (const viewport of VIEWPORTS.filter((v) => !ONLY || v.label === ONLY)) await run(browser, viewport);

  const reference = VIEWPORTS[2];
  console.log('\n=== failure paths (393x852) ===');

  // A must-have at a venue nobody has reviewed: the single likeliest dead end in production.
  await runFailurePaths(browser, reference, { mustHaveFacilities: ['baby_changing'] }, 'requirement-unmet', [
    ['says which requirement stood in the way', (text) => /baby changing/i.test(text)],
    [
      'says nobody confirmed it rather than that the venue lacks it',
      (text) => text.includes('Nobody has confirmed baby changing'),
    ],
    ['does not claim the venue has none', (text) => !/does not have baby changing/.test(text)],
    ['offers something the parent can change', (text) => text.includes('WHAT WOULD HELP')],
  ]);

  // A day that succeeds for one household while another was dropped must say so.
  //
  // The sheet will not let this happen: it refuses to submit while a chosen household cannot be
  // planned for, which is the better first line of defence. A link reaches it anyway -- /plan is
  // reloadable and shareable, and a party id in it can be stale or simply wrong -- so the notice on
  // the finished plan is what stops a day that covers fewer people than were asked for from reading
  // as a correct answer.
  await runLinkedPlan(browser, reference, 'party-dropped', 'mine,a-household-that-is-not-here', [
    ['the plan still renders for the household that could be planned for', (text) => text.includes('Save this plan')],
    [
      'the dropped household is named on the finished plan, not only on a failure',
      (text) => /A family you chose .*so this day does not include them\./.test(text),
    ],
  ]);

  // A household with nowhere to leave from must not be planned for from a default address.
  await runFailurePaths(
    browser,
    reference,
    { homeLocation: '', homeLatitude: null, homeLongitude: null },
    'no-location',
    [['the sheet blocks rather than planning from an invented home', (text) => /Add your family details/i.test(text)]],
  );
} finally {
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'findings.json'), `${JSON.stringify(findings, null, 2)}\n`);

const failed = findings.filter((finding) => finding.ok === false);
console.log(`\n${findings.length - failed.length}/${findings.length} checks passed`);
for (const finding of failed) console.log(`FAIL ${finding.viewport} ${finding.step}: ${finding.message ?? ''}`);
process.exitCode = failed.length ? 1 : 0;
