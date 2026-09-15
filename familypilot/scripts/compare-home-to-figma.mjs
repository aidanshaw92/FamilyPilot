/**
 * Prints an element-by-element diff of the rendered Home screen against the locked Figma frame
 * "01 — Home", in the frame's own coordinates.
 *
 * The frame is a 393 x 852 artboard that includes a status bar and a home indicator, so it is only
 * comparable to a render with real device insets — a browser reports zero for both and every y
 * lands ~42px high. Insets are therefore emulated here by default.
 *
 * Usage: node scripts/compare-home-to-figma.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const IPHONE_INSETS = { top: 59, bottom: 34 };

/** Read straight off the frame's nodes. x, y, w, h on the 393 x 852 artboard. */
const FIGMA = {
  'greeting (7:16)': [24, 58, 244, 31],
  'subtitle (7:17)': [24, 94, 162, 17],
  'avatar (7:18)': [323, 61, 46, 46],
  'search field (7:19)': [24, 126, 345, 56],
  'search icon (7:20)': [46, 144, 22, 22],
  'placeholder (7:23)': [80, 145, 205, 19],
  'filter disc (7:24)': [318, 131, 46, 46],
  'section heading (7:30)': [24, 198, 165, 27],
  'pill 1 — For you (7:32)': [24, 234, 92, 44],
  'pill 2 — Indoor (7:34)': [126, 234, 85, 44],
  'pill 3 — Outdoor (7:36)': [221, 234, 98, 44],
  'active card (8:4)': [40.5, 307, 312, 428],
  'next card (40:2)': [15.5, 339, 237.6449, 326],
  'back card (40:22)': [156.4346, 347, 223.0654, 306],
  'bottom nav (9:2)': [62, 764, 270, 58],
};

const FAMILY_STATE = {
  state: {
    profile: {
      id: 'family-demo',
      parentName: 'Aidan Shaw',
      members: [{ id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2019-01-01', age: 6 }],
      homeLocation: 'London',
      budgetTier: 'moderate',
      maxDriveMinutes: 60,
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

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
const page = await context.newPage();
// The frame is drawn in the evening, so the greeting string matches.
await page.clock.setFixedTime(new Date('2026-01-15T19:30:00'));
await page.addInitScript((seed) => {
  window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed));
}, FAMILY_STATE);
await page.addInitScript((insets) => {
  const style = document.createElement('style');
  style.textContent = `div[style*="safe-area-inset"]{padding-top:${insets.top}px !important;padding-bottom:${insets.bottom}px !important;}`;
  const attach = () => document.head?.appendChild(style);
  if (document.head) attach();
  else document.addEventListener('DOMContentLoaded', attach);
}, IPHONE_INSETS);

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[role="tab"]', { timeout: 30000 });
await page.waitForTimeout(2500);

const measured = await page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [+r.left.toFixed(2), +r.top.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)];
  };
  const leaf = (text) =>
    [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && (el.textContent ?? '').trim() === text,
    );
  const startsWith = (p) =>
    [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && (el.textContent ?? '').trim().startsWith(p),
    );
  const fontOf = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return `${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(',')[0]}`;
  };

  const card = document.querySelector('[role="button"][aria-label$=", see more"]');
  const deck = card?.parentElement?.parentElement ?? null;
  const layers = deck ? [...deck.children] : [];
  const search = [...document.querySelectorAll('input')].find((el) =>
    (el.value || el.placeholder || '').startsWith('Search'),
  );
  const pills = [...document.querySelectorAll('[role="button"][aria-selected], [role="button"]')]
    .filter((el) => ['For you', 'Indoor', 'Outdoor'].includes(el.getAttribute('aria-label') ?? ''))
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const greeting = startsWith('Good ');
  const heading = leaf('Select your plan');

  return {
    boxes: {
      'greeting (7:16)': box(greeting),
      'subtitle (7:17)': box(leaf('What shall we do today?')),
      'avatar (7:18)': box(document.querySelector('[aria-label="Your family profile"]')),
      'search field (7:19)': box(search?.closest('[role="button"]')),
      'search icon (7:20)': box(search?.closest('[role="button"]')?.firstElementChild),
      'placeholder (7:23)': box(search),
      'filter disc (7:24)': box(document.querySelector('[role="button"][aria-label="Filters"]')),
      'section heading (7:30)': box(heading),
      'pill 1 — For you (7:32)': box(pills[0]),
      'pill 2 — Indoor (7:34)': box(pills[1]),
      'pill 3 — Outdoor (7:36)': box(pills[2]),
      'active card (8:4)': box(card),
      'next card (40:2)': box(layers[1]),
      'back card (40:22)': box(layers[0]),
      'bottom nav (9:2)': box(tabs[0]?.parentElement),
    },
    fonts: {
      greeting: fontOf(greeting),
      subtitle: fontOf(leaf('What shall we do today?')),
      heading: fontOf(heading),
      pill: fontOf(pills[0]?.querySelector('div')),
      placeholder: search ? `${getComputedStyle(search).fontSize} ${getComputedStyle(search).fontFamily.split(',')[0]}` : null,
      cardTitle: fontOf([...(card?.querySelectorAll('div') ?? [])].find((e) => e.children.length === 0 && e.textContent && e.textContent.length > 3 && getComputedStyle(e).fontWeight !== '400' && parseFloat(getComputedStyle(e).fontSize) > 20)),
    },
    railText: [...document.querySelectorAll('[role="button"]')]
      .map((el) => el.getAttribute('aria-label'))
      .filter(Boolean),
    documentScrollWidth: document.documentElement.scrollWidth,
  };
});

const label = (n) => n.padEnd(26);
const fmt = (a) => (a ? a.map((v) => String(Math.round(v * 10) / 10).padStart(7)).join(' ') : '   (not found)');

console.log(`\n${label('element')}${'figma  x       y       w       h'.padEnd(36)}  rendered`);
console.log('-'.repeat(110));
let worst = [];
for (const [name, expected] of Object.entries(FIGMA)) {
  const actual = measured.boxes[name];
  console.log(`${label(name)}${fmt(expected)}   |${fmt(actual)}`);
  if (actual) {
    const deltas = expected.map((v, i) => actual[i] - v);
    const max = Math.max(...deltas.map(Math.abs));
    if (max > 2) worst.push({ name, deltas: deltas.map((d) => Math.round(d * 10) / 10), max });
  }
}

console.log('\nDeltas over 2px (rendered - figma), [x, y, w, h]:');
if (worst.length === 0) console.log('  none');
worst.sort((a, b) => b.max - a.max).forEach((w) => console.log(`  ${label(w.name)} ${JSON.stringify(w.deltas)}`));

console.log('\nType:');
Object.entries(measured.fonts).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`));
console.log('\nCategory rail:', measured.railText.filter((l) => !['Filters', 'Your family profile'].includes(l) && !l.includes('see more') && !l.includes('Save') && !l.includes('saved')).join(' · '));
console.log('documentScrollWidth:', measured.documentScrollWidth);

await browser.close();
