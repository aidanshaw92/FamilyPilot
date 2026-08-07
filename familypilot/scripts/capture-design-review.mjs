/**
 * Capture a complete design-review screenshot pack for FamilyPilot.
 *
 * Usage:
 *   npm run build:web
 *   npx serve dist -l 4173
 *   node scripts/capture-design-review.mjs http://127.0.0.1:4173
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT_ROOT = join(process.cwd(), '..', 'docs', 'design-review');
const STORAGE_KEY = 'familypilot-family-v1';

const VIEWPORTS = [
  { label: '390x844', width: 390, height: 844 },
  { label: '430x932', width: 430, height: 932 },
];

const DEMO_PROFILE = {
  id: 'family-design-review',
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

function persistPayload(overrides) {
  return JSON.stringify({
    state: {
      profile: DEMO_PROFILE,
      hasCompletedOnboarding: true,
      hasSeenSplash: true,
      profileRevision: 3,
      ...overrides,
    },
    version: 0,
  });
}

async function waitForScreenReady(page, { animationMs = 2600 } = {}) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      return !text.includes('Loading profile') && !text.match(/Loading/i);
    },
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(animationMs);
}

async function seedStorage(page, payload) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: payload },
  );
}

async function clearStorage(page) {
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
  }, STORAGE_KEY);
}

async function capture(page, outDir, filename) {
  const path = join(outDir, filename);
  await page.screenshot({ path, fullPage: false });
  console.log(`  ✓ ${filename}`);
}

async function clickButton(page, label) {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
}

async function fillFirstInput(page, value) {
  const input = page.locator('input').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(value);
}

async function captureOnboardingSteps(page, outDir) {
  await page.goto(`${BASE}/setup`, { waitUntil: 'domcontentloaded' });
  await waitForScreenReady(page, { animationMs: 1200 });
  await capture(page, outDir, '03-onboarding-step-1-name.png');

  await fillFirstInput(page, 'Sarah');
  await clickButton(page, 'Continue');
  await waitForScreenReady(page, { animationMs: 900 });
  await capture(page, outDir, '04-onboarding-step-2-location.png');

  await fillFirstInput(page, 'Bushey, Hertfordshire');
  await clickButton(page, 'Continue');
  await waitForScreenReady(page, { animationMs: 900 });
  await capture(page, outDir, '05-onboarding-step-3-children.png');

  const inputs = page.locator('input');
  await inputs.nth(0).fill('Mia');
  await inputs.nth(1).fill('4');
  await clickButton(page, 'Continue');
  await waitForScreenReady(page, { animationMs: 900 });
  await capture(page, outDir, '06-onboarding-step-4-preferences.png');
}

async function captureEmptyStates(page, outDir) {
  await page.goto(`${BASE}/venue/invalid-id`, { waitUntil: 'domcontentloaded' });
  await waitForScreenReady(page);
  await capture(page, outDir, '17-empty-venue-not-found.png');

  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await waitForScreenReady(page);
  await clickButton(page, 'Indoor');
  await page.getByRole('button', { name: 'More filters' }).click();
  await page.waitForTimeout(600);
  await clickButton(page, 'Parks');
  await page.getByText('Show results').click();
  await waitForScreenReady(page, { animationMs: 900 });
  await capture(page, outDir, '18-empty-explore-filters.png');

  await page.goto(`${BASE}/saved`, { waitUntil: 'domcontentloaded' });
  await waitForScreenReady(page);
  const search = page.getByPlaceholder('Search saved places');
  await search.fill('zzzz-no-results-zzzz');
  await waitForScreenReady(page, { animationMs: 800 });
  await capture(page, outDir, '19-empty-saved-search.png');
}

async function captureViewport(browser, viewport) {
  const outDir = join(OUT_ROOT, viewport.label);
  mkdirSync(outDir, { recursive: true });
  console.log(`\n=== ${viewport.label} ===`);

  // --- Onboarding flow (fresh storage) ---
  {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await clearStorage(page);

    await page.goto(`${BASE}/splash`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(1900);
    await capture(page, outDir, '01-splash.png');

    await page.goto(`${BASE}/welcome`, { waitUntil: 'domcontentloaded' });
    await waitForScreenReady(page, { animationMs: 1400 });
    await capture(page, outDir, '02-landing.png');

    await captureOnboardingSteps(page, outDir);
    await context.close();
  }

  // --- Post-onboarding app screens ---
  {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await seedStorage(page, persistPayload({}));

    const postOnboarding = [
      { file: '07-home.png', path: '/' },
      { file: '08-explore.png', path: '/explore' },
      { file: '09-venue-detail.png', path: '/venue/venue-1' },
      { file: '10-need-now.png', path: '/need-now' },
      { file: '11-holiday.png', path: '/holiday' },
      { file: '12-packing.png', path: '/packing' },
      { file: '13-car-fit.png', path: '/car-fit' },
      { file: '14-saved.png', path: '/saved' },
      { file: '15-profile.png', path: '/profile' },
      { file: '16-edit-profile.png', path: '/profile/edit' },
    ];

    for (const shot of postOnboarding) {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded' });
      await waitForScreenReady(page);
      await capture(page, outDir, shot.file);
    }

    await captureEmptyStates(page, outDir);
    await context.close();
  }
}

async function ensureServer(baseUrl) {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return null;
  } catch {
    // start local server below
  }

  const port = new URL(baseUrl).port || '4173';
  console.log(`Starting static server on port ${port}…`);
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

mkdirSync(OUT_ROOT, { recursive: true });

if (!process.argv[2]) {
  const { existsSync } = await import('node:fs');
  if (!existsSync(join(process.cwd(), 'dist'))) {
    console.error('dist/ not found — run npm run build:web first');
    process.exit(1);
  }
}

const serverProcess = await ensureServer(BASE);
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of VIEWPORTS) {
    await captureViewport(browser, viewport);
  }
  console.log(`\nScreenshot pack saved to ${OUT_ROOT}`);
} finally {
  await browser.close();
  if (serverProcess) {
    process.kill(-serverProcess.pid);
  }
}
