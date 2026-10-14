/**
 * PREVIEW ONLY. How long a parent waits for Explore's first place card on a mobile-class profile, INCLUDING the app itself: CPU slowed 4x, every request
 * (the app, its fonts and the catalogue) over a 1.6 Mbps, 150 ms round-trip link, the server compressing as the host does. A COLD visit (nothing cached) and
 * a WARM one (the browser's cache from the cold visit). A simulation in a desktop browser, not a phone: read it as a comparison between builds.
 *
 *   node scripts/measure-boot.mjs http://localhost:4180 [--runs 3] [--label text]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args[0] ?? 'http://localhost:4180';
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const RUNS = Number(opt('--runs', 3)); const LABEL = opt('--label', '');
const PROFILE = { id: 'fam-perf', parentName: 'Perf Test', members: [
  { id: 'p1', name: 'Parent One', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 },
  { id: 'c1', name: 'Child A', role: 'child', dateOfBirth: '2022-04-10', dobKnown: true, age: 4 } ],
  homeLocation: 'NW1 7AA', homeLatitude: 51.539, homeLongitude: -0.1426, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
const PLANNING = { state: { families: [], options: { date: '2026-10-14', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 };
const FAMILY = { state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });

async function visit(ctx) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6e6 / 8), uploadThroughput: (0.75e6 / 8) });
  let bytes = 0; let reqs = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs += 1; });
  const t0 = Date.now();
  await page.goto(`${BASE}/explore`, { waitUntil: 'commit' });
  await page.locator('[data-testid^="explore-card-"]').first().waitFor({ timeout: 240000 });
  const ms = Date.now() - t0;
  const fcp = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  await page.close();
  return { ms, fcp, kb: Math.round(bytes / 1024), reqs };
}

const cold = []; const warm = [];
for (let i = 0; i < RUNS; i += 1) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/London' });
  await ctx.addInitScript(({ p, f }) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); } }, { p: JSON.stringify(PLANNING), f: JSON.stringify(FAMILY) });
  cold.push(await visit(ctx));
  warm.push(await visit(ctx));
  await ctx.close();
}
await browser.close();
const m = (rows, k) => median(rows.map((r) => r[k]));
console.log('BOOT ' + JSON.stringify({ label: LABEL, runs: RUNS, cold: { firstCardMs: m(cold, 'ms'), fcpMs: m(cold, 'fcp'), kb: m(cold, 'kb'), requests: m(cold, 'reqs') }, warm: { firstCardMs: m(warm, 'ms'), fcpMs: m(warm, 'fcp'), kb: m(warm, 'kb'), requests: m(warm, 'reqs') } }));
