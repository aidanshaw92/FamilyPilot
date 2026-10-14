// Read-only visit to the production site, as a parent would: GET requests only, no writes, no secrets. Records, for a given moment (LABEL):
//   the deployed entry bundle (so a merge can be matched to a deployment), the HTML's brand shell, cache headers on hashed assets and fonts,
//   and, on a phone-class profile (CPU x4, 1.6 Mbps / 150 ms), time to the first place card in Explore on a first and a repeat visit.
// WAIT_FOR_CHANGE_FROM=<entry bundle name> waits (up to 12 minutes) for the deployed entry bundle to differ from that one, then measures.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://family-pilot-seven.vercel.app';
const LABEL = process.env.LABEL ?? 'check';
const WAIT_FROM = process.env.WAIT_FOR_CHANGE_FROM ?? '';
const say = (k, v) => console.log(`RESULT ${LABEL}.${k}: ${JSON.stringify(v)}`);
const UA = 'FamilyPilot-prod-verify/2.0 (read-only)';

const entryOf = (html) => [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).find((s) => /entry-/.test(s)) ?? null;
async function getHtml() { const r = await fetch(BASE + '/', { headers: { 'user-agent': UA, 'cache-control': 'no-cache' } }); return { text: await r.text(), headers: Object.fromEntries([...r.headers.entries()].filter(([k]) => /^x-vercel-id|^age$|^etag$|^cache-control$|^date$/i.test(k))) }; }

let { text: html, headers } = await getHtml();
if (WAIT_FROM) {
  const until = Date.now() + 12 * 60 * 1000;
  while (entryOf(html) && entryOf(html).includes(WAIT_FROM) && Date.now() < until) { await new Promise((r) => setTimeout(r, 15000)); ({ text: html, headers } = await getHtml()); }
  say('waited', { stillOld: !!(entryOf(html) && entryOf(html).includes(WAIT_FROM)) });
}
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
say('entryBundle', entryOf(html));
say('scripts', scripts);
say('htmlHeaders', headers);
say('html', { bootShell: /id="boot-shell"/.test(html), bootShellAriaHidden: /id="boot-shell"[^>]*aria-hidden="true"/.test(html), bytes: html.length });

// hashed assets and fonts
const entryUrl = entryOf(html) ? new URL(entryOf(html), BASE) : null;
if (entryUrl) {
  const r = await fetch(entryUrl, { headers: { 'user-agent': UA, 'accept-encoding': 'gzip, br' } });
  const body = await r.text();
  say('entryHeaders', { status: r.status, cacheControl: r.headers.get('cache-control'), encoding: r.headers.get('content-encoding'), bytes: body.length });
  const fonts = [...new Set([...body.matchAll(/["'(]([^"'()]+\.(?:woff2|ttf))["')]/g)].map((m) => m[1]))].slice(0, 12);
  say('fontReferences', fonts);
  const first = fonts.find((f) => /woff2/.test(f)) ?? fonts[0];
  if (first) {
    const fr = await fetch(new URL(first.startsWith('/') ? first : '/' + first, BASE), { headers: { 'user-agent': UA } });
    say('fontHeaders', { url: first, status: fr.status, cacheControl: fr.headers.get('cache-control'), contentType: fr.headers.get('content-type'), bytes: Number(fr.headers.get('content-length')) || undefined });
  }
}

// Explore on a phone-class profile
const PROFILE = { state: { profile: { id: 'family-pv', parentName: 'Aidan', members: [{ id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 }, { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3 }], homeLocation: 'NW3', homeLatitude: 51.556, homeLongitude: -0.178, budgetTier: 'moderate', completionPercent: 90 }, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function visit(context, tag) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const errors = [], google = []; let bytes = 0, requests = 0;
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('request', (r) => { requests++; if (/googleapis|maps\.google|google\.com\/maps|gstatic/i.test(r.url())) google.push(r.url().slice(0, 100)); });
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(BASE + '/explore', { waitUntil: 'commit', timeout: 90000 });
  const firstPaint = await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, null, { timeout: 90000 }).then(() => Date.now() - t0).catch(() => null);
  const card = await page.locator('[role="button"][aria-label$="view details"]').first().waitFor({ timeout: 90000 }).then(() => Date.now() - t0).catch(() => null);
  const out = { firstThingMs: firstPaint, firstCardMs: card, kb: Math.round(bytes / 1024), requests, errors: errors.slice(0, 5), googleRequests: google.length };
  say(tag, out);
  await page.close();
}
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, timezoneId: 'Europe/London' });
await context.addInitScript(([seed]) => { if (!localStorage.getItem('pv-seeded')) { localStorage.setItem('pv-seeded', '1'); localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)); } }, [PROFILE]);
await visit(context, 'exploreFirstVisit');
await visit(context, 'exploreRepeatVisit');
await browser.close();
console.log('DONE');
