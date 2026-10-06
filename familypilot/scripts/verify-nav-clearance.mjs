/**
 * Nothing important may sit under the floating navigation, on any screen that scrolls, at any phone size.
 *
 * For every tab screen, at the four phone widths and at the shorter heights a phone browser leaves once its own toolbars are
 * showing: scroll to the very end, then find the lowest text and the lowest control and check both end above the bar, and that
 * a tap on that control would reach it rather than the bar. Sheets are checked too: their primary action must be the top thing at
 * its own centre.
 *
 * Measured from the DOM, not from arithmetic. A phone's real safe-area inset cannot be injected into desktop Chromium, so the
 * home-indicator clearance itself is covered by `safe-area-footer.test.ts` and the manual device pass, and is stated as such.
 *
 * Fixture only. Usage: node scripts/verify-nav-clearance.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://127.0.0.1:4176';

const PROFILE = {
  id: 'family-nav',
  parentName: 'Aidan',
  familyName: 'Shaw',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'p2', name: 'Ellie', role: 'parent', relationship: 'partner', dateOfBirth: '1991-02-02', age: 35 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 2, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2025-05-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy'] },
  ],
  homeLocation: 'Bushey, Hertfordshire', homeLatitude: 51.643, homeLongitude: -0.36,
  budgetTier: 'moderate', maxDriveMinutes: 90, completionPercent: 90,
  vehicle: null, pushchair: 'Bugaboo Butterfly', travelCot: null, memberships: [],
  routines: [{ id: 'nap-c2-a', label: 'Ozzie’s nap', kind: 'nap', time: '12:30', durationMinutes: 90, atHome: true, childId: 'c2' }],
  mustHaveFacilities: [],
};
const GUESTS = [
  { id: 'guest-hannah', label: 'Hannah', area: 'E17', latitude: 51.59, longitude: -0.02, ages: [], maxDriveMinutes: 120, budgetTier: 'moderate', pushchair: false, required: [], routines: [] },
];

const SIZES = [[360, 800], [390, 844], [393, 852], [430, 932], [360, 640], [390, 700], [393, 740]];
const TABS = [['/', 'Home'], ['/explore', 'Explore'], ['/trips', 'Plans'], ['/saved', 'Saved'], ['/profile', 'Profile']];

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

async function scrollToEnd(page, width, height) {
  await page.mouse.move(width / 2, height / 2);
  let last = -1;
  let stable = 0;
  // A long list renders in batches, so "no movement" must hold for several checks before it is the end.
  for (let i = 0; i < 80 && stable < 4; i += 1) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(220);
    const top = await page.evaluate(() => [...document.querySelectorAll('div')].reduce((m, el) => Math.max(m, el.scrollTop), 0));
    stable = top === last ? stable + 1 : 0;
    last = top;
  }
  await page.waitForTimeout(350);
  return last;
}

/** Lowest visible text and lowest visible control, and what is on top at that control's centre. */
async function measure(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[role="tablist"]');
    const navTop = nav?.getBoundingClientRect().top ?? null;
    let textBottom = 0;
    let textLabel = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent?.trim()) continue;
      if (nav && nav.contains(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.height > 0 && r.top < window.innerHeight && r.bottom <= window.innerHeight + 1 && r.bottom > textBottom) {
        textBottom = r.bottom;
        textLabel = n.textContent.trim().slice(0, 40);
      }
    }
    let control = null;
    for (const el of document.querySelectorAll('[role="button"], a, button, input, [role="switch"]')) {
      if (nav && nav.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0 || r.top >= window.innerHeight || r.bottom > window.innerHeight + 1) continue;
      if (!control || r.bottom > control.bottom) control = { bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40), el };
    }
    let reachable = true;
    if (control) {
      const top = document.elementFromPoint(control.cx, Math.min(control.cy, window.innerHeight - 1));
      reachable = Boolean(top && (control.el.contains(top) || top.contains(control.el)));
    }
    return { navTop, textBottom, textLabel, controlBottom: control?.bottom ?? 0, controlLabel: control?.label ?? '', reachable };
  });
}

const browser = await chromium.launch(launchOptions);
for (const [width, height] of SIZES) {
  const label = `${width}x${height}`;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-01-13T07:30:00'));
  await page.addInitScript(
    ({ profile, guests }) => {
      localStorage.setItem('familypilot-family-v1', JSON.stringify({ state: { profile, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 1 }));
      localStorage.setItem('familypilot-planning-v1', JSON.stringify({ state: { families: guests, options: { date: '2026-01-13', leaveAt: '10:00', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' }, saved: [], savedDays: [] }, version: 0 }));
    },
    { profile: PROFILE, guests: GUESTS },
  );

  for (const [path, name] of TABS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2200);
    const scrolled = await scrollToEnd(page, width, height);
    const m = await measure(page);
    const ok = m.navTop !== null && m.textBottom <= m.navTop - 4 && m.controlBottom <= m.navTop - 4 && m.reachable;
    check(
      `${label}: ${name} to the end clears the navigation`,
      ok,
      `scrolled ${Math.round(scrolled)}px; text "${m.textLabel}" ends ${Math.round(m.textBottom)}, control "${m.controlLabel}" ends ${Math.round(m.controlBottom)}, nav starts ${m.navTop === null ? 'n/a' : Math.round(m.navTop)}${m.reachable ? '' : ', control covered'}`,
    );
  }

  // The filter sheet's own action must be on top at its centre, not under the bar.
  await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.getByText(/^Filters/).first().click().catch(() => {});
  await page.waitForTimeout(700);
  const sheetAction = await page.evaluate(() => {
    const button = [...document.querySelectorAll('[role="button"]')].find((el) => /show results/i.test(el.textContent ?? '') || /show results/i.test(el.getAttribute('aria-label') ?? ''));
    if (!button) return null;
    const r = button.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { bottom: r.bottom, vh: window.innerHeight, onTop: Boolean(top && (button.contains(top) || top.contains(button))) };
  });
  check(`${label}: the filter sheet's action is whole on screen and on top`, Boolean(sheetAction && sheetAction.onTop && sheetAction.bottom <= sheetAction.vh + 1), sheetAction ? `bottom ${Math.round(sheetAction.bottom)} of ${sheetAction.vh}, on top: ${sheetAction.onTop}` : 'no sheet action');
  await context.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
