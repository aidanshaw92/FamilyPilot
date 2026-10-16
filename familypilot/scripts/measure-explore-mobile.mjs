/**
 * How Explore loads and filters on a MOBILE-CLASS profile, at different catalogue sizes. A measurement, not a pass/fail check.
 *
 * Profile: a 393 x 852 phone viewport, CPU slowed 4x (Chrome DevTools' mobile preset), and the stored-catalogue request delayed as a 1.6 Mbps, 150 ms
 * round-trip connection would (gzip size / bandwidth + latency; the app bundle itself is not delayed, because a parent loads it once and the question
 * here is what the CATALOGUE costs). It is a simulation in a desktop browser, not a phone: read it as a comparison between sizes and between
 * the two ways of loading, and confirm on the iPhone.
 *
 * Reported per run, median of --runs:
 *   transferKB     bytes the catalogue requests carried (raw and gzip) and how many requests
 *   firstCardMs    navigation to the first place card on screen
 *   longTaskMs     total main-thread time in tasks over 50 ms (the app being unresponsive), and the longest one
 *   cards, nodes   place cards and DOM elements on the page after load
 *   heapMB         JS heap after load (Chromium only)
 *   categoryMs, radiusMs, searchMs   from a tap (or typing) until Explore's count line changes
 *
 *   node scripts/measure-explore-mobile.mjs --dist <exported dir> --places <catalogue.json> [--label text] [--runs 3] [--cpu 4]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const DIST = resolve(opt('--dist', 'dist'));
const PLACES = opt('--places');
const LABEL = opt('--label', '');
const RUNS = Number(opt('--runs', 3));
const CPU = Number(opt('--cpu', 4));
const PORT = Number(opt('--port', 4190 + Math.floor(Math.random() * 500)));
if (!PLACES) { console.error('--places <catalogue.json> is required'); process.exit(2); }

const server = spawn('node', ['scripts/serve-places-fixture.mjs', String(PORT), DIST], { env: { ...process.env, FIXTURE_PLACES_FILE: resolve(PLACES) }, stdio: 'ignore' });
const BASE = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${BASE}/api/places/status`)).status < 500) break; } catch { /* not up yet */ } await sleep(250); }

const PROFILE = {
  id: 'fam-perf', parentName: 'Perf Test', members: [
    { id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
    { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 } ],
  homeLocation: 'NW1 7AA', homeLatitude: 51.539, homeLongitude: -0.1426, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const PLANNING = { state: { families: [], options: { date: '2026-10-14', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };
const FAMILY = { state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 };

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function once() {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const requests = [];
  await page.route(/\/api\/places\/search/, async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    const gz = gzipSync(body).length;
    const delay = 150 + (gz * 8) / 1.6e6 * 1000;
    requests.push({ url: new URL(route.request().url()).search.slice(0, 120), raw: body.length, gz, delay: Math.round(delay) });
    await sleep(delay);
    await route.fulfill({ response, body });
  });
  await page.clock.setFixedTime(new Date('2026-10-14T11:00:00'));
  await page.addInitScript(({ p, f }) => {
    if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }
    window.__lt = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  }, { p: JSON.stringify(PLANNING), f: JSON.stringify(FAMILY) });

  const t0 = Date.now();
  await page.goto(`${BASE}/explore`, { waitUntil: 'commit' });
  await page.locator('[data-testid^="explore-card-"]').first().waitFor({ timeout: 180000 });
  const firstCardMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    lt: window.__lt, nodes: document.getElementsByTagName('*').length,
    heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    cards: document.querySelectorAll('[data-testid^="explore-card-"]').length,
    count: document.querySelector('[data-testid="explore-count"]')?.innerText ?? '',
  }));

  const change = async (act) => {
    const before = await page.locator('[data-testid="explore-count"]').innerText().catch(() => '');
    const s = Date.now();
    await act();
    await page.waitForFunction((b) => (document.querySelector('[data-testid="explore-count"]')?.innerText ?? '') !== b, before, { timeout: 20000 }).catch(() => {});
    return Date.now() - s;
  };
  const categoryIds = await page.locator('[data-testid^="explore-category-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const chip = categoryIds.find((id) => id !== 'explore-category-all') ?? categoryIds[0];
  const categoryMs = chip ? await change(() => page.locator(`[data-testid="${chip}"]`).click()) : null;
  const radiusMs = await change(async () => {
    await page.locator('[data-testid="explore-distance-chip"]').click({ timeout: 8000 }).catch(() => {});
    await page.locator('[data-testid="explore-radius-10"]').click({ timeout: 8000 }).catch(() => {});
  });
  const box = page.getByPlaceholder(/search places/i).first();
  const searchMs = (await box.count()) ? await change(() => box.fill('park')) : null;
  await ctx.close();
  return { firstCardMs, longTaskMs: Math.round(after.lt.reduce((a, b) => a + b, 0)), longest: Math.round(Math.max(0, ...after.lt)), nodes: after.nodes, heapMB: after.heap && Math.round(after.heap), cards: after.cards, count: after.count.replace(/\s+/g, ' ').slice(0, 70), categoryMs, radiusMs, searchMs, requests };
}

const runs = [];
for (let i = 0; i < RUNS; i += 1) runs.push(await once());
await browser.close();
server.kill();
const m = (k) => median(runs.map((r) => r[k]).filter((v) => v !== null && v !== undefined));
const req = runs[0].requests;
const summary = {
  label: LABEL, places: PLACES.split('/').pop(), runs: RUNS, cpuSlowdown: CPU,
  requests: req.length, transferRawKB: Math.round(req.reduce((a, r) => a + r.raw, 0) / 1024), transferGzipKB: Math.round(req.reduce((a, r) => a + r.gz, 0) / 1024),
  firstCardMs: m('firstCardMs'), longTaskMs: m('longTaskMs'), longestTaskMs: m('longest'), cards: m('cards'), nodes: m('nodes'), heapMB: m('heapMB'),
  categoryMs: m('categoryMs'), radiusMs: m('radiusMs'), searchMs: m('searchMs'), countLine: runs[0].count,
};
console.log('SUMMARY ' + JSON.stringify(summary));
