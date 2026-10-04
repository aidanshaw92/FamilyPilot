/**
 * Real app render vs the approved canonical Figma frames (Welcome, Home, Explore).
 *
 * The three frames are APPROVED on page 117:2 of Figma file LNpbdnuAWcfWf9spvB7jBz (see
 * docs/FIGMA_APPROVED_FRAMES.md). Their reference-hidden renders are committed in
 * docs/figma-approved/*-393.png. They are 852 px wide, i.e. a 393 pt phone at 2.168x, so the app
 * is rendered in a 393 x 852 viewport at that device scale factor and the two are the same size.
 *
 * What this measures, and what it does not:
 *  - It compares GEOMETRY, colour, type and decoration. The app shows fixture venues, so names,
 *    scores, travel times and photographs differ by design (DYNAMIC CONTENT); the Figma photo crops
 *    are review-only. The OS status bar is drawn in Figma but is device chrome, so the top band is
 *    excluded from the numbers.
 *  - Nothing here spends money: the app is served by scripts/serve-places-fixture.mjs.
 *
 * Usage: node scripts/serve-places-fixture.mjs 4173 &
 *        node scripts/compare-canonical-screens.mjs [baseUrl] [outDir] [widths]
 *   widths = comma list of CSS widths to also capture app-only (default 360,393,430)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = {
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
};

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = resolve(process.argv[3] ?? join(process.cwd(), '..', 'docs', 'figma-compare'));
const WIDTHS = (process.argv[4] ?? '360,393,430').split(',').map(Number);
const FIGMA_DIR = resolve(process.cwd(), '..', 'docs', 'figma-approved');
const SCALE = 852 / 393;
const IPHONE_INSETS = { top: 59, bottom: 34 };
const STATUS_BAR_PX = 90; // Figma px at the top that are OS chrome

const PROFILE = {
  state: {
    profile: {
      id: 'family-demo',
      parentName: 'Aidan Shaw',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2021-01-01', age: 5 },
      ],
      homeLocation: 'London',
      budgetTier: 'moderate',
      maxDriveMinutes: 60,
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
const FRESH = { state: { hasCompletedOnboarding: false, hasSeenSplash: true }, version: 0 };

const SCREENS = [
  { key: 'welcome', route: '/welcome', state: FRESH, figma: 'welcome-393.png' },
  { key: 'home', route: '/', state: PROFILE, figma: 'home-393.png' },
  { key: 'explore', route: '/explore', state: PROFILE, figma: 'explore-393.png' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launchOptions);

async function shoot(screen, width, dsf) {
  const height = Math.round(width * (852 / 393));
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-01-15T19:30:00'));
  await page.addInitScript(
    ([seed]) => window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)),
    [screen.state],
  );
  await page.addInitScript((insets) => {
    const style = document.createElement('style');
    style.textContent = `div[style*="safe-area-inset"]{padding-top:${insets.top}px !important;padding-bottom:${insets.bottom}px !important;}`;
    const attach = () => document.head?.appendChild(style);
    if (document.head) attach();
    else document.addEventListener('DOMContentLoaded', attach);
  }, IPHONE_INSETS);
  await page.goto(`${BASE}${screen.route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(async () => document.fonts?.ready);
  await page.waitForTimeout(3500);
  const png = await page.screenshot({ type: 'png' });
  await context.close();
  return png;
}

const report = [];
for (const screen of SCREENS) {
  const appPng = await shoot(screen, 393, SCALE);
  const appPath = join(OUT, `${screen.key}-app-393.png`);
  writeFileSync(appPath, appPng);
  const figmaB64 = readFileSync(join(FIGMA_DIR, screen.figma)).toString('base64');
  const appB64 = appPng.toString('base64');

  // Composite + numbers computed in a throwaway page so the script needs no image library.
  const ctx = await browser.newContext({ viewport: { width: 2600, height: 1900 } });
  const page = await ctx.newPage();
  await page.setContent('<body style="margin:0;background:#888"></body>');
  const stats = await page.evaluate(
    async ({ figmaB64, appB64, statusBar }) => {
      const load = (b64) =>
        new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = `data:image/png;base64,${b64}`;
        });
      const [f, a] = await Promise.all([load(figmaB64), load(appB64)]);
      const w = f.naturalWidth;
      const h = f.naturalHeight;
      const get = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, w, h);
        return x.getImageData(0, 0, w, h);
      };
      const fd = get(f);
      const ad = get(a);
      const diff = document.createElement('canvas');
      diff.width = w;
      diff.height = h;
      const dx = diff.getContext('2d');
      const di = dx.createImageData(w, h);
      let sum = 0;
      let over = 0;
      let n = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const d =
            (Math.abs(fd.data[i] - ad.data[i]) +
              Math.abs(fd.data[i + 1] - ad.data[i + 1]) +
              Math.abs(fd.data[i + 2] - ad.data[i + 2])) /
            3;
          const v = Math.min(255, d * 3);
          di.data[i] = di.data[i + 1] = di.data[i + 2] = v;
          di.data[i + 3] = 255;
          if (y >= statusBar) {
            sum += d;
            n++;
            if (d > 24) over++;
          }
        }
      }
      dx.putImageData(di, 0, 0);
      const out = document.createElement('canvas');
      out.width = w * 3 + 40;
      out.height = h + 20;
      const ox = out.getContext('2d');
      ox.fillStyle = '#888';
      ox.fillRect(0, 0, out.width, out.height);
      ox.drawImage(f, 10, 10);
      ox.drawImage(a, w + 20, 10, w, h);
      ox.drawImage(diff, w * 2 + 30, 10);
      document.body.appendChild(out);
      return {
        mean: +(sum / n).toFixed(2),
        pctOver24: +((100 * over) / n).toFixed(2),
        w,
        h,
      };
    },
    { figmaB64, appB64, statusBar: STATUS_BAR_PX },
  );
  await page.setViewportSize({ width: stats.w * 3 + 40, height: stats.h + 20 });
  const comp = await page.screenshot({ type: 'png' });
  writeFileSync(join(OUT, `${screen.key}-figma-app-diff.png`), comp);
  await ctx.close();
  report.push({ screen: screen.key, ...stats });
  console.log(`${screen.key.padEnd(8)} mean ${stats.mean}  >24: ${stats.pctOver24}%`);
}

// App-only captures at the supported widths, for the overflow/clearance probes and for review.
for (const screen of SCREENS) {
  for (const w of WIDTHS) {
    const png = await shoot(screen, w, 2);
    writeFileSync(join(OUT, `${screen.key}-app-${w}.png`), png);
  }
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
