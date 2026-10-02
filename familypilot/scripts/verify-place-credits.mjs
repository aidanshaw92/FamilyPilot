/**
 * Proves, in a browser, that every surface showing place data credits the holders it actually has.
 *
 * THE DEFECT THIS LOCKS DOWN. Home rendered the Google Maps mark under any non-empty shortlist, and
 * Explore rendered no credit at all. Production serves two OpenStreetMap museums (Kingston Museum,
 * Chiswick House) alongside 136 Google rows, so Home was crediting Google for OpenStreetMap's data
 * and Explore was crediting nobody for either. An earlier fix made it worse by defaulting an absent
 * provider to Google on the grounds that Google is the majority source; a majority is not a
 * provenance record, and crediting the wrong holder is the exact failure attribution prevents.
 *
 * So this runs the list surfaces TWICE against two fixture payloads:
 *   - mixed   (FIXTURE_SEARCH_INCLUDES_OSM=1): ten Google venues plus one OpenStreetMap venue.
 *             Both credits must appear, each once.
 *   - google  (default payload): ten Google venues, no OpenStreetMap row.
 *             Google's mark must appear and OpenStreetMap's credit must NOT -- otherwise the credit
 *             line is decoration rather than a provenance record.
 *
 * It starts its own fixture server on its own port so the shared one the rest of the suite uses
 * keeps the locked Home composition. ZERO Google Places and ZERO Overpass requests: every place
 * comes from the synthetic fixture, and the run asserts that no request left for either provider.
 *
 * Usage: node scripts/verify-place-credits.mjs [distDir] [port]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const PORT = Number(process.argv[3] ?? 4174);
const BASE = `http://127.0.0.1:${PORT}`;
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const FAMILY_KEY = 'familypilot-family-v1';

const PROFILE = {
  id: 'family-credits',
  parentName: 'Sarah',
  members: [
    { id: 'p1', name: 'Sarah', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2021-06-10', age: 4 },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  homeLatitude: 51.643,
  homeLongitude: -0.36,
  budgetTier: 'moderate',
  maxDriveMinutes: 90,
  completionPercent: 80,
  vehicle: 'Tesla Model Y',
  pushchair: 'Bugaboo Butterfly',
  travelCot: null,
  memberships: [],
  routines: [],
  mustHaveFacilities: [],
};

/** Any host that would cost money or lean on public infrastructure. Must stay at zero. */
const FORBIDDEN = [
  /googleapis\.com/i,
  /maps\.google/i,
  /places\.googleapis/i,
  /overpass/i,
  /openstreetmap\.org\/api/i,
];

const findings = [];
function note(area, name, result) {
  findings.push({ area, name, ...result });
  const mark = result.ok ? '[ok]' : '[FAIL]';
  console.log(`  ${mark} ${area}: ${name}${result.message ? ` -- ${result.message}` : ''}`);
}

function startFixture(includeOsm) {
  const child = spawn(process.execPath, ['scripts/serve-places-fixture.mjs', String(PORT), DIST], {
    env: { ...process.env, FIXTURE_SEARCH_INCLUDES_OSM: includeOsm ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[fixture] ${chunk}`));
  return child;
}

async function waitForFixture() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/api/places/search?lat=51.5&lng=-0.1&radiusKm=40&scope=london&intent=explore`);
      if (res.ok) return (await res.json()).places ?? [];
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`fixture never came up on ${BASE}`);
}

const settle = async (page, ms) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};

/** Credits as the parent would read them, from the rendered text and the test ids that back it. */
async function creditsOn(page) {
  const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  // The wordmark renders as text until Google's own asset file is supplied, so match either.
  const google =
    /Google Maps/.test(body) ||
    (await page.getByTestId('place-credits-google').count().catch(() => 0)) > 0;
  const osm = /©\s*OpenStreetMap contributors/.test(body);
  const osmNodes = await page.getByTestId('place-credits-osm').count().catch(() => 0);
  return { google, osm, osmNodes, body };
}

