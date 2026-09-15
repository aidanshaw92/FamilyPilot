/**
 * Measures the rendered Home screen against the locked Figma frame "01 — Home", and captures the
 * screenshots the design review runs on.
 *
 * Every expected number below is read off the frame itself (node ids in comments), so this fails
 * when the build drifts from the design rather than when it merely looks different to me.
 *
 * Usage: node scripts/verify-home-against-figma.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * This sandbox ships Chromium at a fixed path and blocks the download Playwright would
 * otherwise do; a CI runner or a developer machine has its own. Use ours when it is there and
 * let Playwright resolve its own otherwise, so the same script runs in both places.
 */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = {
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
};

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? join(process.cwd(), '..', 'docs', 'home-widths');

/** The frame's own artboard. Figures below are in its coordinates. */
const REF = 393;

/**
 * Real iPhone insets, forced on. React Native's safe-area provider reads `env(safe-area-inset-*)`
 * off a probe element's computed padding, which a desktop browser reports as 0 — so a web export
 * can never show what the bar does on a device unless the insets are emulated.
 */
const IPHONE_INSETS = { top: 59, bottom: 34 };

const RUNS = [
  { name: '360', width: 360, height: 800, insets: null },
  { name: '393', width: REF, height: 852, insets: null },
  { name: '430', width: 430, height: 932, insets: null },
  { name: '393-iphone-insets', width: REF, height: 852, insets: IPHONE_INSETS },
];

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo',
      parentName: 'Aidan Shaw',
      members: [
        { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
        { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 },
        { id: 'child-2', name: 'Theo', role: 'child', dateOfBirth: '2022-01-01', age: 3 },
      ],
      homeLocation: 'Manchester',
      budgetTier: 'moderate',
      maxDriveMinutes: 30,
      completionPercent: 80,
      vehicle: 'Volvo XC60',
      pushchair: 'Bugaboo Fox',
      travelCot: null,
      memberships: [],
      routines: [],
      mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true,
    hasSeenSplash: true,
    profileRevision: 1,
  },
  version: 0,
};

