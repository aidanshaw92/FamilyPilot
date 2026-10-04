/**
 * Geometry for the three screens the approved journey added: the Create a Plan sheet, Generating,
 * and the Plan.
 *
 * The sibling of `verify-home-against-figma.mjs`, and deliberately the same shape: measure the
 * rendered page against the numbers the design fixed, so a drift fails a build instead of surviving
 * to a review. Where Home's frame is locked in Figma, these numbers live in the design tokens and in
 * the approved 393x852 reference, and are repeated here on purpose -- a check that reads the same
 * constant the code reads cannot catch the constant being wrong.
 *
 * Fixture-backed, always. It is served the synthetic places fixture on the bundle's own origin and
 * makes no Google request of any kind; the workflow never offers this script a production path.
 *
 * Usage: node scripts/verify-plan-screens-against-design.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? join(process.cwd(), '..', 'docs', 'plan-screens-regression');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

/** The approved reference frame. The sheet's 640 is expressed against this height. */
const REF_WIDTH = 393;
const REF_HEIGHT = 852;
const SHEET_HEIGHT = 640;
const SHEET_RADIUS = 34;
const SCRIM_ALPHA = 0.42;
const IPHONE_INSETS = { top: 59, bottom: 34 };

const VENUE = 'fp-google-FIXTUREedgeRich';

/**
 * The run's wall clock, pinned rather than inherited.
 *
 * The Create a Plan sheet defaults START to the next sensible slot after the current time, so a run
 * after roughly 17:00 London proposed a visit finishing past the fixture venue's 20:00 close and the
 * Plan correctly refused -- which read here as sixteen geometry failures ("no button", "no first
 * stop") that had nothing to do with geometry. A Friday mid-morning sits inside every fixture
 * venue's hours with room for a three-hour visit.
 */
const PINNED_NOW = new Date('2026-10-02T09:00:00.000Z');

const RUNS = [
  { name: '360', width: 360, height: 800, insets: null },
  { name: '393', width: REF_WIDTH, height: REF_HEIGHT, insets: null },
  { name: '430', width: 430, height: 932, insets: null },
  { name: '393-iphone-insets', width: REF_WIDTH, height: REF_HEIGHT, insets: IPHONE_INSETS },
];

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-design',
      parentName: 'Aidan Shaw',
      members: [
        { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'parent-2', name: 'Sam', role: 'parent', dateOfBirth: '1991-01-01', age: 34 },
        { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 },
        { id: 'child-2', name: 'Theo', role: 'child', dateOfBirth: '2022-01-01', age: 3 },
      ],
      homeLocation: 'Bushey, Hertfordshire',
      homeLatitude: 51.643,
      homeLongitude: -0.36,
      budgetTier: 'moderate',
      maxDriveMinutes: 90,
      completionPercent: 80,
      routines: [],
      mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true,
    hasSeenSplash: true,
    profileRevision: 2,
  },
  version: 0,
};

