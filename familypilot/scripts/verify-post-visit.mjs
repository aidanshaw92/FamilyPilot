/**
 * The post-visit confirmation loop, in a real browser, against the auth-enabled bundle and the in-memory fixture
 * backend (the REAL reconciliation and question-selection rules, in-memory reports):
 *
 *   a saved plan whose day has passed  ->  a dot on Plans (Home itself is unchanged)
 *   "Did you go to X?"  No             ->  dismissed, NOTHING sent, no facility questions
 *   "Did you go to X?"  Yes            ->  two or three chosen questions, adaptive to what is unknown and to this family
 *   answer, share                       ->  one report stored with only {venue, date, answers} (no family detail)
 *   a second visit by another family    ->  corroboration, never an official claim
 *   the venue page                      ->  shows the report separately, as reported by parents
 *   opening a venue page is NOT a visit ->  nothing is asked
 *
 * Serve first:   FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4177 dist-auth
 * Usage:         node scripts/verify-post-visit.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://localhost:4177';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const NOW = new Date('2026-10-02T09:00:00.000Z');
const VENUE_ID = 'fp-google-FIXTUREedgeRich';
const VENUE_NAME = 'Confirmed Facts Gardens';

let failed = 0;
const check = (ok, message) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions);
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const api = async (path, init) => (await fetch(`${BASE}${path}`, init)).json();

const feedbackPosts = [];
async function newPage(width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: NOW }); await ctx.clock.resume();
  const page = await ctx.newPage();
  page.on('request', (r) => { if (r.url().includes('/api/planning/feedback') && r.method() === 'POST') feedbackPosts.push(r.postData()); });
  return { ctx, page };
}
const next = (page) => page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();

/** Create an account, verify it, and describe a family with a toddler in a buggy. Ends on the invite step or Home. */
async function signUpWithBuggyToddler(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3200);
  await page.getByRole('button', { name: /get started/i }).first().click(); await settle(page, 1200);
  await page.getByTestId('account-email').fill(email);
  await page.getByTestId('account-password').fill('correct horse battery');
  await page.getByTestId('account-create').click(); await settle(page, 1500);
  await page.goto(`${BASE}/__fixture/confirm?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  await page.getByPlaceholder('e.g. Sarah').fill('Sam');
  await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill('WD23 1AA');
  await next(page).click(); await settle(page, 1200);
  // The household step (optional: "just you" continues as it is).
  await next(page).click(); await settle(page, 1000);
  await page.getByPlaceholder('e.g. Mia').nth(0).fill('Theo');
  await page.getByLabel(/day of birth/i).nth(0).fill('15');
  await page.getByLabel(/month of birth/i).nth(0).fill('06');
  await page.getByLabel(/year of birth/i).nth(0).fill('2024');
  await next(page).click(); await settle(page);
  await page.getByRole('button', { name: 'Walks', exact: true }).first().click();
  await page.getByRole('button', { name: 'Buggy', exact: true }).first().click();
  await next(page).click(); await settle(page);
  for (let i = 0; i < 3; i++) {
    if (/Who do you plan days out with/i.test(await text(page))) break;
    const btn = page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();
    if (!(await btn.count())) break;
    await btn.click(); await settle(page, 1200);
  }
  await page.getByTestId('invite-finish').click(); await settle(page, 3500);
}

/** A saved plan for the fixture venue whose day (yesterday) and finish time have passed. */
const planSeed = (id) => ({
  state: {
    // Only `saved`: every other key keeps the store's own defaults.
    saved: [{ id, date: '2026-10-01', createdAt: '2026-09-30T10:00:00.000Z', checked: [], plan: { venueId: VENUE_ID, name: VENUE_NAME, timings: [], start: 600, end: 720, fairnessGap: 0, reasons: [], unknowns: [], score: 80 } }],
  },
  version: 0,
});
const seedPlan = (page, id) => page.evaluate((seed) => localStorage.setItem('familypilot-planning-v1', JSON.stringify(seed)), planSeed(id));

await fetch(`${BASE}/__fixture/reset`, { method: 'POST' });

console.log('a visit that did not happen');
const sam = await newPage();
{
  const { page } = sam;
  await signUpWithBuggyToddler(page, 'sam@example.com');
  // Opening a venue page is not a visit: nothing is asked.
  await page.goto(`${BASE}/venue/${VENUE_ID}`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  check(!/Did you go to/.test(await text(page)), 'opening a venue page never asks "Did you go?"');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  check((await page.getByTestId('visit-check-dot').count()) === 0, 'with no plan behind us there is no dot on Plans');

  await seedPlan(page, 'plan-no');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  check((await page.getByTestId('visit-check-dot').count()) === 1, 'a saved plan whose day has passed puts one dot on Plans');
  check(/Good (morning|afternoon|evening)/.test(await text(page)) && !/Did you go to/.test(await text(page)), 'Home itself is unchanged: the question is not on Home');
  await shot(page, 'pv-01-home-with-dot');
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  const ask = await text(page);
  check(new RegExp(`Did you go to ${VENUE_NAME}\\?`).test(ask), 'Plans asks "Did you go to [venue]?"');
  check(/Yes, we went/.test(ask) && /No, we didn.t go/.test(ask) && /Ask me tomorrow/.test(ask), 'with Yes, No and "Ask me tomorrow"');
  await shot(page, 'pv-02-did-you-go');
  const before = feedbackPosts.length;
  await page.getByTestId('visit-no').click(); await settle(page, 800);
  const after = await text(page);
  check(!/What did you find|QUICK CHECK/.test(after), 'No: no facility questions are asked');
  check(!new RegExp(`Did you go to ${VENUE_NAME}`).test(after), 'No: the prompt is dismissed');
  check(feedbackPosts.length === before, 'No: nothing is sent to the backend');
  check((await api('/__fixture/reports')).reports.length === 0, 'No: no report exists');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  check((await page.getByTestId('visit-check-dot').count()) === 0, 'No: the dot goes away');
}

console.log('a visit that did happen');
{
  const { page } = sam;
  await seedPlan(page, 'plan-yes');
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  await page.getByTestId('visit-yes').click(); await settle(page, 1500);
  const t = await text(page);
  const asked = ['babyChanging', 'pushchair', 'toilets', 'parking', 'cafe'];
  const shown = [];
  for (const k of asked) if ((await page.getByTestId(`visit-question-${k}`).count()) > 0) shown.push(k);
  check(shown.length >= 2 && shown.length <= 3, `two or three questions, not all five (${shown.join(', ')})`);
  check(shown.includes('babyChanging') && shown.includes('pushchair'), 'a family with a toddler in a buggy is asked about baby changing and the buggy (both unknown here)');
  check(!shown.includes('toilets'), 'toilets are not asked: the venue’s own source confirmed them recently');
  check(/Nobody has confirmed this yet/.test(t), 'each question says why it is being asked');
  await shot(page, 'pv-03-questions');
  check(await page.getByTestId('visit-submit').isDisabled(), 'sharing is disabled until something is answered');
  await page.getByTestId('visit-question-babyChanging').getByRole('button', { name: 'Yes', exact: true }).click();
  await page.getByTestId('visit-question-pushchair').getByRole('button', { name: /Yes, comfortably/ }).click();
  await page.waitForTimeout(700);
  await shot(page, 'pv-04-answered');
  await page.getByTestId('visit-submit').click(); await settle(page, 1500);
  const thanks = await text(page);
  check(/Thank you/.test(thanks) && /reported by parents/.test(thanks), 'a thank-you says it will appear as "reported by parents", next to the venue’s own information');
  await shot(page, 'pv-05-thanks');
  const stored = (await api('/__fixture/reports')).reports;
  check(stored.length === 1, 'exactly one report was stored');
  check(JSON.stringify(Object.keys(stored[0]).sort()) === JSON.stringify(['answers', 'created_at', 'id', 'status', 'user_id', 'venueId', 'visit_date']), 'it holds the account, the venue, the date and the answers, and nothing else');
  check(!/Theo|WD23|2024|Sam/.test(JSON.stringify(stored[0])), 'no child name, date of birth, postcode or parent name is in it');
  check(feedbackPosts.length === 1 && Object.keys(JSON.parse(feedbackPosts[0])).sort().join(',') === 'answers,attended,venueId,visitDate', 'the request body is only {venueId, visitDate, attended, answers}');

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  check((await page.getByTestId('visit-check-dot').count()) === 0, 'after answering, the dot is gone');
}

console.log('the report is shown separately, and strengthens with a second family');
{
  const { page } = sam;
  await page.goto(`${BASE}/venue/${VENUE_ID}`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  await page.getByText(/How we know this/i).first().click().catch(() => {});
  await settle(page, 1000);
  let t = await text(page);
  check(/One family has reported this; the venue.s own source is not confirmed/.test(t), 'the venue page shows one family’s report, labelled as not the venue’s own source');
  check(!/families report it is available/.test(t), 'and ONE report does not reach Family Fit at all (no parent-reported line)');
  await shot(page, 'pv-06-evidence-one-report');

  // A second family reports the same: corroborated, still not official.
  const second = (await api('/__fixture/reports')).reports[0];
  await fetch(`${BASE}/api/planning/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer x.${Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url')}.y` },
    body: JSON.stringify({ venueId: second.venueId, visitDate: second.visit_date, attended: true, answers: { babyChanging: 'yes' } }),
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  await page.getByText(/How we know this/i).first().click().catch(() => {});
  await settle(page, 1000);
  t = await text(page);
  check(/2 families have reported this; the venue.s own source is not confirmed/.test(t), 'two families agreeing reads as corroborated, still labelled as not the venue’s own source');
  check(!/Source checked · Yes|FamilyPilot review · Yes/.test(t.split(/Baby changing/)[1]?.slice(0, 160) ?? ''), 'and baby changing is NOT promoted to an official confirmation');
  await shot(page, 'pv-07-evidence-corroborated');
}

console.log('Family Fit: one report is silent, two independent reports are explained as parent-reported, never as a fact');
{
  // A venue whose own facts leave baby changing unknown (a "partial" fixture venue).
  const PARTIAL = 'fp-google-FIXTUREnotArealPlaceId0004';
  const { page } = sam;
  const post = (user) => fetch(`${BASE}/api/planning/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer x.${Buffer.from(JSON.stringify({ sub: user })).toString('base64url')}.y` },
    body: JSON.stringify({ venueId: PARTIAL, visitDate: new Date().toISOString().slice(0, 10), attended: true, answers: { babyChanging: 'yes' } }),
  });
  const read = async () => { await page.goto(`${BASE}/venue/${PARTIAL}`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000); return (await text(page)); };
  let t = await read();
  check(/Baby changing still to be checked for Theo/.test(t), 'before any report: "Baby changing still to be checked for Theo"');
  await post('family-one');
  t = await read();
  check(/Baby changing still to be checked for Theo/.test(t) && !/families report it is available/.test(t), 'one report: Family Fit says nothing different');
  await post('family-two');
  t = await read();
  check(/Baby changing: 2 families report it is available \(parent-reported, not confirmed by the venue\)/.test(t), 'two independent reports: Family Fit says so, labelled parent-reported and not confirmed by the venue');
  check(!/Baby changing confirmed/.test(t), 'and never as a confirmed fact or a tick');
  await shot(page, 'pv-08-family-fit-parent-reported');
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
