/**
 * Explore, in a real browser, at the four phone widths: (1) the end of the list clears the floating navigation, so the
 * last card and its place credit can be read and tapped; (2) the "Food nearby" filters keep only places KNOWN to have
 * food, say how many were not checked, and never treat a missing lookup as "no food".
 *
 * Fixture only (realistic scenario): four venues carry a stored food lookup, the rest have none.
 *
 * Usage: node scripts/verify-explore-clearance.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://localhost:4175';

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan Shaw',
      members: [
        { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 },
      ],
      homeLocation: 'Manchester', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 80,
      vehicle: 'Volvo XC60', pushchair: 'Bugaboo Fox', travelCot: null, memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
};


let failed = 0;
const check = (name, pass, detail) => { if (!pass) failed += 1; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };

const browser = await chromium.launch(launchOptions);
for (const [width, height] of [[360, 780], [390, 844], [393, 852], [430, 932]]) {
  const label = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.addInitScript((seed) => localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), FAMILY_STATE);
  await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  // 1. end of list clears the navigation: wheel to the very end, then find the lowest text on screen
  await page.mouse.move(width / 2, height / 2);
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(120);
    const top = await page.evaluate(() => [...document.querySelectorAll('div')].reduce((m, el) => Math.max(m, el.scrollTop), 0));
    if (top === last) break;
    last = top;
  }
  await page.waitForTimeout(400);
  const clearance = await page.evaluate(() => {
    const nav = document.querySelector('[role="tablist"]')?.getBoundingClientRect();
    let bottom = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.height > 0 && r.top < window.innerHeight && r.bottom <= window.innerHeight + 1) bottom = Math.max(bottom, r.bottom);
    }
    return { navTop: nav?.top ?? null, contentBottom: bottom };
  });
  check(`${label}: Explore scrolled to the end clears the navigation`, clearance.navTop !== null && last > 0 && clearance.contentBottom <= clearance.navTop - 4,
    `scrolled ${last}px; last text ends ${clearance.contentBottom.toFixed(0)}, nav starts ${clearance.navTop?.toFixed(0)}`);

  // 2. food filter
  await page.evaluate(() => { for (const el of document.querySelectorAll('div')) if (el.scrollTop > 0) el.scrollTop = 0; });
  const before = Number(((await page.evaluate(() => document.body.innerText)).match(/(\d+) places? across London/) ?? [])[1] ?? -1);
  await page.getByText(/^Filters/).first().click();
  await page.waitForTimeout(600);
  const sheet = await page.evaluate(() => document.body.innerText);
  check(`${label}: the filter sheet has a "Food nearby" group`, /Food nearby/.test(sheet) && /Café on site/.test(sheet) && /Food within 5 min walk/.test(sheet) && /Food within 10 min walk/.test(sheet));
  await page.getByText('Food within 5 min walk', { exact: true }).click();
  await page.getByRole('button', { name: /show results/i }).click();
  await page.waitForTimeout(900);
  const text = await page.evaluate(() => document.body.innerText);
  const count = Number((text.match(/(\d+) places? across London/) ?? [])[1] ?? -1);
  check(`${label}: within 5 min keeps only places known to have food (a café on site counts)`, count >= 1 && count < before, `${count} of ${before} places`);
  check(`${label}: it says how many could not be checked`, /\d+ not checked for food nearby/.test(text), (text.match(/\d+ not checked for food nearby/) ?? [''])[0]);
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
