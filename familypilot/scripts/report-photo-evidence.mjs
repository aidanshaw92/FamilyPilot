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
  // The card is a preview, so it must NOT carry a photographer's name; Home carries the Google
  // mark instead. Both halves of that are checked, because either one alone is non-compliant.
  const creditOnCard = [...(card?.querySelectorAll('div') ?? [])].find(
    (el) => el.children.length === 0 && (el.textContent ?? '').includes('· Google'),
  );
  // React Native's Image renders on web as a div with a background image, not an <img>, so the
  // asset form is detected by that rather than by tag name.
  const mark = document.querySelector('[aria-label="Google Maps"]');
  const markBackground = mark ? getComputedStyle(mark).backgroundImage : 'none';
  const markIsAsset = Boolean(mark) && markBackground !== 'none' && markBackground !== '';
  const markText = [...document.querySelectorAll('div')].find(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim() === 'Google Maps',
  );
  return {
    activeVenue: card?.getAttribute('aria-label')?.replace(/, see more$/, '') ?? null,
    layers: [describe(layers[0], 'back'), describe(layers[1], 'next'), describe(layers[2], 'active')],
    creditOnCard: creditOnCard?.textContent ?? null,
    googleMark: markIsAsset
      ? { kind: 'official asset', src: markBackground.replace(/^url\("?|"?\)$/g, '') }
      : mark?.tagName === 'IMG'
        ? { kind: 'official asset', src: mark.getAttribute('src') }
        : markText || mark
          ? { kind: 'wordmark text', src: null }
          : null,
  };
});

console.log('\n=== Photo evidence ===');
console.log('active venue   :', report.activeVenue);
console.log('credit on card :', report.creditOnCard ?? '(none — correct for a preview)');
console.log('google mark    :', report.googleMark ? `${report.googleMark.kind} ${report.googleMark.src ?? ''}` : '(missing)');
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

// Acceptance: the active card shows a real photograph, the card stays clean of a photographer's
// name, and Home carries the Google mark. The rear strips should carry photographs too, but a deck
// near its end legitimately has fewer than three layers.
const active = report.layers[2];
const checks = [
  ['active card shows a decoded photograph', active.naturalWidth > 1],
  ['preview carries no photographer credit', report.creditOnCard === null],
  ['Home carries the Google Maps attribution', report.googleMark !== null],
];
console.log('');
checks.forEach(([name, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`));
const ok = checks.every(([, passed]) => passed);
await browser.close();
process.exit(ok ? 0 : 1);
