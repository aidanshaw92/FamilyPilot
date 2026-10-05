/**
 * Renders Home in a real browser at real phone sizes (width x height, including the shorter heights a
 * phone browser leaves once its own toolbars are showing) and measures, from the DOM rather than from
 * arithmetic, whether the foreground card fits and whether the floating navigation covers its CTA.
 *
 * Usage: node scripts/verify-home-fit.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://localhost:4175';
const OUT = process.argv[3] ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan Shaw',
      members: [
        { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 },
        { id: 'child-2', name: 'Theo', role: 'child', dateOfBirth: '2022-01-01', age: 3 },
      ],
      homeLocation: 'Manchester', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 80,
      vehicle: 'Volvo XC60', pushchair: 'Bugaboo Fox', travelCot: null, memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
};

// Heights: a phone's full screen, and the shorter layout viewport a phone browser leaves with its toolbars up.
const SIZES = [
  [360, 640], [360, 740], [360, 800],
  [390, 664], [390, 750], [390, 844],
  [393, 660], [393, 760], [393, 852],
  [430, 740], [430, 820], [430, 932],
];

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };

const browser = await chromium.launch(launchOptions);
for (const [w, h] of SIZES) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript((seed) => localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), FAMILY_STATE);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[role="button"][aria-label$=", see more"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const card = document.querySelector('[role="button"][aria-label$=", see more"]').parentElement; // the card
    const cta = [...card.querySelectorAll('div')].find((d) => d.textContent === 'See more' ) ;
    const ctaEl = cta?.parentElement ?? null;
    const tablist = document.querySelector('[role="tablist"]');
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { card: r(card), cta: r(ctaEl), nav: r(tablist), vh: window.innerHeight, vw: window.innerWidth };
  });
  const tag = `${w}x${h}`;
  if (OUT) await page.screenshot({ path: `${OUT}/home-${tag}.png` });
  const fitsCard = m.card && m.card.top >= 0 && m.card.bottom <= m.vh && m.card.left >= 0 && m.card.right <= m.vw;
  const ctaClear = m.cta && m.nav && (m.cta.bottom <= m.nav.top - 4 || m.cta.top >= m.nav.bottom || m.cta.right <= m.nav.left || m.cta.left >= m.nav.right);
  const ctaOnScreen = m.cta && m.cta.top >= 0 && m.cta.bottom <= m.vh;
  check(`${tag}: the whole foreground card is on screen at rest`, !!fitsCard, JSON.stringify(m.card));
  check(`${tag}: See more is on screen`, !!ctaOnScreen, JSON.stringify(m.cta));
  check(`${tag}: navigation does not cover See more`, !!ctaClear, `cta bottom ${m.cta?.bottom?.toFixed(1)} nav top ${m.nav?.top?.toFixed(1)}`);
  await context.close();
}
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
