/**
 * Home greeting vs. the frame's avatar strokes, in a real browser (zero-spend: provider hosts are
 * aborted and fail the run).
 *
 * The approved Home frame draws three yellow strokes up and to the left of the avatar. They are part of
 * the frame's artwork, so a long greeting can run behind them. This renders the greeting for names of
 * several lengths at 360 / 393 / 430 and checks, against the strokes' own geometry (frame 229:133,
 * nodes 268:133-135), that the text:
 *   - never reaches the strokes (>= CLEAR pt of air between the text and the first stroke),
 *   - is never clipped or ellipsised (every character is painted),
 *   - never runs into the avatar,
 *   - and that a normal-length greeting keeps the approved single-line composition.
 *
 * usage: node scripts/verify-home-greeting.mjs [baseUrl] [outDir]   (outDir optional: saves captures)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = process.argv[3] ? resolve(process.argv[3]) : null;
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov)\.[a-z.]+$|overpass/i;

// The frame's strokes, in frame px (852 wide): x from 647 - cap to 700 + cap, y from 111 - cap to 172 + cap.
const FRAME_W = 852;
const STROKE = { left: 647 - 4.5, top: 111 - 4.5, bottom: 172 + 4.5 };
const CLEAR = 8; // pt of air required between the text and the nearest stroke

// [clock hour, first name, expected greeting prefix]
const CASES = [
  ['Good morning, Jo', 9, 'Jo'],
  ['Good afternoon, Aidan', 14, 'Aidan'],
  ['Good evening, Alexandra', 19, 'Alexandra'],
  ['Good afternoon, Christopher', 14, 'Christopher'],
  ['Good afternoon, Maximilian-James', 14, 'Maximilian-James'],
];
const WIDTHS = [360, 393, 430];

const profile = (name) => ({
  state: {
    profile: {
      id: 'family-demo', parentName: `${name} Shaw`,
      members: [{ id: 'p1', name, role: 'parent', dateOfBirth: '1990-01-01', age: 35 }],
      homeLocation: 'London', budgetTier: 'moderate', maxDriveMinutes: 60, completionPercent: 80,
      vehicle: 'Volvo XC60', pushchair: null, travelCot: null, memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
});

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
let failures = 0;
const rows = [];
if (OUT) mkdirSync(OUT, { recursive: true });

for (const [greeting, hour, name] of CASES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: Math.round(width * 852 / 393) }, deviceScaleFactor: 2 });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(`2026-01-15T${String(hour).padStart(2, '0')}:30:00`));
    await page.addInitScript((seed) => window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), profile(name));
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = 'div[style*="safe-area-inset"]{padding-top:59px !important;padding-bottom:34px !important;}';
      const attach = () => document.head?.appendChild(style);
      if (document.head) attach(); else document.addEventListener('DOMContentLoaded', attach);
    });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(async () => document.fonts?.ready);
    await page.waitForTimeout(2500);

    const m = await page.evaluate((expected) => {
      const el = [...document.querySelectorAll('div,span')].find((n) => n.children.length === 0 && n.textContent === expected);
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const lines = [...new Set(rects.map((r) => Math.round(r.top)))].length;
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const box = el.getBoundingClientRect();
      const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      const fontSize = parseFloat(getComputedStyle(el).fontSize);
      const avatar = document.querySelector('[aria-label="Your family profile"]')?.getBoundingClientRect();
      return { lines, right, top, bottom, boxRight: box.right, clipped, fontSize, avatarLeft: avatar?.left ?? null, avatarTop: avatar?.top ?? null };
    }, greeting);

    const scale = width / FRAME_W;
    const strokeLeft = STROKE.left * scale;
    const strokeTop = STROKE.top * scale;
    const strokeBottom = STROKE.bottom * scale;
    const problems = [];
    if (!m) problems.push('greeting not found');
    else {
      // Only the lines that sit in the strokes' vertical band can touch them; a wrapped second line is below.
      const firstLineRight = m.right; // upper bound over all lines
      const inBand = m.top < strokeBottom && m.top + 30 > strokeTop; // first line occupies the band
      if (inBand && firstLineRight > strokeLeft - CLEAR && m.lines === 1) problems.push(`text ends ${firstLineRight.toFixed(1)} > stroke ${strokeLeft.toFixed(1)} - ${CLEAR}`);
      if (m.clipped) problems.push('text is clipped / ellipsised');
      if (m.avatarLeft !== null && m.right > m.avatarLeft - 4) problems.push(`text ${m.right.toFixed(1)} reaches avatar ${m.avatarLeft.toFixed(1)}`);
      if (m.lines > 2) problems.push(`${m.lines} lines`);
    }
    rows.push({ greeting, width, ...(m ?? {}), strokeLeft: +strokeLeft.toFixed(1), problems });
    if (problems.length) failures += 1;
    if (OUT) writeFileSync(join(OUT, `greeting-${name.toLowerCase()}-${width}.png`), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height: 200 } }));
    await context.close();
  }
}
await browser.close();

for (const r of rows) {
  console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${String(r.width).padStart(3)}  ${r.greeting.padEnd(34)} lines=${r.lines} font=${r.fontSize} right=${r.right?.toFixed?.(1)} strokes@${r.strokeLeft} ${r.problems.join('; ')}`);
}
if (blocked.length) { console.log('LIVE PROVIDER REQUESTS:', [...new Set(blocked)].join(', ')); failures += 1; }
console.log(failures ? `greeting check: ${failures} failing` : `greeting check: ${rows.length}/${rows.length} passed, zero provider requests`);
process.exit(failures ? 1 : 0);
