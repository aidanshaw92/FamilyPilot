/**
 * Home while it loads, in a real browser, against the local fixture (zero spend: every provider host is aborted and
 * fails the run).
 *
 * The real-device test: straight after onboarding, Home's recommendation area sat as one large blank block for about ten
 * seconds, and parts of the page arrived late and moved. This drives Home with the slow responses that produce that
 * (the places search held back, the weather held back further, every photograph held back) and samples the screen every
 * 100ms, at each established phone width:
 *
 *   first run        nothing on the device: what fills the deck's place while the list loads, and when the cards arrive;
 *   slow weather     the list itself is quick but the weather is not: does the list wait for it;
 *   kept, fresh      reopened within ten minutes: the list is on the device;
 *   kept, stale      reopened later (the device copy is past its fresh window): is the kept list shown at once while
 *                    the fresh one loads;
 *   slow photo       when the cards arrive before their photographs: what the card shows meanwhile.
 *
 * For every sample it records whether the deck's place is (a) the deck, (b) the deck-shaped skeleton, (c) a plain
 * loading block with nothing in it (what main showed), or (d) nothing at all, and where the header controls sit, so
 * "never a blank block" and "nothing moves when the cards arrive" are measured rather than eyeballed.
 *
 * usage: node scripts/verify-home-loading.mjs [baseUrl] [--report out.json] [--widths 360,390,393,430] [--expect-legacy]
 *   --expect-legacy  measure only (used to record the BEFORE numbers against a build of main); never fails on findings.
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4173';
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const REPORT = flag('--report');
const WIDTHS = (flag('--widths') ?? '360,390,393,430').split(',').map(Number);
const LEGACY = args.includes('--expect-legacy');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov)\.[a-z.]+$|overpass/i;

// The slow real device, modelled: a cold places search, a slower weather lookup, slow photographs.
const SLOW_SEARCH_MS = 6000;
const SLOW_WEATHER_MS = 9000;
const SLOW_PHOTO_MS = 3000;

const seed = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan', familyName: 'Shaw',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
        { id: 'c1', name: 'Ozzie', role: 'child', dateOfBirth: '2025-03-01', age: 1, ageMonths: 7 },
      ],
      homeLocation: 'Bushey', homeLatitude: 51.643, homeLongitude: -0.36,
      budgetTier: 'moderate', maxDriveMinutes: 60, completionPercent: 80,
      memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
};

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const failures = [];
const results = [];
const check = (ok, message) => { if (!ok) failures.push(message); return ok; };

async function newContext(width, delays) {
  const context = await browser.newContext({ viewport: { width, height: Math.round(width * 852 / 393) }, deviceScaleFactor: 1 });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    const wait = url.pathname === '/api/places/search' && !url.searchParams.get('intent')?.match(/nearby-food|between/) ? delays.search
      : url.pathname === '/api/context/weather' ? delays.weather
      : url.pathname === '/api/places/photo' ? delays.photo
      : 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return route.continue().catch(() => {});
  });
  await context.addInitScript((s) => {
    if (!window.localStorage.getItem('familypilot-family-v1')) window.localStorage.setItem('familypilot-family-v1', JSON.stringify(s));
  }, seed);
  return context;
}

/** One sample of the deck's place and the header's controls. */
const sample = (page) => page.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) }; };
  const deck = document.querySelector('[data-testid="recommendation-deck"]');
  const skeleton = document.querySelector('[data-testid="home-deck-skeleton"]');
  // main's loading state: a single progressbar the size of the deck with nothing inside it.
  const plain = [...document.querySelectorAll('[role="progressbar"]')].find((el) => el.getBoundingClientRect().height > 250 && !el.textContent.trim());
  const cardText = deck ? deck.textContent.trim().length > 0 : false;
  const front = deck ? [...deck.children].at(-1) : null;
  return {
    state: deck && cardText ? 'deck' : skeleton ? 'skeleton' : plain ? 'plain-block' : 'nothing',
    deck: box(deck), skeleton: box(skeleton), plain: box(plain),
    message: skeleton?.getAttribute('aria-label') ?? null,
    avatar: box(document.querySelector('[aria-label="Your family profile"]')),
    chips: box(document.querySelector('[aria-label="Plan categories"]')),
    greeting: [...document.querySelectorAll('div')].find((n) => n.children.length === 0 && /^Good (morning|afternoon|evening),/.test(n.textContent))?.textContent ?? null,
    photoPlaceholders: document.querySelectorAll('[data-testid="recommendation-deck"] [data-testid="venue-image-placeholder"]').length,
    frontHasPlaceholder: Boolean(front?.querySelector('[data-testid="venue-image-placeholder"]')),
  };
});