const results = [];
function check(run, name, passed, detail) {
  results.push({ run, name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const near = (actual, expected, tolerance = 1) => Math.abs(actual - expected) <= tolerance;

async function settle(page, ms = 1800) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(ms);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
});

for (const run of RUNS) {
  console.log(`\n--- ${run.name} (${run.width}x${run.height}${run.insets ? ', iPhone insets' : ''}) ---`);
  const context = await browser.newContext({
    viewport: { width: run.width, height: run.height },
    deviceScaleFactor: 2,
    timezoneId: 'Europe/London',
  });
  // Installed then resumed: `install` alone hands timer control to the test, which would strand
  // every setTimeout the generating sequence depends on. This pins the starting instant and lets
  // time flow normally from there.
  await context.clock.install({ time: PINNED_NOW });
  await context.clock.resume();
  const page = await context.newPage();
  await page.addInitScript((seed) => {
    window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed));
  }, FAMILY_STATE);

  // The provider reads `env(safe-area-inset-*)` off a probe element's inline style, which a desktop
  // browser computes as 0; an `!important` rule is the one thing that outranks an inline style.
  if (run.insets) {
    await page.addInitScript((insets) => {
      const style = document.createElement('style');
      style.textContent = `div[style*="safe-area-inset"] {
        padding-top: ${insets.top}px !important;
        padding-bottom: ${insets.bottom}px !important;
      }`;
      const install = () => document.head?.appendChild(style);
      if (document.head) install();
      else document.addEventListener('DOMContentLoaded', install);
    }, run.insets);
  }

  const safeBottom = run.height - (run.insets?.bottom ?? 0);

  // --- CREATE A PLAN SHEET ----------------------------------------------------------------------
  await page.goto(`${BASE}/venue/${VENUE}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  await page.getByTestId('venue-create-plan').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `${run.name}-create-plan.png`) });

  const sheet = page.getByTestId('create-plan-sheet');
  const box = await sheet.boundingBox().catch(() => null);
  const expectedHeight = Math.min(720, Math.max(420, run.height * (SHEET_HEIGHT / REF_HEIGHT)));

  check(run.name, 'sheet height holds the approved 640/852 share', box ? near(box.height, expectedHeight, 2) : false,
    box ? `${Math.round(box.height)} against ${Math.round(expectedHeight)}` : 'no sheet');
  check(run.name, 'sheet is flush with the bottom of the viewport', box ? near(box.y + box.height, run.height, 2) : false,
    box ? `${Math.round(box.y + box.height)} against ${run.height}` : 'no sheet');
  check(run.name, 'sheet spans the full width', box ? near(box.width, run.width, 2) : false,
    box ? `${Math.round(box.width)} against ${run.width}` : 'no sheet');

  const radius = await sheet.evaluate((n) => getComputedStyle(n).borderTopLeftRadius).catch(() => '');
  check(run.name, `sheet top radius is ${SHEET_RADIUS}`, near(parseFloat(radius), SHEET_RADIUS, 0.5), radius);

  // The scrim is the one element covering the viewport behind the sheet.
  const scrim = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      const bg = getComputedStyle(el).backgroundColor;
      if (r.width >= vw - 2 && r.height >= vh - 2 && /^rgba\(/.test(bg)) {
        const alpha = Number(bg.split(',').pop().replace(')', '').trim());
        if (alpha > 0 && alpha < 1) return { bg, alpha };
      }
    }
    return null;
  });
  check(run.name, `scrim sits at ${SCRIM_ALPHA} opacity`, scrim ? near(scrim.alpha, SCRIM_ALPHA, 0.02) : false,
    scrim ? scrim.bg : 'no scrim found');

  const grabber = await page.evaluate(() => {
    // A short, wide, fully rounded bar near the top of the sheet.
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.height > 2 && r.height <= 8 && r.width >= 28 && r.width <= 80 && parseFloat(s.borderTopLeftRadius) >= r.height / 2) {
        return { width: Math.round(r.width), height: Math.round(r.height) };
      }
    }
    return null;
  });
  check(run.name, 'sheet shows a grabber', grabber !== null, grabber ? `${grabber.width}x${grabber.height}` : 'none found');

  const submit = await page.getByTestId('create-plan-submit').boundingBox().catch(() => null);
  check(run.name, 'sheet submit clears the home indicator', submit ? submit.y + submit.height <= safeBottom + 1 : false,
    submit ? `${Math.round(submit.y + submit.height)} against ${safeBottom}` : 'no button');

  // --- GENERATING -------------------------------------------------------------------------------
  // Against a local fixture the phase lasts a few milliseconds, so this check used to record
  // "passed too quickly to measure" as a PASS and never test the copy at all. Holding the journey
  // call -- the one the plan genuinely waits on -- makes the screen observable without faking
  // anything: it is what a parent on a slow connection sees.
  const holdJourney = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  };
  await page.route('**/api/context/journey**', holdJourney);

  await page.getByTestId('create-plan-submit').click();
  const generating = page.getByTestId('generating-plan');
  await generating.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  if (await generating.isVisible().catch(() => false)) {
    // Read the words BEFORE screenshotting: the capture takes long enough for the phase to advance,
    // and then the assertion measures the finished Plan while reporting it as the generating copy.
    const copy = await generating.innerText();
    await page.screenshot({ path: join(OUT, `${run.name}-generating.png`) });
    check(run.name, 'generating names real work and never claims to think',
      /Checking|Working out|Fitting/i.test(copy) && !/thinking|magic|hold on|\bai\b|assistant/i.test(copy),
      copy.replace(/\s+/g, ' ').slice(0, 70));
  } else {
    // Not a pass. The phase is held open deliberately, so missing it is a finding.
    check(run.name, 'generating was reached', false,
      'the generating phase never appeared, even with the journey call held open');
  }

  // --- PLAN -------------------------------------------------------------------------------------
  await page.waitForTimeout(4800);
  await settle(page, 600);
  await page.unroute('**/api/context/journey**', holdJourney);
  await page.screenshot({ path: join(OUT, `${run.name}-plan.png`) });

  const save = await page.getByTestId('plan-save').boundingBox().catch(() => null);
  check(run.name, 'plan renders with its persistent save action', save !== null,
    save ? `${Math.round(save.width)}x${Math.round(save.height)}` : 'no button');
  check(run.name, 'plan save clears the home indicator', save ? save.y + save.height <= safeBottom + 1 : false,
    save ? `${Math.round(save.y + save.height)} against ${safeBottom}` : 'no button');

  const nav = await page.evaluate(() => {
    const ids = ['plan-section-day', 'plan-section-who', 'plan-section-travel'];
    const boxes = ids.map((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { id, top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
    });
    return boxes.every(Boolean) ? boxes : null;
  });
  check(run.name, 'the three section controls sit on one row', nav ? nav.every((b) => b.top === nav[0].top) : false,
    nav ? nav.map((b) => `${b.id.replace('plan-section-', '')}@${b.left}`).join(' ') : 'missing controls');
  // Primary navigation: all three controls whole and inside the gutters, not scrolled off the edge.
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  check(run.name, 'every section control is fully visible inside the gutters', nav ? nav.every((b) => b.left >= 19 && b.right <= viewportWidth - 19) : false,
    nav ? nav.map((b) => `${b.id.replace('plan-section-', '')}:${b.left}-${b.right}`).join(' ') + ` of ${viewportWidth}` : 'missing controls');

  const sideScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(run.name, 'the plan does not scroll sideways', sideScroll <= 1, `${sideScroll}px overflow`);

  const firstStop = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="plan-stop-0"]');
    if (!el) return null;
    const t = el.textContent ?? '';
    return { expanded: t.includes('Arrive') && t.includes('Time there') };
  });
  check(run.name, 'the first stop opens and the rest stay closed', firstStop ? firstStop.expanded : false,
    firstStop ? 'expanded' : 'no first stop');

  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`FAIL ${f.run} ${f.name}: ${f.detail ?? ''}`);
process.exit(failed.length ? 1 : 0);
