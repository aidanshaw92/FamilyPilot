/**
 * The six situations that decide whether the product uses what the pilot collected, driven through the REAL app (the exported
 * web bundle) against the pilot fixture, at the two small-phone widths the design is checked at (360 and 393).
 *
 *   node scripts/verify-pilot-scenarios.mjs <baseUrl> <outDir> <label>
 *
 * Each scenario goes Home/Explore -> Venue Detail -> Create a Plan -> Plan -> Saved plan where the plan builds, records what each
 * screen says, and asserts the things that matter: the right warning appears, it survives into the SAVED plan, nothing is
 * scheduled that should not be, nothing is invented. The output is one JSON of named checks with pass or fail.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILIES } from './pilot-households.mjs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const BASE = process.argv[2];
const OUT = process.argv[3];
const LABEL = process.argv[4] ?? 'run';
const KEY = 'familypilot-family-v1';
const ID = {
  babylon: 'fp-google-ChIJ7_PV980bdkgROekbwOVWVfo', battersea: 'fp-google-ChIJOWBQvA4FdkgRQf5iYYFF1v4', discover: 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk',
  gunnersbury: 'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY', horniman: 'fp-google-ChIJSzwgydoDdkgRndnXVYQGXBI', zoo: 'fp-google-ChIJV_iXMtcadkgRqBI84CY_crE',
  mudchute: 'fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI', nhm: 'fp-google-ChIJPy8Y5kIFdkgRxGSXw4Xjt3s', raf: 'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc', science: 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE',
};
const NAME = { babylon: 'Babylon Park', battersea: 'Battersea Park', discover: 'Discover', gunnersbury: 'Gunnersbury', horniman: 'Horniman', zoo: 'London Zoo', mudchute: 'Mudchute', nhm: 'Natural History Museum', raf: 'Royal Air Force Museum', science: 'Science Museum' };

// The day is Thursday 8 October 2026, 07:30: "tomorrow" is the Natural History Museum's closed day.
const TODAY = '2026-10-08T07:30:00';
const SCENARIOS = [
  { key: '1-strong-match', title: 'A strong match: a school-age family at the RAF Museum', family: 'C-school-age', venue: 'raf', plan: { date: '2026-10-10', start: '11:00', visit: 150 } },
  { key: '2-age-specific', title: 'Age-specific activity: a baby-only family at Discover', family: 'B-baby-only', venue: 'discover', plan: { date: '2026-10-10', start: '11:00', visit: 120 } },
  { key: '3a-pushchair-warning', title: 'Pushchair restriction, family brings a buggy: built, with a prominent warning', family: 'A-preschooler-and-baby', venue: 'discover', plan: { date: '2026-10-10', start: '11:00', visit: 120 } },
  { key: '3b-pushchair-required', title: 'Pushchair restriction, buggy access is a must-have: refused, in the venue\'s words', family: 'H-buggy-required', venue: 'discover', plan: { date: '2026-10-10', start: '11:00', visit: 120 } },
  { key: '4a-hours-conflict-refused', title: 'Hours conflict: London Zoo from 24 October closes at 4pm, Google says 5pm. A visit to 4.30pm is refused', family: 'A-preschooler-and-baby', venue: 'zoo', plan: { date: '2026-10-25', start: '13:00', visit: 210 } },
  { key: '4b-hours-conflict-built', title: 'Hours conflict: a visit that fits is built and says which hours it used', family: 'A-preschooler-and-baby', venue: 'zoo', plan: { date: '2026-10-25', start: '10:30', visit: 150 } },
  { key: '4c-mudchute-monday', title: 'Hours conflict: Google says Mudchute is closed on Mondays, the farm says open', family: 'C-school-age', venue: 'mudchute', plan: { date: '2026-10-12', start: '11:00', visit: 120 } },
  { key: '5-incomplete-price', title: 'Incomplete price: said as not confirmed, never as free', family: 'A-preschooler-and-baby', venue: 'discover', plan: { date: '2026-10-10', start: '11:00', visit: 120 } },
  { key: '6-not-evidenced', title: 'Discoverable but thinly evidenced: Battersea Park for a family needing step-free access and toilets', family: 'D-toddler-mobility-aid', venue: 'battersea', plan: { date: '2026-10-10', start: '11:00', visit: 120 } },
  { key: '7-closed-date', title: 'A closed date: the Natural History Museum tomorrow', family: 'A-preschooler-and-baby', venue: 'nhm', plan: { date: '2026-10-09', start: '11:00', visit: 120 } },
  { key: '7b-closed-today', title: 'A closed day, read on the day: the Natural History Museum on 9 October', family: 'A-preschooler-and-baby', venue: 'nhm', clock: '2026-10-09T07:30:00', plan: { date: '2026-10-10', start: '11:00', visit: 120 } },
];

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const results = [];
const settle = async (page, ms = 1500) => { await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(ms); };
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'));
const noSideScroll = (page) => page.evaluate(() => { const els = [...document.querySelectorAll('*')]; const wide = els.filter((e) => e.scrollWidth > window.innerWidth + 2 && getComputedStyle(e).overflowX === 'visible' && e.getBoundingClientRect().right > window.innerWidth + 2); return { doc: document.documentElement.scrollWidth <= window.innerWidth + 1, overflowing: wide.length }; });

for (const width of [360, 393]) {
  for (const sc of SCENARIOS) {
    const dir = join(OUT, LABEL, String(width), sc.key);
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(sc.clock ?? TODAY));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: JSON.stringify({ state: { profile: FAMILIES[sc.family], hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
    const rec = { width, ...sc, steps: {}, checks: [], errors };
    const check = (name, pass, detail = '') => rec.checks.push({ name, pass: Boolean(pass), detail });
    const id = ID[sc.venue];

    // Explore: the card as a parent sees it
    await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await settle(page, 2400);
    const card = await page.evaluate((name) => { for (let i = 0; i < 40; i += 1) { const el = [...document.querySelectorAll('[role="button"][aria-label$="view details"]')].find((e) => (e.getAttribute('aria-label') || '').startsWith(name)); if (el) return el.innerText.replace(/\s+/g, ' '); const s = [...document.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 50); if (s) s.scrollTop += 400; } return null; }, sc.venue === 'raf' ? 'Royal Air Force' : NAME[sc.venue]);
    rec.steps.exploreCard = card;
    await page.screenshot({ path: join(dir, '1-explore.png') });

    // Venue Detail
    await page.goto(`${BASE}/venue/${id}`, { waitUntil: 'domcontentloaded' }); await settle(page, 2200);
    rec.steps.detail = await text(page);
    rec.steps.detailLayout = await noSideScroll(page);
    await page.screenshot({ path: join(dir, '2-detail-top.png') });
    const practical = page.getByTestId('venue-practical');
    if (await practical.count()) { await practical.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(500); await page.screenshot({ path: join(dir, '3-detail-practical.png') }); }
    rec.steps.practical = (await practical.count()) ? await practical.innerText() : null;

    // Plan, by the link a plan travels as
    const q = new URLSearchParams({ venue: id, date: sc.plan.date, start: sc.plan.start, visit: String(sc.plan.visit), parties: 'mine' });
    await page.goto(`${BASE}/plan?${q}`, { waitUntil: 'domcontentloaded' }); await settle(page, 5200);
    rec.steps.plan = await text(page);
    rec.steps.planLayout = await noSideScroll(page);
    await page.screenshot({ path: join(dir, '4-plan.png'), fullPage: false });
    const built = await page.getByTestId('plan-save').isVisible().catch(() => false);
    rec.steps.built = built;
    if (built) {
      const needs = page.getByTestId('plan-needs-checking');
      rec.steps.needsChecking = (await needs.count()) ? await needs.innerText() : null;
      await page.getByTestId('plan-save').click(); await settle(page, 1800);
      // Through the real "View plan" action to the SAVED plan screen (read back from storage), and again after a reload.
      await page.getByTestId('plan-view-saved').click(); await settle(page, 2200);
      await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page, 2200);
      rec.steps.saved = await text(page);
      rec.steps.savedLayout = await noSideScroll(page);
      rec.steps.savedUrl = page.url().replace(BASE, '');
      const savedNeeds = page.getByTestId('plan-needs-checking');
      rec.steps.savedNeedsChecking = (await savedNeeds.count()) ? await savedNeeds.innerText() : null;
      await page.screenshot({ path: join(dir, '5-saved-plan.png') });
    }

    // ----- what must be true, per scenario
    const D = rec.steps.detail, P = rec.steps.plan, S = rec.steps.saved ?? '';
    check('no script errors', errors.length === 0, errors.join(' | '));
    if (built) check('reached the saved plan screen', /\/saved-plan/.test(rec.steps.savedUrl ?? ''), rec.steps.savedUrl ?? '');
    check('Venue Detail does not scroll sideways', rec.steps.detailLayout.doc && rec.steps.detailLayout.overflowing === 0, JSON.stringify(rec.steps.detailLayout));
    check('Plan does not scroll sideways', rec.steps.planLayout.doc && rec.steps.planLayout.overflowing === 0, JSON.stringify(rec.steps.planLayout));
    if (rec.steps.savedLayout) check('Saved plan does not scroll sideways', rec.steps.savedLayout.doc && rec.steps.savedLayout.overflowing === 0, JSON.stringify(rec.steps.savedLayout));
    if (sc.key === '1-strong-match') {
      check('plan builds', built); check('RAF is a place the plan names', /Royal Air Force|RAF/.test(P)); check('a reliable price is stated: free entry', /Free entry/.test(D)); check('the saved plan reads the same day', /Royal Air Force/.test(S));
    }
    if (sc.key === '2-age-specific') {
      check('Venue Detail says what is there for children, with the ages the venue states', /FOR CHILDREN/i.test(D) && /Baby and toddler sensory space \(ages 0 to 2\)/.test(D), '');
      check('and matches it to the baby', /Covers Noah/.test(D));
    }
    if (sc.key === '3a-pushchair-warning') {
      check('plan builds for a family that only brings a buggy', built);
      check('the venue\'s own sentence is in the prominent block', /not allowed in any storytelling or play areas/.test(rec.steps.needsChecking ?? ''), rec.steps.needsChecking ?? '');
      check('the warning SURVIVES into the saved plan', /not allowed in any storytelling or play areas/.test(rec.steps.savedNeedsChecking ?? ''), rec.steps.savedNeedsChecking ?? 'no saved block');
      check('Venue Detail says it before you go', /BEFORE YOU GO/i.test(D) && /Matters for your family/.test(D));
    }
    if (sc.key === '3b-pushchair-required') {
      check('plan is NOT built', !built);
      check('says why in the venue\'s words', /not allowed in any storytelling or play area/i.test(P), '');
      check('does not call it a pushchair-suitability rating', !/difficult with a pushchair/.test(P));
    }
    if (sc.key === '4a-hours-conflict-refused') {
      check('a visit past the zoo\'s 4pm close is refused', !built && /run past closing|closes at 16:00|closes at 4/i.test(P), P.slice(0, 200));
    }
    if (sc.key === '4b-hours-conflict-built') {
      check('the visit that fits is built', built);
      check('the plan names both sources', /Google lists 10am to 5pm; the venue’s website says 10am to 4pm/.test(rec.steps.needsChecking ?? ''), rec.steps.needsChecking ?? '');
      check('and the saved plan keeps it', /Google lists 10am to 5pm/.test(rec.steps.savedNeedsChecking ?? ''));
    }
    if (sc.key === '4c-mudchute-monday') {
      check('a Monday plan is built although Google lists Monday closed', built);
      check('the disagreement is stated', /Google lists closed; the venue’s website says 9am to 4pm/.test(rec.steps.needsChecking ?? ''), rec.steps.needsChecking ?? '');
    }
    if (sc.key === '5-incomplete-price') {
      const toGetIn = D.split('TO GET IN')[1]?.slice(0, 220) ?? '';
      check('Venue Detail says the price is not confirmed', /Price not confirmed/.test(toGetIn), toGetIn.replace(/\n/g, ' | '));
      check('and never says free or invents a figure', !/Free entry|About £/.test(toGetIn));
    }
    if (sc.key === '6-not-evidenced') {
      check('Detail names what is not confirmed rather than hiding it', /(Not confirmed yet|Still to be confirmed)/.test(D));
      check('the plan (if built) says step-free access and toilets need checking, or the day is refused for a confirmed gap', built ? /Wheelchair and step-free access isn’t confirmed/.test(rec.steps.needsChecking ?? '') && /Toilets aren’t confirmed at Battersea Park, and you said you need them/.test(rec.steps.needsChecking ?? '') : true, rec.steps.needsChecking ?? P.slice(0, 160));
    }
    if (sc.key === '7-closed-date') {
      check('the plan is NOT built', !built);
      check('says the venue is closed that day, in its words', /closed that day|Closed on 9 October/.test(P), P.slice(0, 200));
    }
    if (sc.key === '7b-closed-today') {
      check('the Explore card says Closed today, from the venue\'s reviewed closure and not the weekly hours', /Closed today/.test(rec.steps.exploreCard ?? ''), rec.steps.exploreCard ?? '');
      check('Venue Detail says Closed today', /Closed today/.test(D));
    }
    results.push(rec);
    writeFileSync(join(dir, 'record.json'), JSON.stringify(rec, null, 1));
    await context.close();
    const failed = rec.checks.filter((c) => !c.pass);
    console.log(`${width} ${sc.key.padEnd(28)} built=${String(built).padEnd(5)} ${failed.length ? 'FAIL: ' + failed.map((c) => c.name).join('; ') : 'ok'}`);
  }
}
await browser.close();
writeFileSync(join(OUT, LABEL, 'results.json'), JSON.stringify(results, null, 1));
const bad = results.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `${r.width} ${r.key}: ${c.name}`));
console.log(bad.length ? `\n${bad.length} check(s) failed` : '\nall checks passed');
