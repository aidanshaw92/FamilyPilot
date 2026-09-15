/**
 * Reports what the Home deck actually loaded: the venue on each card, the photo URL it requested,
 * the status that came back, and where that URL finally resolved to.
 *
 * This is the check that separates "the photo path is wired correctly" from "a real photograph is
 * on screen". The sandbox this branch was built in can only ever show the former, so the
 * distinction is worth printing rather than eyeballing.
 *
 * Usage: node scripts/report-photo-evidence.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = {
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
};

const BASE = process.argv[2] ?? 'http://localhost:4173';

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo',
      parentName: 'Aidan Shaw',
      members: [{ id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 }],
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

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
const page = await context.newPage();

const photoResponses = [];
page.on('response', (response) => {
  if (!response.url().includes('/api/places/photo')) return;
  photoResponses.push({ url: response.url(), status: response.status() });
});

await page.addInitScript((seed) => {
  window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed));
}, FAMILY_STATE);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[role="button"][aria-label$=", see more"]', { timeout: 60000 });
await page.waitForTimeout(4000);

const report = await page.evaluate(() => {
  const card = document.querySelector('[role="button"][aria-label$=", see more"]');
  const deck = card?.parentElement?.parentElement ?? null;
  const layers = deck ? [...deck.children] : [];
  const describe = (layer, role) => {
    const img = layer?.querySelector('img');
    return {
      role,
      hasImage: Boolean(img),
      src: img?.currentSrc || img?.src || null,
      // A decoded image with real dimensions is a photograph that arrived, not a broken request.
      naturalWidth: img?.naturalWidth ?? 0,
      naturalHeight: img?.naturalHeight ?? 0,
      complete: img?.complete ?? false,
      box: layer
        ? [Math.round(layer.getBoundingClientRect().width), Math.round(layer.getBoundingClientRect().height)]
        : null,
    };
  };
  const credit = [...(card?.querySelectorAll('div') ?? [])].find(
    (el) => el.children.length === 0 && (el.textContent ?? '').includes('· Google'),
  );
  return {
    activeVenue: card?.getAttribute('aria-label')?.replace(/, see more$/, '') ?? null,
    layers: [describe(layers[0], 'back'), describe(layers[1], 'next'), describe(layers[2], 'active')],
    attribution: credit?.textContent ?? null,
  };
});

console.log('\n=== Photo evidence ===');
console.log('active venue:', report.activeVenue);
console.log('attribution :', report.attribution ?? '(none rendered)');
console.log('\nlayers:');
for (const layer of report.layers) {
  console.log(
    `  ${layer.role.padEnd(7)} image=${layer.hasImage} decoded=${layer.naturalWidth}x${layer.naturalHeight} box=${layer.box?.join('x')}`,
  );
  if (layer.src) console.log(`          ${layer.src}`);
}

console.log('\nphoto responses:');
if (photoResponses.length === 0) console.log('  (none — the deck fell back to the category gradient)');
photoResponses.forEach((r) => console.log(`  ${r.status}  ${r.url.slice(0, 120)}`));

const decoded = report.layers.filter((l) => l.naturalWidth > 1 && l.naturalHeight > 1);
const realPhotos = decoded.length;
console.log(`\n${realPhotos}/3 layers are showing a decoded photograph`);

// The active card carrying a real photograph is the acceptance condition; the rear strips should
// carry one too, but a deck near its end legitimately has fewer than three layers.
const active = report.layers[2];
const ok = active.naturalWidth > 1 && report.attribution;
console.log(ok ? 'PASS — real photography on the active card, with attribution' : 'FAIL — no real photograph or no attribution on the active card');
await browser.close();
process.exit(ok ? 0 : 1);
