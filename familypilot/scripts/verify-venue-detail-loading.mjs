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
  // One slow dependency at a time, with a fast detail request: does anything but the detail hold the authoritative screen?
  { name: 'feedback 4s only', detail: 150, weather: 150, feedback: 4000, isolate: true },
  { name: 'weather 9s only', detail: 150, weather: 9000, feedback: 150, isolate: true },
];

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const failures = [];
const results = [];
const check = (ok, message) => { if (!ok) failures.push(message); return ok; };

async function sampleOnce(page, name) {
  return page.evaluate((venueName) => {
    const text = (id) => document.querySelector(`[data-testid="${id}"]`);
    const nameEl = text('venue-name');
    return {
      onVenue: location.pathname.startsWith('/venue/'),
      name: Boolean(nameEl && nameEl.textContent.includes(venueName)),
      nameTop: nameEl ? Math.round(nameEl.getBoundingClientRect().top) : null,
      plan: Boolean(text('venue-create-plan')),
      more: Boolean(text('venue-more-toggle')),
      pending: Boolean(text('venue-detail-pending')),
      error: document.body.innerText.includes('Could not load this place'),
    };
  }, name).catch(() => ({ onVenue: false }));
}

/**
 * mode 'tap'       tap the front card on Home (the card is handed over)
 * mode 'deeplink'  open the venue's own address in a fresh page (nothing is handed over)
 * mode 'reload'    tap the card, then reload the venue screen while it waits
 * mode 'fail'      tap the card with the detail request failing
 */
async function run(network, mode = 'tap') {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: Math.round(WIDTH * 852 / 393) }, deviceScaleFactor: 1 });
  let slowOn = false;
  const requests = {};
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    if (slowOn && url.pathname.startsWith('/api/')) requests[url.pathname] = (requests[url.pathname] ?? 0) + 1;
    if (slowOn && mode === 'fail' && url.pathname === '/api/places/detail') return route.abort();
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
  let page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const card = page.locator('[role="button"][aria-label$=", see more"]').first();
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const label = await card.getAttribute('aria-label');
  const name = label.replace(/, see more$/, '');

  let started;
  if (mode === 'deeplink') {
    // Find the venue's own address with a quick tap, then open that address cold, with the slow network on.
    await card.click();
    await page.waitForURL(/\/venue\//, { timeout: 15000 });
    const path = new URL(page.url()).pathname;
    await page.close();
    page = await context.newPage();
    slowOn = true;
    started = Date.now();
    await page.goto(BASE + path, { waitUntil: 'commit' });
  } else {
    slowOn = true;
    started = Date.now();
    await card.click();
    if (mode === 'reload') {
      await page.waitForTimeout(500);
      started = Date.now();
      await page.reload({ waitUntil: 'commit' });
    }
  }
  const limit = Math.max(network.detail, network.weather, network.feedback) + 3500;
  const samples = [];
  while (Date.now() - started < limit) {
    samples.push({ t: Date.now() - started, ...(await sampleOnce(page, name)) });
    await page.waitForTimeout(50);
    const last = samples.at(-1);
    if (mode === 'fail' ? last.error : last.plan && samples.length > 5) break;
  }
  // Let any request that is still settling land before the count is read.
  await page.waitForTimeout(400);
  const first = samples.find((x) => x.name);
  const full = samples.find((x) => x.plan);
  const err = samples.find((x) => x.error);
  const beforeFull = samples.filter((x) => !x.plan && x.t < (full?.t ?? Infinity));
  const result = {
    network: network.name, mode, detailMs: network.detail, name,
    firstContentMs: first?.t ?? null,
    fullContentMs: full?.t ?? null,
    errorAtMs: err?.t ?? null,
    blankMs: beforeFull.filter((x) => x.onVenue && !x.name).length * 50,
    // While the screen is still the CARD (the pending marker is up), nothing evidence-backed or actionable may be drawn.
    planShownWhilePending: samples.some((x) => x.pending && x.plan),
    moreShownWhilePending: samples.some((x) => x.pending && x.more),
    pendingMarkerSeen: samples.some((x) => x.pending),
    pendingGoneWhenFull: full ? !full.pending : null,
    // A failed load: once the error shows, the card must be gone and nothing evidence-backed ever drawn.
    cardStillShownAtError: err ? Boolean(err.name || err.pending) : null,
    anythingDrawnAfterFailure: mode === 'fail' ? samples.some((x) => x.plan || x.more) : null,
    // The name must not move when the full detail replaces the card (nothing jumps under the parent's thumb).
    // Measured between the last card sample and the first full sample, so the screen's own 200 ms entrance fade (which moves
    // the name a few pixels as it appears) is not mistaken for the replacement moving it.
    nameShiftPx: (() => {
      const lastCard = [...samples].reverse().find((x) => x.pending && x.nameTop !== null);
      const firstFull = samples.find((x) => x.plan && x.nameTop !== null);
      return lastCard && firstFull ? Math.abs(firstFull.nameTop - lastCard.nameTop) : null;
    })(),
    requests,
  };
  results.push(result);
  await context.close();
  return result;
}

