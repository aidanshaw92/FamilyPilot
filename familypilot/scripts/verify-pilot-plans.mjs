/**
 * Create a plan for chosen (household, venue) pairs from Venue Detail, against the pilot fixture, and record the Plan screen:
 * the day, the travel and parking section, who is coming. Run against the before and after bundles to see whether a plan
 * uses what the profile adds.
 *
 *   node scripts/verify-pilot-plans.mjs <baseUrl> <outDir> <label>
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILIES } from './pilot-households.mjs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const BASE = process.argv[2];
const OUT = process.argv[3];
const LABEL = process.argv[4];
const NOW = new Date('2026-10-14T07:30:00');
const PAIRS = [
  ['A-preschooler-and-baby', 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE', 'science'],
  ['B-baby-only', 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk', 'discover'],
  ['C-school-age', 'fp-google-ChIJV_iXMtcadkgRqBI84CY_crE', 'zoo'],
  ['D-toddler-mobility-aid', 'fp-google-ChIJSzwgydoDdkgRndnXVYQGXBI', 'horniman'],
  ['A-preschooler-and-baby', 'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc', 'raf'],
];
const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
mkdirSync(join(OUT, LABEL), { recursive: true });
const results = [];
for (const [fam, id, slug] of PAIRS) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: 'familypilot-family-v1', value: JSON.stringify({ state: { profile: FAMILIES[fam], hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }),
  });
  const rec = { family: fam, venue: slug, ok: false };
  try {
    await page.goto(`${BASE}/venue/${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2200);
    const cta = page.getByTestId('venue-create-plan');
    await cta.scrollIntoViewIfNeeded();
    await cta.click();
    await page.waitForTimeout(900);
    await page.getByTestId('create-plan-submit').click();
    await page.waitForTimeout(4800);
    rec.ok = await page.getByTestId('plan-save').isVisible().catch(() => false);
    rec.dayText = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: join(OUT, LABEL, `${fam}-${slug}-plan.png`) });
    await page.getByTestId('plan-section-travel').click().catch(() => {});
    await page.waitForTimeout(700);
    rec.travelText = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: join(OUT, LABEL, `${fam}-${slug}-travel.png`) });
  } catch (e) { rec.error = String(e).slice(0, 200); }
  results.push(rec);
  console.log(`${fam} x ${slug}: plan=${rec.ok ? 'ok' : 'NO'}${rec.error ? ' ' + rec.error : ''}`);
  await context.close();
}
writeFileSync(join(OUT, LABEL, 'plans.json'), JSON.stringify(results, null, 1));
await browser.close();
