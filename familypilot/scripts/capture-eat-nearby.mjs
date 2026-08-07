/**
 * Capture Eat Nearby QA screenshots at 390×844.
 *
 * Usage:
 *   npm run build:web
 *   npm run screenshots:eat-nearby
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT_DIR = join(process.cwd(), '..', 'docs', 'design-review', '390x844', 'eat-nearby');
const STORAGE_KEY = 'familypilot-family-v1';

const DEMO_PROFILE = {
  id: 'family-eat-nearby',
  parentName: 'Sarah',
  members: [
    { id: 'p1', name: 'Sarah', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2021-06-10', age: 4 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2024-11-22', age: 1 },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  budgetTier: 'moderate',
  maxDriveMinutes: 30,
  completionPercent: 75,
  vehicle: 'Tesla Model Y',
  pushchair: 'Bugaboo Butterfly',
  travelCot: null,
  memberships: ['National Trust'],
};

async function waitForReady(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);
}

async function ensureServer(baseUrl) {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return null;
  } catch {
    // start server
  }
  const port = new URL(baseUrl).port || '4173';
  const server = spawn('npx', ['serve', 'dist', '-l', port], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return server;
    } catch {
      // retry
    }
  }
  throw new Error(`Could not reach ${baseUrl}`);
}

mkdirSync(OUT_DIR, { recursive: true });

const serverProcess = await ensureServer(BASE);
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: STORAGE_KEY,
      value: JSON.stringify({
        state: {
          profile: DEMO_PROFILE,
          hasCompletedOnboarding: true,
          hasSeenSplash: true,
          profileRevision: 3,
        },
        version: 0,
      }),
    },
  );

  const shots = [
    { file: '01-venue-eat-nearby.png', path: '/venue/venue-1' },
    { file: '02-explore-restaurants.png', path: '/explore', setup: async () => {
      await page.getByText('Restaurants', { exact: true }).click();
      await page.waitForTimeout(800);
    }},
    { file: '03-restaurant-detail.png', path: '/restaurant/restaurant-1?from=venue-1' },
    { file: '05-saved-restaurant.png', path: '/saved', setup: async () => {
      await page.getByText('Restaurants', { exact: true }).click();
      await page.waitForTimeout(600);
    }},
  ];

  for (const shot of shots) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    if (shot.setup) await shot.setup();
    await page.screenshot({ path: join(OUT_DIR, shot.file) });
    console.log(`✓ ${shot.file}`);
  }

  // Filter sheet
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.getByText('Restaurants', { exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByLabel('Open filters').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT_DIR, '04-restaurant-filter-sheet.png') });
  console.log('✓ 04-restaurant-filter-sheet.png');

  // Empty state — use farm far from restaurants in proximity (venue-4 may have limited options)
  // Navigate to venue with no eat nearby: use invalid combo by visiting venue that's beach - actually use venue-4
  await page.goto(`${BASE}/venue/venue-4`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  // venue-4 has restaurants in proximity - for empty state, scroll to eat nearby section if empty
  // Willows farm venue-3 has restaurants. For empty: mock doesn't have empty easily.
  // Use a venue that exists but scroll - if not empty, still capture section
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '06-eat-nearby-section.png') });
  console.log('✓ 06-eat-nearby-section.png');

  console.log(`\nScreenshots saved to ${OUT_DIR}`);
  await context.close();
} finally {
  await browser.close();
  if (serverProcess) process.kill(-serverProcess.pid);
}
