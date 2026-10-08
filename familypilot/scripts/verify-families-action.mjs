/**
 * The labelled Families action on Home and Explore, and the Families screen it opens, in a real browser against the local
 * fixture (every provider host is aborted; a provider request fails the run).
 *
 * What it proves, at the four phone widths and at a short height where Home drops its heading:
 *   - the action is there on Home AND Explore, labelled in words ("Families"), and its accessible name starts with that word;
 *   - it is inside the viewport, drawn at least 44 points tall, and the page does not scroll sideways;
 *   - it overlaps nothing: no text or control on the screen intersects it;
 *   - the bottom navigation still has exactly five tabs, none called Families;
 *   - tapping it opens the Families screen, which has its own title and a way back, and Back returns to where you were;
 *   - the empty state offers "Add a family", which opens the add tools; with a family on this phone the screen names the group
 *     and offers Meet halfway.
 * Accounts are not configured in this build, so connected and pending states are covered by verify-account-journey.mjs
 * against the auth-enabled build.
 *
 * Usage: node scripts/verify-families-action.mjs [baseUrl]   (serve first: FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4173 dist)
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov)\.[a-z.]+$|overpass/i;

const PROFILE = {
  id: 'family-fam', parentName: 'Aidan', familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2025-05-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy'] },
  ],
  homeLocation: 'Bushey, Hertfordshire', homeLatitude: 51.643, homeLongitude: -0.36,
  completionPercent: 90, vehicle: null, pushchair: null, travelCot: null, memberships: [], routines: [], mustHaveFacilities: [],
};
const GUEST = { id: 'guest-hannah', label: 'Hannah', area: 'E17', latitude: 51.59, longitude: -0.02, ages: [], pushchair: false, required: [], routines: [] };

const SIZES = [[320, 700], [360, 800], [393, 852], [430, 932], [390, 640]];
let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

const browser = await chromium.launch(launchOptions);
const providerRequests = [];

async function open(width, height, { guests = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'Europe/London' });
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (LIVE_PROVIDER.test(host)) { providerRequests.push(host); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ profile, guests }) => {
      localStorage.setItem('familypilot-family-v1', JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }));
      localStorage.setItem('familypilot-planning-v1', JSON.stringify({ state: { families: guests, options: { date: '2026-01-13', leaveAt: '', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [] }, version: 0 }));
    },
    { profile: PROFILE, guests },
  );
  return { context, page };
}
const settle = async (page, ms = 1500) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(ms); };
const path = (page) => new URL(page.url()).pathname;

/** The pill's box, its accessible name, and everything visible that intersects it. */
async function inspect(page) {
  return page.evaluate(() => {
    const pill = document.querySelector('[data-testid="families-action"]');
    if (!pill) return null;
    const r = pill.getBoundingClientRect();
    const intersects = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent?.trim() || pill.contains(n.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      for (const box of range.getClientRects()) if (box.width > 0 && intersects(r, box)) hits.push(n.textContent.trim().slice(0, 30));
    }
    for (const el of document.querySelectorAll('button, a, [role="button"], input')) {
      if (el === pill || pill.contains(el) || el.contains(pill)) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && intersects(r, box)) hits.push(`control:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}`);
    }
    return {
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
      label: pill.getAttribute('aria-label'),
      text: pill.textContent?.trim(),
      hits,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      tabs: [...document.querySelectorAll('[role="tablist"] [role="tab"]')].map((t) => (t.getAttribute('aria-label') ?? t.textContent ?? '').trim()),
    };
  });
}

for (const [width, height] of SIZES) {
  for (const [route, screen] of [['/', 'Home'], ['/explore', 'Explore']]) {
    const { context, page } = await open(width, height);
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const info = await inspect(page);
    const tag = `${width}x${height} ${screen}`;
    check(`${tag}: the Families action is on screen`, Boolean(info), info ? '' : 'not found');
    if (info) {
      check(`${tag}: it is labelled in words`, info.text.replace(/[\uE000-\uF8FF]/g, '').trim() === 'Families' && /^Families/.test(info.label ?? ''), `text "${info.text}", name "${info.label}"`);
      check(`${tag}: it is inside the screen`, info.box.left >= 0 && info.box.right <= width, `${Math.round(info.box.left)}..${Math.round(info.box.right)} of ${width}`);
      check(`${tag}: it is a real target`, info.box.height >= 44 && info.box.width >= 70, `${Math.round(info.box.width)}x${Math.round(info.box.height)}`);
      check(`${tag}: it overlaps nothing`, info.hits.length === 0, info.hits.join(' | '));
      check(`${tag}: the page does not scroll sideways`, info.overflowX <= 1, `overflow ${info.overflowX}`);
      check(`${tag}: the bottom navigation is still the five tabs`, JSON.stringify(info.tabs) === JSON.stringify(['Home', 'Explore', 'Halfway', 'Plans', 'Profile']), info.tabs.join(','));
      await page.getByTestId('families-action').click();
      await settle(page, 900);
      check(`${tag}: tapping opens the Families screen`, path(page) === '/families', path(page));
      check(`${tag}: it has its own title and a way back`, (await page.getByTestId('families-title').count()) === 1 && (await page.getByRole('button', { name: 'Go back' }).count()) >= 1);
      await page.getByRole('button', { name: 'Go back' }).first().click();
      await settle(page, 900);
      check(`${tag}: Back returns to ${screen}`, path(page) === (route === '/' ? '/' : route), path(page));
    }
    await context.close();
  }
}

// The Families screen itself, nobody connected and then a family on this phone.
for (const [width, height] of [[360, 800], [430, 932]]) {
  {
    const { context, page } = await open(width, height);
    await page.goto(`${BASE}/families`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const text = await page.evaluate(() => document.body.innerText);
    check(`${width}: the Families screen says what it is for`, /Families you plan days out with/.test(text));
    check(`${width}: with nobody connected it offers "Add a family"`, (await page.getByTestId('families-add').count()) === 1 && /Add a family/.test(await page.getByTestId('families-add').innerText()));
    await page.getByTestId('families-add').click();
    await page.waitForTimeout(500);
    check(`${width}: "Add a family" opens the add tools`, (await page.getByTestId('profile-add-by-postcode').count()) === 1);
    await page.getByTestId('profile-add-by-postcode').click();
    await page.waitForTimeout(500);
    check(`${width}: the postcode form opens`, (await page.getByTestId('add-family-area').count()) === 1);
    check(`${width}: no sideways scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await context.close();
  }
  {
    const { context, page } = await open(width, height, { guests: [GUEST] });
    await page.goto(`${BASE}/families`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const text = await page.evaluate(() => document.body.innerText);
    check(`${width}: a family on this phone is grouped and named`, /On this phone only/.test(text) && /Hannah/.test(text), text.slice(0, 120).replace(/\n/g, ' '));
    check(`${width}: it offers Meet halfway and Remove`, (await page.getByRole('button', { name: 'Meet halfway' }).count()) >= 1 && (await page.getByRole('button', { name: 'Remove' }).count()) >= 1);
    check(`${width}: "Add another family" is offered`, /Add another family|Add a family/.test(await page.getByTestId('families-add').innerText()));
    await page.getByRole('button', { name: 'Meet halfway' }).first().click();
    await settle(page, 900);
    check(`${width}: Meet halfway opens with that family`, path(page) === '/halfway', path(page));
    await context.close();
  }
}

check('no request reached a live provider', providerRequests.length === 0, [...new Set(providerRequests)].join(','));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
