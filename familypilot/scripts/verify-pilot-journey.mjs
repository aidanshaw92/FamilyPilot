/**
 * Drives the REAL app (the exported web bundle) against the pilot-venue fixture and records what each screen shows, for
 * several different households, so the same ten venues can be compared in two states (stored claims today vs the pilot
 * profiles applied).
 *
 *   node scripts/verify-pilot-journey.mjs <baseUrl> <outDir> <label>
 *
 * Per household it records: what Home recommends first; Explore's order and each card's own words; every venue's Venue
 * Detail text (Family Fit, practical information, price); and, for the top recommendation, the Create a plan journey to the
 * Plan screen. Nothing is clicked that changes anything outside the browser; no provider is contacted.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://127.0.0.1:4180';
const OUT = process.argv[3] ?? join(process.cwd(), '..', 'docs', 'pilot', 'journey');
const LABEL = process.argv[4] ?? 'run';
const NOW = new Date(process.env.JOURNEY_NOW ?? '2026-10-14T07:30:00');
const KEY = 'familypilot-family-v1';

import { FAMILIES } from './pilot-households.mjs';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function settle(page, ms = 1200) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(ms);
}

const browser = await chromium.launch(launchOptions);
const summary = {};
mkdirSync(join(OUT, LABEL), { recursive: true });

for (const [familyKey, prof] of Object.entries(FAMILIES)) {
  const dir = join(OUT, LABEL, familyKey);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: KEY, value: JSON.stringify({ state: { profile: prof, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }),
  });
  const rec = { family: familyKey, home: null, explore: [], venues: {}, journey: null, errors };

  // --- DISCOVER: what Home recommends first
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2600);
  const homeCard = page.locator('[role="button"][aria-label$=", see more"]').first();
  if (await homeCard.count()) {
    rec.home = { topLabel: await homeCard.getAttribute('aria-label'), text: (await page.evaluate(() => document.body.innerText)).replace(/\s+\n/g, '\n').slice(0, 1800) };
    await page.screenshot({ path: join(dir, '01-home.png') });
  }

  // --- DISCOVER: Explore's order and each card's own words
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2600);
  // The list is windowed: cards mount and unmount as it scrolls. Walk it in steps and keep every card seen, ordered by its
  // position in the list (scroll offset plus its top), so all ten are recorded and in the order a parent sees them.
  const seenCards = new Map();
  for (let step = 0; step < 30; step += 1) {
    const batch = await page.evaluate(() => {
      const scroller = [...document.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 50 && el.querySelector('[role="button"][aria-label$="view details"]')) ?? document.scrollingElement;
      const out = [...document.querySelectorAll('[role="button"][aria-label$="view details"]')].map((el) => ({
        label: el.getAttribute('aria-label'), text: (el.innerText || '').replace(/\s+/g, ' ').trim(), y: Math.round(el.getBoundingClientRect().top + (scroller?.scrollTop ?? 0)),
      }));
      const before = scroller?.scrollTop ?? 0;
      if (scroller) scroller.scrollTop = before + 420;
      return { out, moved: (scroller?.scrollTop ?? 0) !== before };
    });
    for (const c of batch.out) seenCards.set(c.label, c);
    await page.waitForTimeout(450);
    if (!batch.moved && step > 2) break;
  }
  const ordered = [...seenCards.values()].sort((x, y) => x.y - y.y);
  for (const [i, c] of ordered.entries()) rec.explore.push({ rank: i + 1, label: c.label, text: c.text });
  await page.evaluate(() => { for (const el of document.querySelectorAll('*')) el.scrollTop = 0; window.scrollTo(0, 0); });
  await page.screenshot({ path: join(dir, '02-explore.png') });

  // --- DECIDE: every venue's Venue Detail (direct address; the tap path is exercised below)
  const ids = JSON.parse(process.env.PILOT_IDS ?? '[]');
  for (const id of ids) {
    await page.goto(`${BASE}/venue/${id}`, { waitUntil: 'domcontentloaded' });
    await settle(page, 1800);
    const text = await page.evaluate(() => document.body.innerText);
    const name = (text.split('\n').find((l) => l.trim().length > 3 && !/^(Back|Save|Share)/.test(l.trim())) ?? id).trim();
    rec.venues[id] = { text: text.replace(/\n{2,}/g, '\n') };
    if (process.env.SHOT_ALL === '1') await page.screenshot({ path: join(dir, `venue-${slug(id)}.png`), fullPage: true });
  }

  if (process.env.ONLY_EXPLORE === '1') { summary[familyKey] = rec; writeFileSync(join(dir, 'record.json'), JSON.stringify(rec, null, 1)); await context.close(); continue; }

  // --- PLAN + DO: the tap path for the top recommendation: Explore card -> Venue Detail -> Create a plan -> Plan
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2200);
  const first = page.locator('[role="button"][aria-label$="view details"]').first();
  if (await first.count()) {
    const topName = ((await first.getAttribute('aria-label')) ?? '').split(',')[0];
    await first.click();
    await settle(page, 2000);
    await page.screenshot({ path: join(dir, '03-venue-detail.png') });
    const detailText = await page.evaluate(() => document.body.innerText);
    const cta = page.getByTestId('venue-create-plan');
    const journey = { topName, detailUrl: page.url().replace(BASE, ''), detailText, planText: null, planOk: false };
    if (await cta.isVisible().catch(() => false)) {
      await cta.scrollIntoViewIfNeeded().catch(() => {});
      await cta.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(dir, '04-create-plan-sheet.png') });
      await page.getByTestId('create-plan-submit').click();
      await page.waitForTimeout(4600);
      await settle(page, 600);
      await page.screenshot({ path: join(dir, '05-plan.png') });
      journey.planText = await page.evaluate(() => document.body.innerText);
      journey.planOk = await page.getByTestId('plan-save').isVisible().catch(() => false);
      if (journey.planOk) {
        await page.getByTestId('plan-section-travel').click().catch(() => {});
        await page.waitForTimeout(600);
        journey.travelText = await page.evaluate(() => document.body.innerText);
        await page.screenshot({ path: join(dir, '06-plan-travel.png') });
      }
    }
    rec.journey = journey;
  }
  summary[familyKey] = rec;
  writeFileSync(join(dir, 'record.json'), JSON.stringify(rec, null, 1));
  console.log(`${familyKey}: home="${(rec.home?.topLabel ?? '').split(',')[0]}" explore=${rec.explore.length} venues=${Object.keys(rec.venues).length} plan=${rec.journey?.planOk ? 'ok' : 'no'} errors=${errors.length}`);
  await context.close();
}
await browser.close();
writeFileSync(join(OUT, LABEL, 'summary.json'), JSON.stringify(summary, null, 1));