const line = (r) => `${r.network.padEnd(18)} ${r.mode.padEnd(8)} detail ${String(r.detailMs).padStart(4)}ms  first content ${String(r.firstContentMs ?? '-').padStart(5)}ms  full content ${String(r.fullContentMs ?? '-').padStart(5)}ms  blank ${String(r.blankMs).padStart(5)}ms`;

for (const network of NETWORKS) {
  const r = await run(network);
  console.log(line(r));
  if (!LEGACY && !network.isolate && r.detailMs >= 1500) {
    check(r.firstContentMs !== null && r.firstContentMs < 600, `${r.network}: the venue's name should be on screen within 600ms of the tap, was ${r.firstContentMs}`);
    check(r.fullContentMs !== null && r.fullContentMs >= r.detailMs * 0.8, `${r.network}: the authoritative screen cannot arrive before the detail does`);
    check(r.pendingMarkerSeen, `${r.network}: the screen should say it is still getting the details while it waits`);
    check(!r.planShownWhilePending, `${r.network}: "Create a plan" must not be drawn from the card's partial data`);
    check(!r.moreShownWhilePending, `${r.network}: "More about this place" must not be drawn before the full detail`);
    check(r.pendingGoneWhenFull === true, `${r.network}: the placeholder must be gone when the full detail arrives`);
  }
  if (!LEGACY && !network.isolate && r.detailMs >= 1500) check(r.nameShiftPx !== null && r.nameShiftPx <= 2, `${r.network}: the name moved ${r.nameShiftPx}px when the full detail arrived`);
  // No provider call, and no endpoint asked for more than once by the tap (a placeholder must not double a request).
  const dup = Object.entries(r.requests).filter(([path, n]) => n > 1 && !/photo/.test(path));
  if (!LEGACY) check(dup.length === 0, `${r.network}: an endpoint was requested more than once after the tap: ${JSON.stringify(dup)}`);
}

// Deep links and reloads have nothing handed over: they show the plain loading screen, never the card or a half-drawn page.
{
  const slow = NETWORKS[1];
  for (const mode of ['deeplink', 'reload']) {
    const r = await run(slow, mode);
    console.log(line(r));
    if (!LEGACY) {
      check(r.pendingMarkerSeen === false, `${mode}: nothing was handed over, so no card placeholder may appear`);
      check(r.fullContentMs !== null, `${mode}: the full screen should load`);
      check(r.firstContentMs !== null && r.fullContentMs !== null && r.firstContentMs >= r.fullContentMs - 100, `${mode}: the name must not appear before the full detail (it did at ${r.firstContentMs}ms, full at ${r.fullContentMs}ms)`);
    }
  }
  // A failed request: the card may wait while it retries, then it must give way to the error and nothing else.
  const r = await run(slow, 'fail');
  console.log(`${r.network.padEnd(18)} fail     error at ${r.errorAtMs ?? '-'}ms  card still shown at error: ${r.cardStillShownAtError}  anything evidence-backed drawn: ${r.anythingDrawnAfterFailure}`);
  if (!LEGACY) {
    check(r.errorAtMs !== null, 'fail: a failed detail request must end in the error screen');
    check(r.cardStillShownAtError === false, 'fail: the card must not stay on screen once the request has failed');
    check(r.anythingDrawnAfterFailure === false, 'fail: nothing evidence-backed may be drawn from a failed request');
  }
}
check(blocked.length === 0, `provider hosts were requested: ${[...new Set(blocked)].join(', ')}`);

if (REPORT) writeFileSync(REPORT, JSON.stringify({ width: WIDTH, results, failures }, null, 2));
await browser.close();
if (failures.length) { console.error('\nFAIL\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(LEGACY ? 0 : 1); }
console.log(LEGACY ? '\nmeasured (legacy mode: no assertions)' : '\nall checks passed');
