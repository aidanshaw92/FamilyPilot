/**
 * Proves the approved screens are DRIVEN by content, not painted to match a screenshot.
 *
 * Figma specifies how content appears, not what it is. So this changes the content and the clock under
 * the running app and checks that every part the frames show as an example follows:
 *
 *   greeting and avatar   the time of day (a fixed clock at 07:00, 14:00, 19:30) and the parent's name,
 *                         including a name far longer than the frame's
 *   ordering              Home's first card is Explore's first card, and Family Fit never rises down the list
 *   Family Fit states     a scored venue shows "★ n.n Family Fit", an unreviewed one the neutral status, and
 *                         no card ever shows both a number and "Not yet reviewed"
 *   photographs           a venue with a photograph draws it, one without draws the category placeholder
 *   category chips        Explore's and Home's chips change the list; the count line follows
 *   filters               the Filters sheet narrows the list, the link carries the active count, Reset restores
 *   saved                 the heart toggles, the Saved tab lists the place, and it survives a reload
 *   travel times          cards show different journey times, worded as estimates
 *
 * It runs against the REALISTIC fixture scenario (FIXTURE_SCENARIO=realistic), because the sparse one has no
 * reviewed venue to vary. Everything is synthetic and every request to a live provider is aborted and fails
 * the run: nothing here spends money.
 *
 * Usage: FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4175 &
 *        node scripts/verify-dynamic-content.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4175';
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|openstreetmap|tile\.osm)\.[a-z.]+$|overpass/i;

const profile = (parentName) => ({
  state: {
    profile: {
      id: 'family-demo',
      parentName,
      members: [
        { id: 'p1', name: parentName.split(' ')[0], role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2021-01-01', age: 5 },
      ],
      homeLocation: 'London',
      budgetTier: 'moderate',
      maxDriveMinutes: 60,
      completionPercent: 80,
    },
    hasCompletedOnboarding: true,
    hasSeenSplash: true,
    profileRevision: 1,
  },
  version: 0,
});

const results = [];
const blocked = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
});

async function open(route, { name = 'Aidan Shaw', now = '2026-01-13T19:30:00', width = 393, seed = true, saved } = {}) {
  const context = await browser.newContext({ viewport: { width, height: Math.round(width * (852 / 393)) }, deviceScaleFactor: 2 });
  await context.route('**/*', (r) => {
    const url = new URL(r.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) {
      blocked.push(url.hostname);
      return r.abort();
    }
    return r.continue();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(now));
  if (seed) {
    await page.addInitScript(([k, v]) => {
      if (!window.sessionStorage.getItem('seeded')) {
        window.localStorage.setItem(k, v);
        window.sessionStorage.setItem('seeded', '1');
      }
    }, ['familypilot-family-v1', JSON.stringify(profile(name))]);
  }
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2200);
  return { page, context };
}

const body = (page) => page.evaluate(() => document.body.innerText);

