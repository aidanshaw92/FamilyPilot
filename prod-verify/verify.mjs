// One-off, read-only visit to the production site after the map-compliance merge (#207). Only GET requests: it loads pages, as a parent would.
// 1. Is the new code deployed? Look for #207's marker strings in the production JavaScript bundle.
// 2. Does Meet halfway work in list mode with the real stored places? Open it in a phone-sized browser, no request interception.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://family-pilot-seven.vercel.app';
const result = { base: BASE, at: new Date().toISOString() };
const say = (k, v) => { result[k] = v; console.log(`RESULT ${k}: ${JSON.stringify(v)}`); };

// ---- 1. the deployed bundle
const html = await (await fetch(BASE + '/', { headers: { 'user-agent': 'FamilyPilot-prod-verify/1.0' } })).text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
say('scripts', scripts);
const home = await fetch(BASE + '/');
say('headers', Object.fromEntries(['x-vercel-id', 'x-vercel-cache', 'age', 'date', 'etag', 'last-modified'].map((h) => [h, home.headers.get(h)])));
let marker = { halfwayMapOff: 0, mapOffMessage: 0, bundleBytes: 0 };
for (const s of scripts) {
  const js = await (await fetch(new URL(s, BASE))).text();
  marker.bundleBytes += js.length;
  marker.halfwayMapOff += (js.match(/halfway-map-off/g) ?? []).length;
  marker.mapOffMessage += (js.match(/The map is switched off for now\. Every place is in this list/g) ?? []).length;
}
say('bundleMarkers', marker);

// ---- 1b. What the live between endpoint serves (the public GET the app itself makes; a database read, no Google call)
{
  const u = `${BASE}/api/places/search?intent=between&aLat=51.556&aLng=-0.178&bLat=51.545&bLng=-0.06`;
  const r = await fetch(u, { headers: { 'user-agent': 'FamilyPilot-prod-verify/1.0' } });
  let body = null; try { body = await r.json(); } catch { /* not json */ }
  const places = body?.places ?? [];
  const providers = {}; for (const p of places) providers[p.provider] = (providers[p.provider] ?? 0) + 1;
  say('betweenEndpoint', { status: r.status, places: places.length, providers, googleCalls: body?.googleCalls, considered: body?.considered, keys: body ? Object.keys(body) : null });
}
if (process.env.SKIP_BROWSER === '1') { console.log('DONE'); process.exit(0); }

// ---- 2. Meet halfway in a real browser
const PROFILE = {
  id: 'family-pv', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
  ],
  homeLocation: 'NW3', homeLatitude: 51.556, homeLongitude: -0.178, budgetTier: 'moderate', completionPercent: 90, vehicle: null,
  pushchair: null, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [],
};
const KEVIN = { id: 'guest-k', label: 'Kevin’s family', area: 'E8', latitude: 51.545, longitude: -0.06, ages: [2], pushchair: false, required: [], routines: [] };
const PLANNING = JSON.stringify({ state: { families: [KEVIN], options: { date: '2026-10-17', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [], planningWith: null }, version: 1 });
const FAMILY = JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
const page = await context.newPage();
const googleRequests = []; const apiCalls = []; const errors = [];
page.on('request', (r) => { if (/googleapis|maps\.google|google\.com\/maps|gstatic/i.test(r.url())) googleRequests.push(r.url()); });
page.on('response', async (r) => {
  if (/\/api\//.test(r.url())) {
    let places = null;
    if (/intent=between/.test(r.url())) { try { const j = await r.json(); places = (j.places ?? []).map((p) => p.provider); } catch { /* not json */ } }
    apiCalls.push({ path: new URL(r.url()).pathname, status: r.status(), providers: places ? Object.fromEntries([...new Set(places)].map((p) => [p, places.filter((x) => x === p).length])) : undefined });
  }
});
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.setFixedTime(new Date('2026-10-17T07:00:00'));
await page.addInitScript(({ p, f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); localStorage.setItem('familypilot-planning-v1', p); }, { p: PLANNING, f: FAMILY });
await page.goto(`${BASE}/halfway`, { waitUntil: 'networkidle', timeout: 60000 });
const settled = await Promise.race([
  page.getByTestId('halfway-list').first().waitFor({ timeout: 45000 }).then(() => 'list'),
  page.getByTestId('halfway-sheet-collapsed').first().waitFor({ timeout: 45000 }).then(() => 'map'),
]).catch(() => 'neither');
await page.waitForTimeout(1500);
const count = (id) => page.getByTestId(id).count();
const text = await page.evaluate(() => document.body.innerText);
say('meetHalfway', {
  url: page.url().replace(BASE, ''),
  settled,
  mapDrawn: await count('halfway-map'),
  toggle: await count('halfway-toggle'),
  mapOffNote: await count('halfway-map-off'),
  cards: await count('halfway-option'),
  planButtons: await count('halfway-plan'),
  googleCreditShown: /Google Maps/.test(text),
  copyMentionsPins: /numbered pin|on the map/i.test(text),
  googleRequests,
  apiCalls,
  errors,
  firstLines: text.split('\n').filter(Boolean).slice(0, 12),
});
if (settled === 'list') {
  await page.getByTestId('halfway-option-head').first().click();
  await page.waitForTimeout(2500);
  say('tapFirstCard', { url: page.url().replace(BASE, '') });
}
await browser.close();
console.log('DONE');
