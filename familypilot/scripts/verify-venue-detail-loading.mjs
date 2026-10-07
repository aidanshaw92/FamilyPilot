/**
 * Venue Detail while it loads, in a real browser, against the local fixture (zero spend: every provider host is aborted
 * and fails the run).
 *
 * The real-device recording: tapping a card opened a mostly blank skeleton for several seconds, although the card the
 * parent had just tapped already showed the place's name, photograph, fit and travel time. This taps the front card on
 * Home with the slow responses that produce that (the detail request, the weather and the parent-feedback read held
 * back) and samples the venue screen every 50 ms:
 *
 *   firstContentMs  from the tap to the venue's NAME on the venue screen: the first moment the parent sees the place they chose
 *   fullContentMs   from the tap to the authoritative screen (the "Create a plan" action, drawn only from the full detail)
 *   blankMs         time on the venue screen with neither a name nor anything but skeleton blocks
 *
 * It also checks what must NOT happen while the screen is still waiting for the full detail: no "Create a plan" and no
 * "More about this place" drawn from the card's partial data, a visible "getting the details" marker instead, and that
 * the marker is gone once the full detail arrives (it replaces what was shown rather than being merged into it).
 *
 * Latencies are SIMULATED. They model a slow connection; they are not production measurements, which are not available
 * from the sandbox. The numbers show what the change does to waiting time for a given network, not what the network is.
 *
 * usage: node scripts/verify-venue-detail-loading.mjs [baseUrl] [--report out.json] [--width 393] [--expect-legacy]
 *   --expect-legacy  measure only (the BEFORE numbers, against a build of main); never fails on findings.
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4173';
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const REPORT = flag('--report');
const WIDTH = Number(flag('--width') ?? 393);
const LEGACY = args.includes('--expect-legacy');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov)\.[a-z.]+$|overpass/i;

const seed = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan', familyName: 'Shaw',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
        { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3 },
        { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-08-01', age: 0, ageMonths: 2 },
      ],
      homeLocation: 'Bushey', homeLatitude: 51.643, homeLongitude: -0.36,
      budgetTier: 'moderate', maxDriveMinutes: 60, completionPercent: 80,
      memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
};

// Simulated networks for the venue screen's requests: [detail, weather, parent feedback].
const NETWORKS = [
  { name: 'fast', detail: 150, weather: 150, feedback: 150 },
  { name: 'slow', detail: 1500, weather: 1200, feedback: 1500 },
  { name: 'very slow', detail: 3500, weather: 3000, feedback: 4000 },
];

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const failures = [];
const results = [];
const check = (ok, message) => { if (!ok) failures.push(message); return ok; };

async function run(network) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: Math.round(WIDTH * 852 / 393) }, deviceScaleFactor: 1 });
  let slowOn = false;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    const wait = !slowOn ? 0
      : url.pathname === '/api/places/detail' ? network.detail
      : url.pathname === '/api/context/weather' ? network.weather
      : url.pathname === '/api/planning/feedback' ? network.feedback
      : 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return route.continue().catch(() => {});
  });
  await context.addInitScript((s) => {
    if (!window.localStorage.getItem('familypilot-family-v1')) window.localStorage.setItem('familypilot-family-v1', JSON.stringify(s));
  }, seed);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const card = page.locator('[role="button"][aria-label$=", see more"]').first();
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const label = await card.getAttribute('aria-label');
  const name = label.replace(/, see more$/, '');

  slowOn = true;
  const started = Date.now();
  await card.click();
  const samples = [];
  while (Date.now() - started < network.detail + network.feedback + 3000) {
    const s = await page.evaluate((venueName) => {
      const text = (id) => document.querySelector(`[data-testid="${id}"]`);
      const onVenue = location.pathname.startsWith('/venue/');
      const nameEl = text('venue-name');
      return {
        onVenue,
        name: Boolean(nameEl && nameEl.textContent.includes(venueName)),
        plan: Boolean(text('venue-create-plan')),
        save: Boolean(document.querySelector('[aria-label="Save place"], [aria-label="Remove from saved"]')),
        more: Boolean(text('venue-more-toggle')),
        pending: Boolean(text('venue-detail-pending')),
        skeletons: document.querySelectorAll('[role="progressbar"]').length,
      };
    }, name).catch(() => ({ onVenue: false }));
    samples.push({ t: Date.now() - started, ...s });
    await page.waitForTimeout(50);
    if (samples.at(-1).plan && samples.length > 5) break;
  }
  const first = samples.find((s) => s.name);
  const full = samples.find((s) => s.plan);
  const beforeFull = samples.filter((s) => !s.plan && s.t < (full?.t ?? Infinity));
  const result = {
    network: network.name, detailMs: network.detail, name,
    firstContentMs: first?.t ?? null,
    fullContentMs: full?.t ?? null,
    blankMs: beforeFull.filter((s) => s.onVenue && !s.name).length * 50,
    // While waiting for the full detail:
    // While the screen is still the CARD (the pending marker is up), nothing evidence-backed or actionable may be drawn.
    planShownWhilePending: samples.some((s) => s.pending && s.plan),
    moreShownWhilePending: samples.some((s) => s.pending && s.more),
    pendingMarkerSeen: samples.some((s) => s.pending),
    pendingGoneWhenFull: full ? !full.pending : null,
  };
  results.push(result);
  await context.close();
  return result;
}

for (const network of NETWORKS) {
  const r = await run(network);
  console.log(`${r.network.padEnd(10)} detail ${String(r.detailMs).padStart(4)}ms  first content ${String(r.firstContentMs).padStart(5)}ms  full content ${String(r.fullContentMs).padStart(5)}ms  blank ${String(r.blankMs).padStart(5)}ms`);
  if (!LEGACY && r.detailMs >= 1500) {
    check(r.firstContentMs !== null && r.firstContentMs < 600, `${r.network}: the venue's name should be on screen within 600ms of the tap, was ${r.firstContentMs}`);
    check(r.fullContentMs !== null && r.fullContentMs >= r.detailMs * 0.8, `${r.network}: the authoritative screen cannot arrive before the detail does`);
    check(r.pendingMarkerSeen, `${r.network}: the screen should say it is still getting the details while it waits`);
    check(!r.planShownWhilePending, `${r.network}: "Create a plan" must not be drawn from the card's partial data`);
    check(!r.moreShownWhilePending, `${r.network}: "More about this place" must not be drawn before the full detail`);
    check(r.pendingGoneWhenFull === true, `${r.network}: the placeholder must be gone when the full detail arrives`);
  }
}
check(blocked.length === 0, `provider hosts were requested: ${[...new Set(blocked)].join(', ')}`);

if (REPORT) writeFileSync(REPORT, JSON.stringify({ width: WIDTH, results, failures }, null, 2));
await browser.close();
if (failures.length) { console.error('\nFAIL\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(LEGACY ? 0 : 1); }
console.log(LEGACY ? '\nmeasured (legacy mode: no assertions)' : '\nall checks passed');