// --- greeting, name, avatar ------------------------------------------------------------------------
console.log('\ngreeting, name and avatar follow the clock and the profile');
for (const [now, word] of [['2026-01-13T07:00:00', 'Good morning'], ['2026-01-13T14:00:00', 'Good afternoon'], ['2026-01-13T19:30:00', 'Good evening']]) {
  const { page, context } = await open('/', { now });
  const text = await body(page);
  check(`${now.slice(11, 16)} says "${word}, Aidan"`, text.includes(`${word}, Aidan`));
  await context.close();
}
for (const [name, width] of [['Priya Nair', 393], ['Bartholomew-Maximilian Featherstonehaugh', 360], ['Zoë Ó Briain', 430]]) {
  const first = name.split(' ')[0];
  const { page, context } = await open('/', { name, width });
  const text = await body(page);
  check(`"${first}" is greeted by name at ${width}`, text.includes(first));
  const avatar = await page.getByRole('button', { name: 'Your family profile' }).innerText().catch(() => '');
  check(`the avatar shows ${first[0].toUpperCase()}`, avatar.trim().toUpperCase() === first[0].toUpperCase(), JSON.stringify(avatar));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no sideways scroll for "${first}" at ${width}`, overflow <= 1, `${overflow}px`);
  const clipped = await page.evaluate((f) => {
    const el = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && /^Good (morning|afternoon|evening)/.test(d.textContent ?? ''));
    return el ? el.scrollWidth - el.clientWidth : 0;
  }, first);
  check(`the greeting for "${first}" is not clipped`, clipped <= 1, `${clipped}px`);
  await context.close();
}

// --- ordering, Family Fit, photographs, travel (Explore) --------------------------------------------
console.log('\nExplore is data-driven');
{
  const { page, context } = await open('/explore');
  // The list is windowed (only the rows near the screen are mounted, on purpose: every photograph a parent
  // never sees is money), so collect the cards while scrolling down it.
  const seen = new Map();
  for (let i = 0; i < 14; i += 1) {
    const batch = await page.locator('[role="button"][aria-label$="view details"]').evaluateAll((els) =>
      els.map((el) => ({
        label: el.getAttribute('aria-label'),
        text: el.innerText,
        hasPhoto: Boolean(el.querySelector('img')),
        placeholder: /photo not available/.test(el.innerHTML),
      })),
    );
    for (const c of batch) if (!seen.has(c.label)) seen.set(c.label, c);
    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(350);
  }
  const cards = [...seen.values()];
  await page.mouse.wheel(0, -20000);
  await page.waitForTimeout(400);
  check('cards are rendered from the venue data', cards.length >= 12, `${cards.length} cards`);
  const fits = cards.map((c) => (/★\s*(\d\.\d)\s*Family Fit/.exec(c.text) ?? [])[1]).filter(Boolean).map(Number);
  check('Family Fit never rises down the list', fits.every((v, i) => i === 0 || v <= fits[i - 1]), fits.join(' ≥ '));
  const unreviewed = cards.filter((c) => /Not yet reviewed/.test(c.text));
  const scored = cards.filter((c) => /Family Fit/.test(c.text));
  check('scored and unreviewed venues both appear', scored.length > 0 && unreviewed.length > 0, `${scored.length} scored, ${unreviewed.length} unreviewed`);
  check('no card shows a number AND "Not yet reviewed"', !cards.some((c) => /★\s*\d\.\d/.test(c.text) && /Not yet reviewed/.test(c.text)));
  check('an unreviewed card never claims a classification word that implies a score', unreviewed.every((c) => !/(Excellent|Great|Good) fit/.test(c.label ?? '')) && unreviewed.every((c) => /Not yet reviewed/.test(c.label ?? '')), unreviewed[0]?.label ?? '');
  check('a venue with a photograph draws it', cards.some((c) => c.hasPhoto));
  check('a venue without one draws the category placeholder', cards.some((c) => c.placeholder));
  const times = new Set(cards.map((c) => (/about (\d+) min/.exec(c.text) ?? [])[1]).filter(Boolean));
  check('journey times differ between venues', times.size >= 3, [...times].join(', '));
  check('journey times are worded as estimates', cards.every((c) => !/\d+ min/.test(c.text) || /about \d+ min/.test(c.text)));
  const long = cards.find((c) => c.label?.startsWith('The Royal Borough'));
  check('the over-long name is kept whole in its accessible name', Boolean(long), long?.label.slice(0, 60) ?? 'missing');

  // The first Explore card is Home's first card.
  const exploreFirst = cards[0].label.split(',')[0];
  const home = await open('/');
  const homeLabel = await home.page.locator('[role="button"][aria-label$="see more"]').first().getAttribute('aria-label');
  check("Home's first card is Explore's first card", homeLabel?.startsWith(exploreFirst.slice(0, 20)) === true, `${exploreFirst.slice(0, 24)} / ${homeLabel?.slice(0, 24)}`);
  await home.context.close();

  // Category chip.
  const count = async () => /(\d+) places? across London/.exec(await body(page))?.[1];
  const before = await count();
  await page.getByRole('button', { name: 'Parks', exact: true }).click();
  await page.waitForTimeout(700);
  const parks = await page.locator('[role="button"][aria-label$="view details"]').evaluateAll((els) => els.map((e) => e.innerText));
  check('the Parks chip narrows the list to parks', parks.length > 0 && parks.every((t) => /\bpark\b/.test(t)), `${parks.length} cards`);
  const after = await count();
  check('the count line follows the list', Number(after) === parks.length || Number(after) < Number(before), `${before} → ${after}`);
  check('the selected chip says so, not only by colour', (await page.getByRole('button', { name: 'Parks', exact: true }).getAttribute('aria-pressed')) === 'true' && (await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')) === 'false');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.waitForTimeout(500);
  check('"All" restores the list', Number(await count()) === Number(before));

  // Filters.
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '10 min', exact: true }).click();
  await page.getByRole('button', { name: 'Show results' }).click();
  await page.waitForTimeout(800);
  const filtered = Number(await count());
  check('a travel-time filter narrows the list', filtered < Number(before), `${before} → ${filtered}`);
  const linkName = await page.getByRole('button', { name: /^Filters/ }).first().getAttribute('aria-label');
  check('the Filters link carries the active count', /Filters \(1\)/.test(linkName ?? ''), linkName ?? '');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Show results' }).click();
  await page.waitForTimeout(700);
  check('Reset restores the full list', Number(await count()) === Number(before));

  // When filters leave nothing, the screen suggests loosening them, so the sheet must stay reachable.
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Free', exact: true }).first().click();
  await page.getByRole('button', { name: '10 min', exact: true }).click();
  await page.getByRole('button', { name: 'Show results' }).click();
  await page.waitForTimeout(800);
  const emptyNow = /No places found/.test(await body(page));
  check('an empty result still offers Filters (and says how many)', emptyNow ? (await page.getByRole('button', { name: /^Filters/ }).count()) > 0 && /0 places across London/.test(await body(page)) : true, emptyNow ? 'empty state shown' : 'filters left some results; empty branch not reached');
  await context.close();
}

// --- Home plan chips --------------------------------------------------------------------------------
console.log('\nHome is data-driven');
{
  const { page, context } = await open('/');
  const first = () => page.locator('[role="button"][aria-label$="see more"]').first().getAttribute('aria-label');
  const forYou = await first();
  await page.getByRole('button', { name: 'Outdoor', exact: true }).click();
  await page.waitForTimeout(800);
  const outdoor = await first().catch(() => null);
  const emptyShown = /Nothing confirmed here yet/.test(await body(page));
  check('a plan chip changes what the deck shows', outdoor !== forYou || emptyShown, `${forYou?.slice(0, 22)} → ${outdoor?.slice(0, 22) ?? '(empty state)'}`);
  await page.getByRole('button', { name: 'For you', exact: true }).click();
  await page.waitForTimeout(700);
  check('"For you" restores the recommendation', (await first()) === forYou);

  // Save, then prove it persisted.
  const heart = page.getByRole('button', { name: /^(Save place|Remove from saved)$/ }).first();
  const wasLabel = await heart.getAttribute('aria-label');
  await heart.click();
  await page.waitForTimeout(500);
  const nowLabel = await page.getByRole('button', { name: /^(Save place|Remove from saved)$/ }).first().getAttribute('aria-label');
  check('the heart toggles the saved state in its name', wasLabel !== nowLabel, `${wasLabel} → ${nowLabel}`);
  await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const savedText = await body(page);
  check('the Saved tab lists the place', new RegExp((forYou ?? '').split(',')[0].slice(0, 12)).test(savedText), savedText.replace(/\s+/g, ' ').slice(0, 80));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('and it survives a reload', new RegExp((forYou ?? '').split(',')[0].slice(0, 12)).test(await body(page)));
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
if (blocked.length) {
  console.error(`\nZERO-SPEND VIOLATION: ${[...new Set(blocked)].join(', ')}`);
  process.exit(1);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
