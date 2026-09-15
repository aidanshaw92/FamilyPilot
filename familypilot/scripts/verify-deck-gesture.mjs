/**
 * Drives the Home recommendation deck with real pointer input and asserts the five behaviours the
 * approved design depends on:
 *
 *   1. swipe left advances exactly one card
 *   2. swipe right reverses exactly one card
 *   3. a drag below the commit threshold springs back and changes nothing
 *   4. the deck clamps at the first and last card rather than wrapping
 *   5. tapping the CTA or the save control does not commit a swipe
 *
 * Usage: node scripts/verify-deck-gesture.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

/**
 * This sandbox ships Chromium at a fixed path and blocks the download Playwright would
 * otherwise do; a CI runner or a developer machine has its own. Use ours when it is there and
 * let Playwright resolve its own otherwise, so the same script runs in both places.
 */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = {
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
};

const BASE = process.argv[2] ?? 'http://localhost:4173';

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo',
      parentName: 'Aidan Shaw',
      members: [
        { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 },
        { id: 'child-2', name: 'Theo', role: 'child', dateOfBirth: '2022-01-01', age: 3 },
      ],
      homeLocation: 'Manchester',
      budgetTier: 'moderate',
      maxDriveMinutes: 30,
      completionPercent: 80,
      vehicle: 'Volvo XC60',
      pushchair: 'Bugaboo Fox',
      travelCot: null,
      memberships: [],
      routines: [],
      mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true,
    hasSeenSplash: true,
    profileRevision: 1,
  },
  version: 0,
};

const ACTIVE = '[role="button"][aria-label$=", see more"]';

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 393, height: 900 } });
const page = await context.newPage();
await page.addInitScript((seed) => {
  window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed));
}, FAMILY_STATE);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector(ACTIVE, { timeout: 30000 });
await page.waitForTimeout(1200);

const activeName = async () => {
  const label = await page.locator(ACTIVE).first().getAttribute('aria-label');
  return label.replace(/, see more$/, '');
};

const currentOffset = async () =>
  page.evaluate((selector) => {
    const card = document.querySelector(selector);
    const layer = card?.parentElement;
    const m = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
    return Math.round(m.m41 * 100) / 100;
  }, ACTIVE);

/** The translateX the active layer comes to rest at, once the spring has stopped moving. */
async function restingOffset() {
  let previous = await currentOffset();
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(150);
    const next = await currentOffset();
    if (next === previous) return next;
    previous = next;
  }
  return previous;
}

/**
 * A pointer drag across the active card. `steps` and `pause` control the release velocity;
 * `settle` is how long to let the spring run afterwards — the full wait matters when the next
 * assertion reads position, but walking to the end of a long deck only needs the label.
 */
async function drag(dx, { steps = 12, pause = 0, settle = 700 } = {}) {
  const card = page.locator(ACTIVE).first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('active card has no box');
  const y = box.y + 90; // above the CTA and below the save control
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y);
    if (pause) await page.waitForTimeout(pause);
  }
  await page.mouse.up();
  await page.waitForTimeout(settle);
}

// --- 1 & 2: one card per swipe, both directions -----------------------------------------------
const first = await activeName();
await drag(-180);
const afterLeft = await activeName();
check('swipe left advances one card', afterLeft !== first, `${first} -> ${afterLeft}`);

await drag(-180);
const afterSecondLeft = await activeName();
check(
  'a second swipe left advances again, one at a time',
  afterSecondLeft !== afterLeft && afterSecondLeft !== first,
  `${afterLeft} -> ${afterSecondLeft}`,
);

await drag(180);
const afterRight = await activeName();
check('swipe right reverses one card', afterRight === afterLeft, `${afterSecondLeft} -> ${afterRight}`);

await drag(180);
const backToFirst = await activeName();
check('swipe right again returns to the first card', backToFirst === first, `-> ${backToFirst}`);

// --- 3: below-threshold drag springs back -------------------------------------------------------
// The commit threshold is 25% of the card (78px at 393pt) or 500px/s. Slow, short and released.
await drag(-40, { steps: 10, pause: 40 });
const urlAfterShort = page.url();
check(
  'a drag below the commit threshold is not treated as a tap',
  !/\/venue\//.test(urlAfterShort),
  urlAfterShort.replace(BASE, '') || '/',
);
const afterShort = await activeName();
const offset = await restingOffset();
check(
  'a drag below the commit threshold springs back',
  afterShort === backToFirst && Math.abs(offset) < 1,
  `still ${afterShort}, resting translateX ${offset}`,
);

// --- 4: clamping at both ends -------------------------------------------------------------------
await drag(180);
const beforeFirstClamp = await activeName();
check(
  'the first card does not wrap to the end',
  beforeFirstClamp === first,
  `still ${beforeFirstClamp}`,
);

// Production returns around ninety places, so the walk has to be able to reach the end of a deck
// that long — and fast enough to be worth running. Only the label is read here, so the spring does
// not need to finish settling between swipes.
const seen = [first];
let guard = 0;
let current = first;
while (guard < 150) {
  await drag(-180, { settle: 220 });
  const next = await activeName();
  if (next === current) break;
  current = next;
  seen.push(next);
  guard += 1;
}
if (guard >= 150) {
  console.log(`(walk stopped at the ${guard}-swipe guard, deck longer than expected)`);
}
const last = current;
await drag(-180);
const afterLastClamp = await activeName();
check(
  'the last card does not wrap back to the start',
  afterLastClamp === last && last !== first,
  `${seen.length} cards, held at ${last}`,
);

// --- 5: taps are not swipes ---------------------------------------------------------------------
// First prove the swipe guard releases: a tap straight after a swipe must still register.
await drag(180);
const afterReverse = await activeName();
const saveAfterSwipe = page
  .locator('[role="button"][aria-label="Save place"], [role="button"][aria-label="Remove from saved"]')
  .first();
const labelBeforeSwipeTap = await saveAfterSwipe.getAttribute('aria-label');
await saveAfterSwipe.click();
await page.waitForTimeout(600);
const labelAfterSwipeTap = await saveAfterSwipe.getAttribute('aria-label');
check(
  'a tap straight after a swipe still registers',
  labelAfterSwipeTap !== labelBeforeSwipeTap && (await activeName()) === afterReverse,
  `${labelBeforeSwipeTap} -> ${labelAfterSwipeTap}`,
);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector(ACTIVE, { timeout: 30000 });
await page.waitForTimeout(1200);
const beforeTaps = await activeName();

const save = page
  .locator('[role="button"][aria-label="Save place"], [role="button"][aria-label="Remove from saved"]')
  .first();
const saveLabelBefore = await save.getAttribute('aria-label');
await save.click();
await page.waitForTimeout(600);
const saveLabelAfter = await save.getAttribute('aria-label');
const afterSaveTap = await activeName();
check(
  'tapping the save control does not swipe the deck',
  afterSaveTap === beforeTaps,
  `still ${afterSaveTap}; save label ${saveLabelBefore} -> ${saveLabelAfter}`,
);

const ctaBox = await page.locator(ACTIVE).first().boundingBox();
await page.mouse.click(ctaBox.x + ctaBox.width / 2, ctaBox.y + ctaBox.height - 46);
await page.waitForTimeout(2000);
const url = page.url();
const openedTheRightVenue = await page.evaluate(
  (name) => document.body.innerText.includes(name),
  beforeTaps,
);
check(
  'tapping the CTA opens the card that was showing, rather than swiping',
  /\/venue\//.test(url) && openedTheRightVenue,
  `${url.replace(BASE, '')} shows ${beforeTaps}: ${openedTheRightVenue}`,
);

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
