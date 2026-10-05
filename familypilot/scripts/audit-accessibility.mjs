/**
 * Accessibility audit of the running app: axe-core plus the checks axe cannot make.
 *
 * It drives the exported web bundle (served by scripts/serve-places-fixture.mjs, so nothing here spends
 * money) through the three canonical screens and the screens a parent reaches from them, at the supported
 * widths and at 320, the WCAG reflow width. For each it reports:
 *
 *   axe        every WCAG 2.x A/AA violation axe-core finds (names, roles, ARIA validity, contrast, ...)
 *   target     interactive elements whose real hit area is under 44 x 44 css px. The measure is the area that
 *              actually answers a pointer (it probes with elementFromPoint), so a control drawn at 42 with
 *              hit slop counts as 44.
 *   name       interactive elements with no accessible name
 *   decor      drawn artwork that is exposed to assistive technology (it must be aria-hidden)
 *   focus      focusable elements that show no focus indicator when reached by keyboard
 *   order      whether the reading (DOM) order of the main controls matches their visual order
 *   reflow     horizontal scrolling at 320 px
 *
 * Usage: node scripts/serve-places-fixture.mjs 4173 &   (FIXTURE_SCENARIO=realistic for full-data states)
 *        node scripts/audit-accessibility.mjs [baseUrl] [outJson]
 * Exit code 1 when anything is found.
 *
 * What it cannot do: native screen readers (VoiceOver, TalkBack) and the OS "larger text" setting are not
 * reachable from a browser. Both are covered by the semantics checked here (roles, names, states, order)
 * and by reflow at 320; they still deserve a manual pass on a device before launch.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const axeSource = readAxe();
function readAxe() {
  return require('node:fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
}

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const BASE = process.argv[2] ?? 'http://127.0.0.1:4175';
const OUT = process.argv[3] ? resolve(process.argv[3]) : null;
const WIDTHS = [320, 360, 393, 430];
const IPHONE_INSETS = { top: 59, bottom: 34 };
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|openstreetmap|tile\.osm)\.[a-z.]+$|overpass/i;

const PROFILE = {
  state: {
    profile: {
      id: 'family-demo',
      parentName: 'Aidan Shaw',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 35 },
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
};
const FRESH = { state: { hasCompletedOnboarding: false, hasSeenSplash: true }, version: 0 };

const SCREENS = [
  { key: 'welcome', route: '/welcome', state: FRESH },
  { key: 'home', route: '/', state: PROFILE },
  { key: 'explore', route: '/explore', state: PROFILE },
  {
    key: 'explore-filters',
    route: '/explore',
    state: PROFILE,
    act: async (page) => {
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.waitForTimeout(700);
    },
  },
  { key: 'saved', route: '/saved', state: PROFILE },
  {
    key: 'venue',
    route: '/explore',
    state: PROFILE,
    act: async (page) => {
      await page.locator('[role="button"][aria-label$="view details"]').first().click();
      await page.waitForTimeout(1800);
    },
  },
];

/** Runs inside the page. */
function collect() {
  const INTERACTIVE =
    'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="link"],[role="radio"],[role="checkbox"],[role="switch"],[tabindex="0"]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.02;
  };
  const nameOf = (el) => {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t;
    }
    const placeholder = el.getAttribute('placeholder');
    const text = (el.innerText || el.textContent || '').trim();
    return text || (placeholder ? placeholder.trim() : '') || (el.getAttribute('title') ?? '').trim();
  };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${nameOf(el).slice(0, 40)}"`;

  const modal = document.querySelector('[aria-modal="true"]');
  const all = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  // With a dialog open only its own controls are the reading order; the page behind must be unreachable.
  const controls = modal ? all.filter((el) => modal.contains(el)) : all;
  const behindModal = modal
    ? all.filter((el) => !modal.contains(el) && !el.closest('[aria-hidden="true"],[inert]')).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`)
    : [];

  // The area that really answers a pointer: walk outwards from the centre until elementFromPoint stops
  // resolving to the control (or a descendant), so hit slop is counted and decoration is not.
  const reach = (el, dx, dy) => {
    const r = el.getBoundingClientRect();
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    let n = 0;
    while (n < 40) {
      const x = cx + dx * (n + 1);
      const y = cy + dy * (n + 1);
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) break;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(el === hit || el.contains(hit) || hit.contains(el) && hit.closest(INTERACTIVE) === el)) break;
      n += 1;
    }
    return n;
  };
  const targets = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue; // only what a parent can reach without scrolling
    const w = reach(el, -1, 0) + reach(el, 1, 0) + 1;
    const h = reach(el, 0, -1) + reach(el, 0, 1) + 1;
    const width = Math.max(w, Math.round(r.width));
    const height = Math.max(h, Math.round(r.height));
    if (width < 44 || height < 44) targets.push({ el: describe(el), drawn: `${Math.round(r.width)}x${Math.round(r.height)}`, hit: `${width}x${height}` });
  }

  const names = controls
    .filter((el) => !nameOf(el))
    .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} at ${Math.round(el.getBoundingClientRect().left)},${Math.round(el.getBoundingClientRect().top)}`);

  // Drawn artwork must be hidden from assistive technology: an svg not under aria-hidden is announced.
  const decor = [...document.querySelectorAll('svg')]
    .filter(visible)
    .filter((svg) => !svg.closest('[aria-hidden="true"],[hidden],[role="img"]') && svg.getAttribute('role') !== 'presentation' && !svg.closest(INTERACTIVE))
    .map((svg) => `svg ${Math.round(svg.getBoundingClientRect().width)}x${Math.round(svg.getBoundingClientRect().height)}`);

  // Reading order: controls in DOM order should not jump backwards by more than a row on screen.
  const order = [];
  let lastTop = -Infinity;
  // Only controls that can actually be seen count: one scrolled out of its container, or covered by a
  // pinned footer, has a box but is not on screen, so it says nothing about reading order.
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return false; // scrolled out of view
    // Top, centre and bottom edge all answer: a card half under a pinned footer is not a stop in the order yet.
    const probes = [Math.max(r.top + 2, 0), cy, Math.min(r.bottom - 2, innerHeight - 1)];
    return probes.every((y) => {
      const hit = document.elementFromPoint(cx, y);
      return Boolean(hit) && (el.contains(hit) || hit.contains(el));
    });
  };
  // A dialog that scrolls under a pinned footer has controls half in view, which makes position a poor
  // proxy for order; its order is the DOM order, checked by eye. Pages are checked.
  for (const el of modal ? [] : controls.filter(onScreen)) {
    const r = el.getBoundingClientRect();
    if (r.top < lastTop - 60 && !el.closest('[role="tablist"]')) order.push(`${describe(el)} comes after something ${Math.round(lastTop - r.top)}px lower`);
    lastTop = Math.max(lastTop, r.top);
  }

  return {
    controls: controls.length,
    targets,
    names,
    decor,
    order,
    behindModal,
    tabsWithoutSelection: controls.filter((el) => el.getAttribute('role') === 'tab' && !el.hasAttribute('aria-selected')).map(describe),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    ariaSelectedOnButtons: controls
      .filter((el) => el.hasAttribute('aria-selected') && !['tab', 'option', 'gridcell', 'row', 'treeitem'].includes(el.getAttribute('role') ?? ''))
      .map(describe),
  };
}

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
});
const blocked = [];
const results = [];