async function runPass({ label, includeOsm }) {
  console.log(`\n=== ${label} payload ===`);
  const fixture = startFixture(includeOsm);
  let browser;
  try {
    const places = await waitForFixture();
    const providers = [...new Set(places.map((place) => place.provider))].sort();
    note(label, 'the fixture payload carries the providers this pass is about', {
      ok: includeOsm ? providers.join(',') === 'google,osm' : providers.join(',') === 'google',
      message: `providers: ${providers.join(', ')} across ${places.length} places`,
    });

    browser = await chromium.launch({
      executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
    });
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });

    const offending = [];
    context.on('request', (request) => {
      const url = request.url();
      if (FORBIDDEN.some((pattern) => pattern.test(url))) offending.push(url);
    });

    const page = await context.newPage();
    // The onboarding flags matter: without them `/` redirects to Welcome and a Home assertion reads
    // the splash screen instead. An earlier run of this script seeded only the profile, reported
    // Home as crediting nobody, and was measuring a screen that shows no places at all.
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      {
        key: FAMILY_KEY,
        value: JSON.stringify({
          state: {
            profile: PROFILE,
            hasCompletedOnboarding: true,
            hasSeenSplash: true,
            profileRevision: 2,
          },
          version: 0,
        }),
      },
    );

    // --- HOME -----------------------------------------------------------------------------------
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3000);
    const home = await creditsOn(page);

    note(label, 'Home credits Google for Google rows', {
      ok: home.google,
      message: home.google ? undefined : 'the Google Maps mark is missing',
    });
    note(label, `Home ${includeOsm ? 'credits' : 'does not credit'} OpenStreetMap`, {
      ok: includeOsm ? home.osm : !home.osm,
      message: includeOsm
        ? home.osm
          ? undefined
          : 'OpenStreetMap supplied a venue in this list and was not credited'
        : home.osm
          ? 'credited OpenStreetMap for a list with no OpenStreetMap row'
          : undefined,
    });
    if (includeOsm) {
      note(label, 'Home names OpenStreetMap once, not once per row', {
        ok: home.osmNodes === 1,
        message: `${home.osmNodes} credit node(s)`,
      });
    }

    // --- EXPLORE --------------------------------------------------------------------------------
    await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3000);
    // The credit sits under the last row, so the list has to be scrolled to the end to read it.
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('*')) {
        if (node.scrollHeight > node.clientHeight + 40) node.scrollTop = node.scrollHeight;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1200);
    const explore = await creditsOn(page);

    note(label, 'Explore credits Google for Google rows', {
      ok: explore.google,
      message: explore.google ? undefined : 'Explore shows Google place content and credits nobody',
    });
    note(label, `Explore ${includeOsm ? 'credits' : 'does not credit'} OpenStreetMap`, {
      ok: includeOsm ? explore.osm : !explore.osm,
      message: includeOsm
        ? explore.osm
          ? undefined
          : 'OpenStreetMap supplied a result and was not credited'
        : explore.osm
          ? 'credited OpenStreetMap for results with no OpenStreetMap row'
          : undefined,
    });

    // --- NOBODY PAID FOR THIS -------------------------------------------------------------------
    note(label, 'made no Google Places or Overpass request', {
      ok: offending.length === 0,
      message: offending.length ? offending.slice(0, 3).join(' ; ') : '0 requests to either provider',
    });

    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    fixture.kill('SIGTERM');
    // The port has to be free before the next pass binds it.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

async function main() {
  if (!existsSync(join(process.cwd(), DIST, 'index.html'))) {
    console.error(`No built bundle at ${DIST}/index.html. Run: npx expo export --platform web`);
    process.exit(1);
  }

  await runPass({ label: 'mixed', includeOsm: true });
  await runPass({ label: 'google-only', includeOsm: false });

  const failed = findings.filter((finding) => !finding.ok);
  console.log(`\n${findings.length - failed.length}/${findings.length} checks passed`);
  if (failed.length) {
    console.log('=== failures:');
    for (const finding of failed) console.log(`  - ${finding.area}: ${finding.name} -- ${finding.message ?? ''}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
