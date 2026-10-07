/**
 * Renders for docs/DECISION_COMPLETION_PASS.md, against the local fixture (realistic scenario). Zero spend: every
 * provider host is aborted and fails the run.
 *
 *   halfway-<w>.png          the Halfway tab, active in the navigation, with the map for the top recommendation
 *   halfway-map-<w>.png      the map and the first result, scrolled to
 *   plans-<w>.png            Plans, with the Saved places card
 *   saved-places-<w>.png     Saved places, now opened from Plans
 *   plan-saved-<w>.png       a generated plan after "Save this plan": Plan saved, View plan, Add to calendar
 *   mobility-<w>.png         onboarding's "How does … get around?" with the new words
 *
 * usage: node scripts/capture-decision-completion.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176';
const OUT = resolve(process.argv[3] ?? join(process.cwd(), '..', 'docs', 'decision-completion'));
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov|openfreemap|mapbox|maptiler)\.[a-z.]+$|overpass/i;
mkdirSync(OUT, { recursive: true });

const NOW = new Date('2026-01-13T07:30:00');
const PROFILE = {
  id: 'family-coherence', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 2, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2025-05-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy', 'carrier'] },
  ],
  homeLocation: 'Bushey, Hertfordshire', homeLatitude: 51.643, homeLongitude: -0.36, budgetTier: 'moderate', maxDriveMinutes: 90,
  completionPercent: 90, memberships: [], routines: [], mustHaveFacilities: [],
};
const GUEST = { id: 'guest-hannah', label: 'Hannah', area: 'E17', latitude: 51.59, longitude: -0.02, ages: [], maxDriveMinutes: 120, budgetTier: 'moderate', pushchair: false, required: [], routines: [] };

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const settle = (page, ms = 1500) => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}).then(() => page.waitForTimeout(ms));

async function phone(width, seeded = true) {
  const context = await browser.newContext({ viewport: { width, height: Math.round(width * 852 / 393) }, deviceScaleFactor: 2 });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  if (seeded) {
    await page.addInitScript(({ profile, guest }) => {
      if (localStorage.getItem('familypilot-family-v1')) return;
      localStorage.setItem('familypilot-family-v1', JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }));
      localStorage.setItem('familypilot-planning-v1', JSON.stringify({ state: { families: [guest], options: { date: '2026-01-13', leaveAt: '10:00', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [] }, version: 0 }));
    }, { profile: PROFILE, guest: GUEST });
  }
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = 'div[style*="safe-area-inset"]{padding-top:59px !important;padding-bottom:34px !important;}';
    const attach = () => document.head?.appendChild(style);
    if (document.head) attach(); else document.addEventListener('DOMContentLoaded', attach);
  });
  return { context, page };
}

for (const width of [360, 393, 430]) {
  {
    const { context, page } = await phone(width);
    await page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3000);
    await page.screenshot({ path: join(OUT, `halfway-${width}.png`) });
    await page.getByTestId('halfway-map').evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `halfway-map-${width}.png`) });

    await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.screenshot({ path: join(OUT, `plans-${width}.png`) });
    await page.getByTestId('plans-saved-places').click().catch(() => {});
    await settle(page);
    await page.screenshot({ path: join(OUT, `saved-places-${width}.png`) });

    // A plan for both families from Meet halfway, then saved.
    await page.goto(`${BASE}/halfway?family=guest-hannah`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3000);
    await page.getByTestId('halfway-plan').first().click().catch(() => {});
    await settle(page, 3500);
    await page.getByTestId('plan-save').click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `plan-saved-${width}.png`) });
    await context.close();
  }
  {
    const { context, page } = await phone(width, false);
    await page.goto(`${BASE}/(onboarding)/setup`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('e.g. Sarah').waitFor({ timeout: 20000 });
    await page.getByPlaceholder('e.g. Sarah').fill('Aidan');
    await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill('WD23 1AA');
    await page.getByRole('button', { name: /^continue/i }).first().click();
    await page.getByText('Who else is in your household?').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: /^continue/i }).first().click();
    await page.getByPlaceholder('e.g. Mia').waitFor({ timeout: 20000 });
    await page.getByPlaceholder('e.g. Mia').fill('Ozzie');
    await page.getByLabel(/day of birth/i).first().fill('01');
    await page.getByLabel(/month of birth/i).first().fill('05');
    await page.getByLabel(/year of birth/i).first().fill('2025');
    await page.getByRole('button', { name: /^continue/i }).first().click();
    await page.getByText(/get around/).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `mobility-${width}.png`) });
    await context.close();
  }
}
await browser.close();
if (blocked.length) { console.log(`LIVE PROVIDER REQUESTS: ${[...new Set(blocked)].join(', ')}`); process.exit(1); }
console.log(`captured to ${OUT}, zero provider requests`);