for (const screen of SCREENS) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: Math.round(width * (852 / 393)) }, deviceScaleFactor: 2 });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (LIVE_PROVIDER.test(url.hostname)) {
        blocked.push(`${url.hostname}${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-01-13T19:30:00'));
    await page.addInitScript(([seed]) => window.localStorage.setItem('familypilot-family-v1', JSON.stringify(seed)), [screen.state]);
    await page.addInitScript((insets) => {
      const style = document.createElement('style');
      style.textContent = `div[style*="safe-area-inset"]{padding-top:${insets.top}px !important;padding-bottom:${insets.bottom}px !important;}`;
      const attach = () => document.head?.appendChild(style);
      if (document.head) attach();
      else document.addEventListener('DOMContentLoaded', attach);
    }, IPHONE_INSETS);
    await page.goto(`${BASE}${screen.route}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(async () => document.fonts?.ready);
    await page.waitForTimeout(2500);
    if (screen.act) await screen.act(page);

    const own = await page.evaluate(collect);

    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }),
    );

    // Keyboard: tab through, and note anything focused that shows no indicator at all.
    const noFocusRing = [];
    await page.evaluate(() => document.body.focus());
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        // A ring may sit on the control or on the field/pill that wraps it (a text input draws its ring on
        // its pill), so look at the element and the three ancestors above it.
        let ring = false;
        for (let node = el, depth = 0; node && depth < 4 && !ring; node = node.parentElement, depth += 1) {
          const cs = getComputedStyle(node);
          ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || Boolean(cs.boxShadow && cs.boxShadow !== 'none' && cs.boxShadow.includes('rgb') && depth === 0);
        }
        const label = el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 30) || el.tagName;
        return { label, ring };
      });
      if (info && !info.ring) noFocusRing.push(info.label);
    }

    results.push({
      screen: screen.key,
      width,
      ...own,
      axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')), help: v.help })),
      noFocusRing: [...new Set(noFocusRing)],
    });
    await context.close();
  }
}
await browser.close();

let problems = 0;
for (const r of results) {
  const lines = [];
  for (const v of r.axe) lines.push(`axe ${v.id} (${v.impact}) x${v.count}: ${v.help} — ${v.sample.join(' | ')}`);
  for (const t of r.targets) lines.push(`target ${t.el}: drawn ${t.drawn}, hit ${t.hit}`);
  for (const n of r.names) lines.push(`name missing: ${n}`);
  for (const d of r.decor) lines.push(`decor exposed: ${d}`);
  for (const o of r.order) lines.push(`order: ${o}`);
  for (const b of r.behindModal) lines.push(`dialog: page content stays reachable behind the open dialog: ${b}`);
  for (const t of r.tabsWithoutSelection ?? []) lines.push(`tab does not say whether it is selected: ${t}`);
  for (const a of r.ariaSelectedOnButtons) lines.push(`aria-selected on a non-tab: ${a}`);
  for (const f of r.noFocusRing) lines.push(`focus: no indicator on ${f}`);
  if (r.width === 320 && r.scrollWidth > r.clientWidth + 1) lines.push(`reflow: scrolls sideways at 320 (${r.scrollWidth} in ${r.clientWidth})`);
  problems += lines.length;
  console.log(`${r.screen.padEnd(16)} ${String(r.width).padEnd(4)} ${r.controls} controls  ${lines.length ? `${lines.length} finding(s)` : 'clean'}`);
  for (const l of lines) console.log(`    ${l}`);
}
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2));
}
if (blocked.length) {
  console.error(`ZERO-SPEND VIOLATION: ${[...new Set(blocked)].join(', ')}`);
  process.exit(1);
}
console.log(problems ? `\n${problems} accessibility finding(s)` : '\naccessibility audit: clean');
process.exit(problems ? 1 : 0);