async function watch(page, ms) {
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < ms) {
    samples.push({ t: Date.now() - started, ...(await sample(page).catch(() => ({ state: 'nothing' }))) });
    await page.waitForTimeout(100);
  }
  return samples;
}

function summarise(name, width, samples) {
  const firstDeck = samples.find((s) => s.state === 'deck');
  const plainMs = samples.filter((s) => s.state === 'plain-block').length * 100;
  const nothingAfterHeader = samples.filter((s) => s.state === 'nothing' && s.avatar).length * 100;
  const skeletonMs = samples.filter((s) => s.state === 'skeleton').length * 100;
  // Header controls: did anything move between the first sample that had them and the end?
  const withHeader = samples.filter((s) => s.avatar && s.chips);
  const moved = (key) => withHeader.length ? Math.max(...withHeader.map((s) => Math.abs(s[key].top - withHeader[0][key].top))) : null;
  const lastSkeleton = [...samples].reverse().find((s) => s.state === 'skeleton');
  const deckJump = lastSkeleton && firstDeck ? { top: firstDeck.deck.top - lastSkeleton.skeleton.top, height: firstDeck.deck.height - lastSkeleton.skeleton.height } : null;
  const greetings = [...new Set(samples.map((s) => s.greeting).filter(Boolean))];
  // Once the cards are up, nothing ever takes them away again (a refresh replaces them in place).
  const cardsStayed = firstDeck ? samples.filter((s) => s.t >= firstDeck.t).every((s) => s.state === 'deck') : null;
  const result = {
    scenario: name, width,
    msToCards: firstDeck ? firstDeck.t : null,
    msPlainBlock: plainMs,
    msNothingInDeckPlace: nothingAfterHeader,
    msSkeleton: skeletonMs,
    skeletonMessage: samples.find((s) => s.message)?.message ?? null,
    headerMovedPx: { avatar: moved('avatar'), chips: moved('chips') },
    deckVsSkeletonPx: deckJump,
    greetings,
    cardsStayed,
  };
  results.push(result);
  return result;
}

