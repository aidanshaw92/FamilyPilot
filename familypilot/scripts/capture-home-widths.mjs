/**
 * Capture Home at the three phone widths the responsive header is judged on, and report the
 * measured width of the greeting and the search placeholder so overflow is caught by number
 * rather than by eye.
 *
 * Usage: node scripts/capture-home-widths.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? join(process.cwd(), '..', 'docs', 'home-widths');
const WIDTHS = [360, 393, 430];

/** Home is behind onboarding, so seed the persisted family store the way a real user leaves it. */
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

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/pw-browsers/chromium',
});

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  // Pin the clock so the greeting is the same string every run — "Good afternoon" is the longest
  // of the three, and so the case the narrow layout has to survive.
  await page.clock.setFixedTime(new Date('2026-01-15T14:30:00'));
  await page.addInitScript((seed) => {
    window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed));
  }, FAMILY_STATE);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const measured = await page.evaluate(() => {
    /** Natural width of the text, which is what a line clamp hides. */
    const naturalWidth = (el) => {
      if (el.tagName === 'INPUT') {
        const probe = document.createElement('span');
        const cs = getComputedStyle(el);
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
        probe.textContent = el.value || el.placeholder || '';
        document.body.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      }
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    };

    const report = (el) => {
      const natural = naturalWidth(el);
      const box = el.getBoundingClientRect().width;
      return {
        text: el.tagName === 'INPUT' ? el.value || el.placeholder : el.textContent,
        fontSize: getComputedStyle(el).fontSize,
        naturalWidth: Math.round(natural * 100) / 100,
        boxWidth: Math.round(box * 100) / 100,
        clipped: natural > box + 0.5,
      };
    };

    const greeting = [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && (el.textContent ?? '').trim().startsWith('Good '),
    );
    const search = [...document.querySelectorAll('input')].find((el) =>
      (el.value || el.placeholder || '').startsWith('Search'),
    );

    return {
      greeting: greeting ? report(greeting) : null,
      search: search ? report(search) : null,
      documentScrollWidth: document.documentElement.scrollWidth,
    };
  });

  console.log(`\n--- ${width}px ---`);
  console.log(JSON.stringify(measured, null, 2));

  await page.screenshot({ path: join(OUT, `home-${width}.png`) });
  await context.close();
}

await browser.close();
