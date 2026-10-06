/**
 * Renders for the real-device remediation (docs/REAL_DEVICE_REMEDIATION.md), against the local fixture. Zero spend:
 * provider hosts are aborted and fail the run.
 *
 *   home-first-run-<w>.png      Home on a first run while the list loads: the deck-shaped skeleton and its line
 *   home-photo-loading-<w>.png  the cards up, their photographs still loading: the category illustration underneath
 *   home-loaded-<w>.png         the same Home once everything has arrived (nothing has moved)
 *   household-step-<w>.png      "Who else is in your household?": their first name first, the household name after
 *
 * usage: node scripts/capture-real-device-remediation.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = resolve(process.argv[3] ?? join(process.cwd(), '..', 'docs', 'real-device-remediation'));
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov)\.[a-z.]+$|overpass/i;
mkdirSync(OUT, { recursive: true });

const seed = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan', familyName: 'Shaw',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
        { id: 'c1', name: 'Ozzie', role: 'child', dateOfBirth: '2025-03-01', age: 1, ageMonths: 7 },
      ],
      homeLocation: 'Bushey', homeLatitude: 51.643, homeLongitude: -0.36,
      budgetTier: 'moderate', maxDriveMinutes: 60, completionPercent: 80,
      memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
};

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const SAFE_AREA = 'div[style*="safe-area-inset"]{padding-top:59px !important;padding-bottom:34px !important;}';

async function context(width, delays, seeded) {
  const ctx = await browser.newContext({ viewport: { width, height: Math.round(width * 852 / 393) }, deviceScaleFactor: 2 });
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    const wait = url.pathname === '/api/places/search' ? delays.search : url.pathname === '/api/places/photo' ? delays.photo : 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return route.continue().catch(() => {});
  });
  if (seeded) await ctx.addInitScript((s) => window.localStorage.setItem('familypilot-family-v1', JSON.stringify(s)), seed);
  await ctx.addInitScript((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    const attach = () => document.head?.appendChild(style);
    if (document.head) attach(); else document.addEventListener('DOMContentLoaded', attach);
  }, SAFE_AREA);
  return ctx;
}

for (const width of [360, 393, 430]) {
  {
    const ctx = await context(width, { search: 5000, photo: 6000 }, true);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date('2026-01-15T11:00:00'));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-deck-skeleton').waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `home-first-run-${width}.png`) });
    await page.getByTestId('recommendation-deck').waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `home-photo-loading-${width}.png`) });
    await page.waitForTimeout(6500);
    await page.screenshot({ path: join(OUT, `home-loaded-${width}.png`) });
    await ctx.close();
  }
  {
    const ctx = await context(width, {}, false);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/(onboarding)/setup`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('e.g. Sarah').waitFor({ timeout: 20000 });
    await page.getByPlaceholder('e.g. Sarah').fill('Aidan');
    await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill('WD23 1AA');
    await page.getByRole('button', { name: /^continue/i }).first().click();
    await page.getByText('Who else is in your household?').waitFor({ timeout: 20000 });
    await page.getByPlaceholder('e.g. Ellie').fill('Ellie');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `household-step-${width}.png`) });
    await ctx.close();
  }
}
await browser.close();
if (blocked.length) { console.log(`LIVE PROVIDER REQUESTS: ${[...new Set(blocked)].join(', ')}`); process.exit(1); }
console.log(`captured to ${OUT}, zero provider requests`);