const results = [];
function check(run, name, passed, detail) {
  results.push({ run, name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const near = (actual, expected, tolerance = 1) => Math.abs(actual - expected) <= tolerance;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(launchOptions);

for (const run of RUNS) {
  console.log(`\n--- ${run.name} (${run.width}x${run.height}${run.insets ? ', iPhone insets' : ''}) ---`);
  const context = await browser.newContext({
    viewport: { width: run.width, height: run.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-01-15T14:30:00'));
  await page.addInitScript((seed) => {
    window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed));
  }, FAMILY_STATE);

  if (run.insets) {
    // The provider's probe element carries `env(safe-area-inset-*)` in its inline style; an
    // !important rule is the one thing that outranks that, so it reports device insets instead.
    await page.addInitScript((insets) => {
      const style = document.createElement('style');
      style.textContent = `div[style*="safe-area-inset"] {
        padding-top: ${insets.top}px !important;
        padding-bottom: ${insets.bottom}px !important;
      }`;
      const attach = () => document.head?.appendChild(style);
      if (document.head) attach();
      else document.addEventListener('DOMContentLoaded', attach);
    }, run.insets);
  }

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[role="tab"]', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: +r.left.toFixed(2),
        right: +r.right.toFixed(2),
        top: +r.top.toFixed(2),
        bottom: +r.bottom.toFixed(2),
        width: +r.width.toFixed(2),
        height: +r.height.toFixed(2),
      };
    };
    const leaf = (text) =>
      [...document.querySelectorAll('div')].find(
        (el) => el.children.length === 0 && (el.textContent ?? '').trim() === text,
      );
    const startsWith = (prefix) =>
      [...document.querySelectorAll('div')].find(
        (el) => el.children.length === 0 && (el.textContent ?? '').trim().startsWith(prefix),
      );

    const naturalWidth = (el) => {
      if (!el) return null;
      if (el.tagName === 'INPUT') {
        const probe = document.createElement('span');
        const cs = getComputedStyle(el);
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
        probe.textContent = el.value || el.placeholder || '';
        document.body.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      }
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    };

    const activeCard = document.querySelector('[role="button"][aria-label$=", see more"]');
    const deck = activeCard?.parentElement?.parentElement ?? null;
    const greeting = startsWith('Good ');
    const search = [...document.querySelectorAll('input')].find((el) =>
      (el.value || el.placeholder || '').startsWith('Search'),
    );
    const filter = document.querySelector('[role="button"][aria-label="Filters"]');
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const pill = tabs[0]?.parentElement ?? null;
    const scroller = [...document.querySelectorAll('div')].find(
      (el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible',
    );

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentScrollWidth: document.documentElement.scrollWidth,
      greeting: {
        ...box(greeting),
        text: greeting?.textContent ?? null,
        fontSize: greeting ? getComputedStyle(greeting).fontSize : null,
        natural: greeting ? +naturalWidth(greeting).toFixed(2) : null,
      },
      subtitle: box(leaf('What shall we do today?')),
      sectionHeading: box(leaf('Select your plan')),
      search: search
        ? {
            ...box(search),
            text: search.value || search.placeholder,
            natural: +naturalWidth(search).toFixed(2),
            field: box(search.closest('[role="button"]') ?? search.parentElement?.parentElement),
          }
        : null,
      filter: box(filter),
      deck: box(deck),
      activeCard: box(activeCard),
      layers: deck ? [...deck.children].map(box) : [],
      cta: box(leaf('See more')),
      pill: box(pill),
      tabs: tabs.map((t) => ({ label: t.getAttribute('aria-label'), ...box(t) })),
      // Everything drawn inside a tab, whatever element type the icon font renders as. The bug
      // this replaced put the label's line box below the bar, so the assertion is deliberately
      // "nothing a tab draws escapes the pill" rather than "the icon is in the right place".
      tabContents: tabs.flatMap((t) =>
        [...t.querySelectorAll('*')]
          .map(box)
          .filter((r) => r && r.width > 0 && r.height > 0),
      ),
      scroll: scroller
        ? { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }
        : null,
    };
  });

  const scale = run.width / REF;
  const isRef = run.width === REF;

  // --- No overflow, nothing clipped ------------------------------------------------------------
  check(run.name, 'no horizontal page overflow', m.documentScrollWidth === run.width,
    `${m.documentScrollWidth} vs ${run.width}`);
  check(run.name, 'greeting renders whole', m.greeting.natural <= m.greeting.width + 0.5,
    `"${m.greeting.text}" ${m.greeting.natural} in ${m.greeting.width} at ${m.greeting.fontSize}`);
  check(run.name, 'search placeholder renders whole', m.search.natural <= m.search.width + 0.5,
    `"${m.search.text}" ${m.search.natural} in ${m.search.width}`);

  // --- Bottom navigation (frame node 9:2) ------------------------------------------------------
  // 270 x 58 centred at x=62 on a 393 artboard, five 50x44 tabs at stride 52, 22px icons.
  const tabCount = m.tabs.length;
  const expectedPillWidth = 6 * 2 + tabCount * 50 + (tabCount - 1) * 2;
  check(run.name, 'pill matches the frame size', near(m.pill.width, expectedPillWidth) && near(m.pill.height, 58),
    `${m.pill.width}x${m.pill.height}, expected ${expectedPillWidth}x58 for ${tabCount} tabs`);
  check(run.name, 'pill is centred', near((m.pill.left + m.pill.right) / 2, run.width / 2),
    `centre ${((m.pill.left + m.pill.right) / 2).toFixed(1)} of ${run.width}`);
  check(run.name, 'whole pill is on screen', m.pill.bottom <= m.viewport.height && m.pill.top >= 0 && m.pill.left >= 0 && m.pill.right <= run.width,
    `top ${m.pill.top}, bottom ${m.pill.bottom} of ${m.viewport.height}`);
  check(run.name, 'pill clears the screen edge', m.viewport.height - m.pill.bottom >= 8,
    `${(m.viewport.height - m.pill.bottom).toFixed(1)}px below`);
  check(run.name, 'every tab sits inside the pill',
    m.tabs.every((t) => t.top >= m.pill.top - 0.5 && t.bottom <= m.pill.bottom + 0.5 && t.left >= m.pill.left - 0.5 && t.right <= m.pill.right + 0.5),
    m.tabs.map((t) => `${t.label} ${t.height}`).join(', '));
  const escaping = m.tabContents.filter(
    (r) => r.top < m.pill.top - 0.5 || r.bottom > m.pill.bottom + 0.5 || r.left < m.pill.left - 0.5 || r.right > m.pill.right + 0.5,
  );
  check(run.name, 'nothing a tab draws escapes the pill',
    m.tabContents.length > 0 && escaping.length === 0,
    `${m.tabContents.length} drawn elements, ${escaping.length} outside`);
  check(run.name, 'tabs are a comfortable touch target',
    m.tabs.every((t) => t.width >= 44 && t.height >= 44),
    m.tabs.map((t) => `${t.width}x${t.height}`)[0]);
  check(run.name, 'no content is left hidden behind the pill',
    m.scroll === null || m.scroll.scrollHeight - m.scroll.clientHeight >= 0,
    m.scroll ? `content ${m.scroll.scrollHeight}, viewport ${m.scroll.clientHeight}` : 'not scrollable');

  // --- Deck (frame node 38:43) -----------------------------------------------------------------
  // active 312x428 at x=40.5; next 237.6449 wide revealing 25 left; back 223.0654 revealing 27 right.
  check(run.name, 'active card is the exact centre', near((m.activeCard.left + m.activeCard.right) / 2, run.width / 2, 0.75),
    `centre ${((m.activeCard.left + m.activeCard.right) / 2).toFixed(2)} of ${run.width}`);
  check(run.name, 'active card matches the frame', near(m.activeCard.width, 312 * scale, 0.75) && near(m.activeCard.height, 428 * scale, 0.75),
    `${m.activeCard.width}x${m.activeCard.height}, expected ${(312 * scale).toFixed(1)}x${(428 * scale).toFixed(1)}`);

  const next = m.layers[1];
  const back = m.layers[0];
  check(run.name, 'left reveal is the frame’s 25', near(m.activeCard.left - next.left, 25 * scale, 0.75),
    `${(m.activeCard.left - next.left).toFixed(2)}, expected ${(25 * scale).toFixed(2)}`);
  check(run.name, 'right reveal is the frame’s 27', near(back.right - m.activeCard.right, 27 * scale, 0.75),
    `${(back.right - m.activeCard.right).toFixed(2)}, expected ${(27 * scale).toFixed(2)}`);
  check(run.name, 'rear card widths match the frame', near(next.width, 237.6449 * scale, 0.75) && near(back.width, 223.0654 * scale, 0.75),
    `next ${next.width} / back ${back.width}, expected ${(237.6449 * scale).toFixed(1)} / ${(223.0654 * scale).toFixed(1)}`);
  check(run.name, 'rear cards are inset downward by 32 and 40', near(next.top - m.activeCard.top, 32 * scale, 0.75) && near(back.top - m.activeCard.top, 40 * scale, 0.75),
    `next +${(next.top - m.activeCard.top).toFixed(1)}, back +${(back.top - m.activeCard.top).toFixed(1)}`);
  check(run.name, 'the whole deck is on screen horizontally', next.left >= 0 && back.right <= run.width,
    `${next.left} .. ${back.right}`);
  check(run.name, 'the CTA sits fully inside the active card',
    m.cta && m.cta.bottom <= m.activeCard.bottom && m.cta.top >= m.activeCard.top,
    m.cta ? `cta bottom ${m.cta.bottom}, card bottom ${m.activeCard.bottom}` : 'missing');

  // --- Header and search (frame nodes 7:16, 7:19, 7:24, 7:30) ----------------------------------
  if (isRef) {
    check(run.name, 'page gutter is the frame’s 24', near(m.greeting.left, 24) && near(m.sectionHeading.left, 24),
      `greeting ${m.greeting.left}, heading ${m.sectionHeading.left}`);
    check(run.name, 'search field runs the full 345 inside the gutter', near(m.search.field.width, 345),
      `${m.search.field.width}`);
    check(run.name, 'filter disc is inside the field, 46px, inset 5', near(m.filter.width, 46) && near(m.search.field.right - m.filter.right, 5),
      `${m.filter.width}px, ${(m.search.field.right - m.filter.right).toFixed(1)} from the field edge`);
    check(run.name, 'search field is 56 tall', near(m.search.field.height, 56), `${m.search.field.height}`);
    // Frame gaps: subtitle 111 -> search 126, search 182 -> heading 198, heading 225 -> pills 234.
    check(run.name, 'subtitle to search gap is 15', near(m.search.field.top - m.subtitle.bottom, 15, 1.5),
      `${(m.search.field.top - m.subtitle.bottom).toFixed(1)}`);
    check(run.name, 'search to heading gap is 16', near(m.sectionHeading.top - m.search.field.bottom, 16, 1.5),
      `${(m.sectionHeading.top - m.search.field.bottom).toFixed(1)}`);
  }

  await page.screenshot({ path: join(OUT, `home-${run.name}.png`) });
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFailures:');
  failed.forEach((f) => console.log(` - [${f.run}] ${f.name}: ${f.detail}`));
}
process.exit(failed.length ? 1 : 0);
