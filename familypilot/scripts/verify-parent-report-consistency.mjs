/**
 * A fact a parent has contradicted must not be shown as confirmed and then taken back, in a real browser, against the local
 * fixture (zero spend: every provider host is aborted and fails the run).
 *
 * Parent reports are read after the venue's own facts are on screen. For a venue with a recent report that used to mean: the
 * venue's "baby changing: yes" drawn as confirmed with a tick, and up to three seconds later "needs rechecking". The detail now
 * carries `hasRecentParentReports`; only when it is true does Family Fit show a neutral "Checking recent parent reports" state
 * until the reports arrive. This opens the fixture's "Confirmed Facts Gardens" (baby changing: yes) with a parent report that
 * contradicts it, delayed by a chosen time, and samples the screen every 50 ms.
 *
 *   A  flag true,  reports in 2 s      never a confirmed baby-changing line; "checking" first; then "needs rechecking"
 *   B  flag true,  reports in 5 s      "checking" ends at the 3 s ceiling and the venue's own facts are shown (the documented fallback)
 *   C  flag true,  reports fail        same ceiling, then the venue's own facts
 *   D  flag false, reports in 2 s      no "checking" ever; the page is not held; the report still corrects it when it arrives
 *   E  flag absent (older payload)     same as D
 *
 * Latencies are SIMULATED, and the contradicting report is injected into the response: no real parent report exists.
 *
 * usage: node scripts/verify-parent-report-consistency.mjs [baseUrl] [--width 393]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4173';
const wIdx = args.indexOf('--width');
const WIDTH = wIdx >= 0 ? Number(args[wIdx + 1]) : 393;
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|overpass\.kumi|openstreetmap|tile\.osm|tfl\.gov)\.[a-z.]+$|overpass/i;
const VENUE = 'fp-google-FIXTUREedgeRich';

const seed = {
  state: {
    profile: {
      id: 'family-demo', parentName: 'Aidan', familyName: 'Shaw',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
        { id: 'c1', name: 'Ozzie', role: 'child', dateOfBirth: '2026-08-01', dobKnown: true, age: 0, ageMonths: 2 },
      ],
      homeLocation: 'Bushey', homeLatitude: 51.643, homeLongitude: -0.36, completionPercent: 80,
      memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 2,
};

const today = new Date().toISOString().slice(0, 10);
const field = (label, over = {}) => ({ label, question: '', status: 'source_checked', value: 'yes', sourceUrl: 'https://example.org/visit', checkedAt: today, reportCount: 0, lastReportedAt: null, observations: [], priority: 9, confidence: { basis: 'official', authoritative: true, influencesFit: false, label: 'Confirmed', families: 0 }, ...over });
const CONTRADICTED = {
  fields: {
    babyChanging: field('Baby changing', { status: 'needs_recheck', value: 'yes', reportCount: 3, observations: ['no'], agreement: 'corroborated', confidence: { basis: 'needs_recheck', authoritative: false, influencesFit: true, label: 'Needs rechecking', families: 3 } }),
    toilets: field('Toilets'), parking: field('Parking'), cafe: field('Café', { value: 'unknown', status: 'unknown', sourceUrl: null, checkedAt: null }), pushchair: field('Buggy access', { value: 'unknown', status: 'unknown', sourceUrl: null, checkedAt: null }),
  },
  questions: [],
};

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];
const failures = [];
const check = (ok, message) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`); if (!ok) failures.push(message); return ok; };

async function run(label, { flag, feedbackMs, feedbackFails = false }) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: Math.round(WIDTH * 852 / 393) }, deviceScaleFactor: 1 });
  let slowOn = false;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (LIVE_PROVIDER.test(url.hostname)) { blocked.push(url.hostname); return route.abort(); }
    if (slowOn && url.pathname === '/api/places/detail') {
      const response = await route.fetch();
      const body = await response.json();
      if (flag !== 'absent') body.hasRecentParentReports = flag;
      return route.fulfill({ response, json: body });
    }
    if (slowOn && url.pathname === '/api/planning/feedback' && url.searchParams.get('venueId')) {
      await new Promise((r) => setTimeout(r, feedbackMs));
      if (feedbackFails) return route.fulfill({ status: 500, json: { error: 'down' } });
      return route.fulfill({ status: 200, json: CONTRADICTED });
    }
    return route.continue().catch(() => {});
  });
  await context.addInitScript((s) => { if (!window.localStorage.getItem('familypilot-family-v1')) window.localStorage.setItem('familypilot-family-v1', JSON.stringify(s)); }, seed);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  slowOn = true;
  const started = Date.now();
  await page.goto(`${BASE}/venue/${VENUE}`, { waitUntil: 'commit' });

  const samples = [];
  while (Date.now() - started < Math.max(feedbackMs, 3200) + 1800) {
    const s = await page.evaluate(() => {
      const el = (id) => document.querySelector(`[data-testid="${id}"]`);
      const card = el('family-match-card');
      const cardText = card ? card.innerText : '';
      const rect = (e) => (e ? Math.round(e.getBoundingClientRect().height) : null);
      return {
        checkingCard: Boolean(el('family-fit-checking')), checkingBadge: Boolean(el('family-fit-checking-badge')),
        card: Boolean(card), cardText, cardHeight: rect(card) ?? rect(el('family-fit-checking')),
        confirmsBabyChanging: /baby changing/i.test(cardText) && !/needs rechecking/i.test(cardText),
        recheck: /baby changing needs rechecking/i.test(cardText),
        name: Boolean(el('venue-name')), plan: Boolean(el('venue-create-plan')),
        checkingText: (el('family-fit-checking') || { innerText: '' }).innerText,
      };
    }).catch(() => null);
    if (s) samples.push({ t: Date.now() - started, ...s });
    await page.waitForTimeout(50);
  }
  await context.close();
  return samples;
}

const firstT = (samples, pred) => samples.find(pred)?.t ?? null;
const lastT = (samples, pred) => [...samples].reverse().find(pred)?.t ?? null;

// A
{
  const s = await run('A', { flag: true, feedbackMs: 2000 });
  const confirmed = s.filter((x) => x.confirmsBabyChanging);
  check(confirmed.length === 0, `A: the contradicted fact is never shown as confirmed (${confirmed.length} of ${s.length} samples; first confirmed ${firstT(s, (x) => x.confirmsBabyChanging)})`);
  const checkingFrom = firstT(s, (x) => x.checkingCard);
  const checkingTo = lastT(s, (x) => x.checkingCard);
  check(checkingFrom !== null, `A: Family Fit shows the neutral "checking" state (from ${checkingFrom} ms)`);
  check(checkingTo !== null && checkingTo >= 1500 && checkingTo <= 2600, `A: it stays until the reports arrive (last seen ${checkingTo} ms; reports at 2000)`);
  check(s.some((x) => x.checkingBadge), 'A: the badge beside the name is neutral too');
  const text = s.find((x) => x.checkingCard)?.checkingText ?? '';
  check(!/good|excellent|possible|poor|baby changing|suits|✓/i.test(text) && /Checking recent parent reports/.test(text), `A: the neutral state claims nothing ("${text.replace(/\s+/g, ' ').trim()}")`);
  check(s.some((x) => x.recheck), 'A: once the reports arrive the line says "Baby changing needs rechecking"');
  check(s.filter((x) => x.card && x.recheck).length > 0 && lastT(s, (x) => x.checkingCard) < firstT(s, (x) => x.recheck) + 200, 'A: the swap is direct: checking ends as the corrected card appears');
  const name = firstT(s, (x) => x.name);
  check(name !== null && name < 1500, `A: the page itself is not held: the venue name is on screen at ${name} ms`);
  const hChecking = s.find((x) => x.checkingCard)?.cardHeight;
  const hFinal = [...s].reverse().find((x) => x.card)?.cardHeight;
  console.log(`INFO  A: card height while checking ${hChecking} pt, corrected ${hFinal} pt (the placeholder keeps at least 200)`);
  check(hChecking >= 200 && Math.abs(hChecking - hFinal) <= 160, 'A: the placeholder is within a card’s height of the final card (no large jump)');
}
// B
{
  const s = await run('B', { flag: true, feedbackMs: 5000 });
  const to = lastT(s, (x) => x.checkingCard);
  check(to !== null && to >= 2700 && to <= 3700, `B: "checking" ends at the 3 second ceiling (last seen ${to} ms), never waits for a 5 s read`);
  check(s.some((x) => x.t > 3800 && x.card && x.confirmsBabyChanging), 'B: after the ceiling the venue’s own facts are shown (the documented fallback)');
}
// C
{
  const s = await run('C', { flag: true, feedbackMs: 800, feedbackFails: true });
  const to = lastT(s, (x) => x.checkingCard);
  check(to !== null && to <= 3700, `C: a failing report read ends "checking" (last seen ${to} ms)`);
  check(s.some((x) => x.card && x.confirmsBabyChanging), 'C: then the venue’s own facts are shown, never an empty card');
}
// D and E
for (const [label, flag] of [['D', false], ['E', 'absent']]) {
  const s = await run(label, { flag, feedbackMs: 2000 });
  check(!s.some((x) => x.checkingCard || x.checkingBadge), `${label}: no "checking" state ever shows without a recent-reports flag`);
  const cardAt = firstT(s, (x) => x.card);
  check(cardAt !== null && cardAt < 1500, `${label}: Family Fit is on screen at ${cardAt} ms, not held for the reports`);
  check(s.some((x) => x.recheck), `${label}: a report that arrives still corrects the line (unchanged behaviour)`);
}

await browser.close();
check(blocked.length === 0, `no provider host was contacted${blocked.length ? ': ' + [...new Set(blocked)].join(', ') : ''}`);
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nparent-report consistency: every check passed');
process.exit(failures.length ? 1 : 0);
