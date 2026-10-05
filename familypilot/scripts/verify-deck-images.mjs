/**
 * Swipes the Home deck through its whole length with real pointer input, sampling every animation frame, and
 * asserts that no card a parent can see is ever drawn without its photograph: no gradient, no skeleton, no blank,
 * and no photograph that disappears and returns.
 *
 * It reads the page, not the code: for every card layer in the deck it looks at its own rectangle and opacity and at
 * whether an <img> inside it has really decoded. A card counts as visible once any part of it is on screen at more
 * than a trace of opacity, and a visible card whose venue has a photograph must have that photograph decoded.
 *
 * Venues the fixture deliberately serves with no photograph are found at rest (their fallback is in the page then)
 * and are excluded, so the check measures the swipe, not the data.
 *
 * Usage: node scripts/verify-deck-images.mjs [baseUrl]
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

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
const page = await context.newPage();
await page.addInitScript((seed) => localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), FAMILY_STATE);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[data-testid="recommendation-deck"]', { timeout: 30000 });
await page.waitForTimeout(2500);

// Probe: runs every animation frame and records problems.
await page.evaluate(() => {
  window.__probe = { frames: 0, problems: [], seenWithPhoto: new Set(), noPhotoAtRest: new Set() };
  const deck = document.querySelector('[data-testid="recommendation-deck"]');
  const layerName = (layer) => {
    // a stable key: the first text in the card (the title) or the img src
    const img = layer.querySelector('img');
    return (img?.getAttribute('src') ?? layer.innerText.slice(0, 30)) || 'unknown';
  };
  const viewW = window.innerWidth;
  const tick = () => {
    window.__probe.frames += 1;
    for (const layer of deck.children) {
      const r = layer.getBoundingClientRect();
      const cs = getComputedStyle(layer);
      const opacity = Number(cs.opacity);
      const visibleW = Math.min(r.right, viewW) - Math.max(r.left, 0);
      if (opacity < 0.05 || visibleW < 12) continue;
      const imgs = [...layer.querySelectorAll('img')];
      const decoded = imgs.some((i) => i.complete && i.naturalWidth > 0 && Number(getComputedStyle(i).opacity) > 0.01);
      const fallback = !!layer.querySelector('[aria-label*="photo not available"]');
      const key = layerName(layer);
      if (fallback) { window.__probe.noPhotoAtRest.add(layer.getAttribute('data-k') ?? key); continue; }
      if (decoded) { window.__probe.seenWithPhoto.add(key); continue; }
      window.__probe.problems.push({ frame: window.__probe.frames, key, opacity, visibleW: Math.round(visibleW), imgs: imgs.length });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const box = await page.locator('[data-testid="recommendation-deck"]').boundingBox();
const y = box.y + 120;
const x = box.x + box.width / 2;

async function swipe(dx, steps = 14, pause = 8) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) { await page.mouse.move(x + (dx * i) / steps, y); await page.waitForTimeout(pause); }
  await page.mouse.up();
}

// forward through the whole deck quickly (the hardest case: images must be ready before cards arrive), then back
for (let i = 0; i < 16; i += 1) { await swipe(-170); await page.waitForTimeout(120); }
for (let i = 0; i < 16; i += 1) { await swipe(170); await page.waitForTimeout(120); }
await page.waitForTimeout(500);

const probe = await page.evaluate(() => ({ frames: window.__probe.frames, problems: window.__probe.problems, withPhoto: window.__probe.seenWithPhoto.size }));
check('the deck was observed through the whole swipe', probe.frames > 200 && probe.withPhoto >= 8, `${probe.frames} frames, ${probe.withPhoto} photographs seen`);
check('no visible card was ever drawn without its photograph', probe.problems.length === 0,
  probe.problems.length ? JSON.stringify(probe.problems.slice(0, 5)) : 'none in any frame');
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