for (const width of WIDTHS) {
  // FIRST RUN: nothing on the device. Slow search, slower weather, slow photos.
  {
    const context = await newContext(width, { search: SLOW_SEARCH_MS, weather: SLOW_WEATHER_MS, photo: SLOW_PHOTO_MS });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-01-15T11:00:00'));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const samples = await watch(page, 12000);
    const r = summarise('first run', width, samples);
    // The cards arrive within the slow search plus a margin; they no longer wait the extra seconds for the weather.
    if (!LEGACY) {
      check(r.msToCards !== null && r.msToCards < SLOW_SEARCH_MS + 2000, `${width} first run: cards by ${r.msToCards}ms, not held for the weather (${SLOW_WEATHER_MS}ms)`);
      check(r.msPlainBlock === 0, `${width} first run: never a plain empty block (${r.msPlainBlock}ms)`);
      check(r.msNothingInDeckPlace <= 300, `${width} first run: the deck's place is never empty once the header is up (${r.msNothingInDeckPlace}ms)`);
      check(r.msSkeleton > 0 && /Finding today’s best places for Ozzie/.test(r.skeletonMessage ?? ''), `${width} first run: the deck-shaped skeleton says what is happening, for this family`);
      check(r.deckVsSkeletonPx && Math.abs(r.deckVsSkeletonPx.top) <= 1 && Math.abs(r.deckVsSkeletonPx.height) <= 1, `${width} first run: the cards take the skeleton's exact place (${JSON.stringify(r.deckVsSkeletonPx)})`);
      check(r.headerMovedPx.avatar === 0 && r.headerMovedPx.chips === 0, `${width} first run: the header and chips do not move (${JSON.stringify(r.headerMovedPx)})`);
      check(r.greetings.length === 1 && /Aidan/.test(r.greetings[0]), `${width} first run: the greeting has the family's name from the first frame (${r.greetings.join(' → ')})`);
      check(r.cardsStayed, `${width} first run: once the cards are up they stay up`);
    }
    // SLOW PHOTO: the cards are up but their photographs are still held back.
    const firstDeck = samples.find((s) => s.state === 'deck');
    const photoWindow = samples.filter((s) => s.state === 'deck' && s.t < (firstDeck?.t ?? 0) + SLOW_PHOTO_MS - 500);
    const photo = { scenario: 'slow photo', width, frontCardPlaceholderWhileLoading: photoWindow.length ? photoWindow.every((s) => s.frontHasPlaceholder) : null };
    results.push(photo);
    if (!LEGACY) check(photo.frontCardPlaceholderWhileLoading === true, `${width} slow photo: the front card shows the illustration, not a grey block, until its photo arrives`);

    // KEPT, FRESH: reopened within ten minutes, with the search still slow. The device has the list.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const fresh = summarise('kept, fresh', width, await watch(page, 3000));
    if (!LEGACY) check(fresh.msToCards !== null && fresh.msToCards < 1500, `${width} kept, fresh: cards at once (${fresh.msToCards}ms)`);

    // KEPT, STALE: the device copy is past its fresh window (but inside the six hours it may be shown for).
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (!key.startsWith('familypilot-places-v2:search:')) continue;
        const entry = JSON.parse(window.localStorage.getItem(key));
        entry.expiresAt = Date.now() - 60_000;
        window.localStorage.setItem(key, JSON.stringify(entry));
      }
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const stale = summarise('kept, stale', width, await watch(page, SLOW_SEARCH_MS + 2500));
    if (!LEGACY) {
      check(stale.msToCards !== null && stale.msToCards < 1500, `${width} kept, stale: the kept list is shown at once while the fresh one loads (${stale.msToCards}ms)`);
      // At most the one frame it takes to read the device's copy.
      check(stale.msPlainBlock === 0 && stale.msSkeleton <= 200, `${width} kept, stale: no loading state beyond the device read (${stale.msSkeleton}ms)`);
      check(stale.cardsStayed, `${width} kept, stale: the cards stay up while the fresh list replaces the kept one`);
    }
    await context.close();
  }

  // SLOW WEATHER ONLY: the list is quick; the weather is not. The list must not wait for it.
  {
    const context = await newContext(width, { search: 300, weather: SLOW_WEATHER_MS, photo: 0 });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-01-15T11:00:00'));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const r = summarise('slow weather', width, await watch(page, SLOW_WEATHER_MS + 1500));
    if (!LEGACY) check(r.msToCards !== null && r.msToCards < 4500, `${width} slow weather: cards by ${r.msToCards}ms, not after the weather (${SLOW_WEATHER_MS}ms)`);
    await context.close();
  }
}
await browser.close();

for (const r of results) console.log(JSON.stringify(r));
if (blocked.length) failures.push(`live provider requests: ${[...new Set(blocked)].join(', ')}`);
if (REPORT) writeFileSync(REPORT, JSON.stringify({ base: BASE, legacy: LEGACY, delays: { SLOW_SEARCH_MS, SLOW_WEATHER_MS, SLOW_PHOTO_MS }, results, failures }, null, 2));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `home loading: ${failures.length} failing` : `home loading: all checks passed at ${WIDTHS.join('/')}, zero provider requests`);
process.exit(failures.length && !LEGACY ? 1 : 0);
