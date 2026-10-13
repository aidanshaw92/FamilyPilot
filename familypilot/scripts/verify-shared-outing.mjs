/**
 * The shared-outing journey, end to end, in a real browser, with two real accounts (the in-memory account fixture) and the REAL
 * plan-invites handler (api/planning/plan-invites.js) behind it:
 *
 *   Sam and Alex connect  →  Sam meets Alex halfway  →  Plan this day  →  "Save & send to Alex’s family"  →  Sam’s Plans says
 *   it is waiting  →  Alex’s Plans shows the invitation  →  Alex opens and reads it  →  accepts  →  it is in Alex’s plans (and
 *   still there after a reload)  →  Sam’s plan says "accepted"; a second plan is declined; a failed send is retried; nothing
 *   private about either family crosses over.
 *
 * Serve first (a build made with the fixture Supabase address, and the stored places the Halfway lookup reads):
 *   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:4181 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npx expo export --platform web --output-dir dist-auth
 *   FIXTURE_SCENARIO=realistic FIXTURE_CATALOGUE_ROWS=<rows.json> node scripts/serve-places-fixture.mjs 4181 dist-auth
 * Usage: node scripts/verify-shared-outing.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const BASE = process.argv[2] ?? 'http://localhost:4181';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const NOW = new Date('2026-10-14T06:00:00.000Z');

let failed = 0;
const check = (ok, message, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const text = (page) => page.evaluate(() => document.body.innerText);
const flat = async (page) => (await text(page)).replace(/\s+/g, ' ');
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const api = async (path, init) => (await fetch(`${BASE}${path}`, init)).json();

async function newPerson(width = 393, height = 852) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: NOW }); await ctx.clock.resume();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  pageerror: ${e.message}`));
  return { ctx, page };
}
const next = (page) => page.getByRole('button', { name: /^(continue|skip for now|see my recommendations)/i }).first();

async function describeFamily(page, parent, postcode, childName) {
  await page.getByPlaceholder('e.g. Sarah').fill(parent);
  await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill(postcode);
  await next(page).click(); await settle(page, 1200);
  await next(page).click(); await settle(page, 1000);
  await page.getByPlaceholder('e.g. Mia').nth(0).fill(childName);
  await page.getByLabel(/day of birth/i).nth(0).fill('15');
  await page.getByLabel(/month of birth/i).nth(0).fill('06');
  await page.getByLabel(/year of birth/i).nth(0).fill('2024');
  await next(page).click(); await settle(page);
  await page.getByRole('button', { name: 'Walks', exact: true }).first().click();
  await next(page).click(); await settle(page);
  for (let i = 0; i < 3; i++) {
    const t = await text(page);
    if (/Who do you plan days out with|Recommended for|Family Fit/i.test(t)) break;
    const btn = page.getByRole('button', { name: /^(continue|skip for now|see my recommendations)/i }).first();
    if (!(await btn.count())) break;
    await btn.click(); await settle(page, 1200);
  }
}
async function createAccount(page, email, password) {
  await page.getByTestId('account-email').fill(email);
  await page.getByTestId('account-password').fill(password);
  await page.getByTestId('account-create').click();
  await settle(page, 1500);
  await page.goto(`${BASE}/__fixture/confirm?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
}


/** Home leads with what is already in motion, and the recommendations stay on screen beneath it. */
async function homeLeads(page, name, expect, why, short = false) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  const card = page.getByTestId('home-up-next');
  await card.waitFor({ timeout: 15000 }).catch(() => {});
  const t = (await card.count()) ? (await card.innerText()).replace(/\s+/g, ' ') : '';
  check(expect.test(t), `Home leads with ${why}`, t || 'no card');
  const box = await card.boundingBox();
  const nav = await page.evaluate(() => { const el = document.querySelector('[role="tablist"]'); return el ? el.getBoundingClientRect().top : null; });
  check(Boolean(box) && box.y < 330, 'the card is in the first screen, under the search', box ? `y ${Math.round(box.y)}` : '');
  if (short) {
    // A short phone: the card is one line and the recommendation may sit a scroll lower, but it must be reachable and clear the navigation.
    await page.mouse.move(180, 300); await page.mouse.wheel(0, 2000); await page.waitForTimeout(700);
  }
  const deck = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((el) => /see more/i.test(el.textContent ?? '') || /see more/i.test(el.getAttribute('aria-label') ?? '')).map((el) => el.getBoundingClientRect().bottom));
  check(deck.length > 0 && (nav === null || Math.min(...deck) <= nav), short ? 'and the recommendation is reachable above the navigation after one scroll' : 'and the recommendations are still on that screen, above the navigation', `deck bottoms ${deck.map(Math.round)} nav ${nav === null ? 'n/a' : Math.round(nav)}`);
  await shot(page, name);
  return card;
}

await fetch(`${BASE}/__fixture/reset`, { method: 'POST' });

// ------------------------------------------------------------------ two connected families
console.log('setup: Sam and Alex, two families with an account each, connected');
const sam = await newPerson();
const alex = await newPerson();
let inviteUrl = '';
{
  const { page } = sam;
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  await page.getByRole('button', { name: /get started/i }).first().click(); await settle(page, 1200);
  await createAccount(page, 'sam@example.com', 'correct horse battery');
  await describeFamily(page, 'Sam', 'NW1 8AA', 'Theo');
  await settle(page, 1500);
  await page.getByTestId('invite-option-family').click();
  await page.getByTestId('invite-link-card').waitFor({ timeout: 8000 });
  inviteUrl = (await page.getByTestId('invite-link-text').innerText()).trim();
  await page.getByTestId('invite-finish').click(); await settle(page, 3000);
}
{
  const { page } = alex;
  const path = new URL(inviteUrl).pathname;
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  await page.getByTestId('invite-to-signup').click(); await settle(page, 1200);
  await createAccount(page, 'alex@example.com', 'another long passphrase');
  await describeFamily(page, 'Alex', 'SE13 6JS', 'Mila');
  await settle(page, 2500);
  if (await page.getByTestId('invite-accept').count()) { await page.getByTestId('invite-accept').click(); await settle(page, 2500); }
  check((await flat(page)).includes('Sam'), 'Alex is connected to Sam');
}

// ------------------------------------------------------------------ Sam: meet halfway, plan, save and send
console.log('Sam: Meet halfway with Alex → Plan this day → Save & send');
let planPath = '';
{
  const { page } = sam;
  await page.goto(`${BASE}/families`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  await page.getByRole('button', { name: 'Meet halfway', exact: true }).first().click(); await settle(page, 4000);
  check(new URL(page.url()).pathname === '/together' && /You \+ Alex/.test(await flat(page)), 'Meet halfway opens inside Together with Alex chosen');
  await page.getByTestId('halfway-plan').first().waitFor({ timeout: 30000 }).catch(async (e) => { await shot(page, 'x-halfway-timeout'); console.log('  halfway text:', (await flat(page)).slice(0, 700)); throw e; });
  await shot(page, '1-sam-halfway');
  await page.getByTestId('halfway-plan').first().click();
  await page.waitForURL(/\/plan/, { timeout: 20000 });
  const send = page.getByTestId('plan-save-and-send');
  await send.waitFor({ timeout: 60000 });
  planPath = new URL(page.url()).pathname + new URL(page.url()).search;
  const label = await send.innerText();
  check(/Save & send to Alex/.test(label), 'the plan’s one primary action is "Save & send to Alex’s family"', label);
  check((await page.getByTestId('plan-save').count()) === 1 && /Save only/.test(await page.getByTestId('plan-save').innerText()), 'and "Save only" is still there for a plan nobody should receive');
  await shot(page, '2-sam-plan-before-send');
  await send.click();
  await page.getByTestId('plan-share-status').waitFor({ timeout: 15000 }).catch(() => {});
  await settle(page, 1200);
  const t = await flat(page);
  check(/Plan saved/.test(t), 'the plan is saved');
  check(/Sent to Alex/.test(t), 'and says it was sent to Alex’s family');
  check(await page.getByTestId('plan-send').count() === 0, 'and does not offer to send it again');
  await shot(page, '3-sam-plan-sent');

  // The same day is not sent twice.
  await page.goto(`${BASE}${planPath}`, { waitUntil: 'domcontentloaded' }); await settle(page, 6000);
  const t2 = await flat(page);
  check(/Already in your plans|Plan saved/.test(t2), 'reopening the same plan finds it already saved');
  check(/waiting for a reply/.test(t2) || /Sent to Alex/.test(t2), 'and shows where the invitation has got to');
  check(await page.getByTestId('plan-send').count() === 0, 'and still does not offer to send it a second time');
}

// ------------------------------------------------------------------ Sam: Plans says it is waiting
console.log('Sam: Plans shows the plan and that it is waiting');
{
  const { page } = sam;
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  const t = await flat(page);
  check(/Coming up|Past/.test(t), 'Plans lists the plan');
  check(/Sent to Alex.*waiting for a reply/.test(t), 'with its status: sent to Alex’s family, waiting for a reply');
  check(!/Earlier plans/.test(t), 'there is no second list for it (no "Saved plans")');
  await shot(page, '4-sam-plans-waiting');
}

console.log('Home: Sam sees the plan she sent, Alex sees the invitation');
{
  const card = await homeLeads(sam.page, 'h1-sam-home', /Up next.*Sent to Alex.*waiting for a reply/, 'her plan, saying it is waiting for Alex’s family');
  await card.click(); await settle(sam.page, 2500);
  check(/\/saved-plan/.test(sam.page.url()), 'tapping it opens the plan');
  const card2 = await homeLeads(alex.page, 'h2-alex-home', /Sam.*invited you.*Review/, 'the invitation waiting for an answer');
  await card2.click(); await settle(alex.page, 2500);
  check(/\/shared-plan/.test(alex.page.url()), 'tapping it opens the invitation to read');
}

// ------------------------------------------------------------------ Alex: receive, review, accept
console.log('Alex: the invitation arrives, is read, and is accepted');
{
  const { page } = alex;
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  let t = await flat(page);
  check(/Invitations/.test(t) && /Sam’s family invited you|Sam invited you/.test(t), 'Alex’s Plans shows an invitation from Sam’s family, first');
  check(await page.getByTestId('plans-invitation-accept').count() === 1, 'with Accept and Decline on the card');
  await shot(page, '5-alex-plans-invitation');
  await page.getByTestId('plans-invitation').getByRole('button').first().click();
  await page.getByTestId('plan-invite-footer').waitFor({ timeout: 20000 });
  await settle(page, 1500);
  t = await flat(page);
  check(/invited you to this day/.test(t), 'opening it shows the whole day with "Sam’s family invited you to this day"');
  check(await page.getByTestId('plan-invite-accept').count() === 1 && await page.getByTestId('plan-invite-decline').count() === 1, 'and Accept / Decline');
  check(/Leave home/.test(t) && /Arrive at/.test(t), 'the plan itself (leave, arrive, stops) is readable before answering');
  await shot(page, '6-alex-reads-invitation');

  // Privacy: nothing about Sam’s family that the connection does not give, and nothing private about their child or routines.
  const leaks = [/Theo/, /WD23 1AA/, /sam@example\.com/, /\bnap\b/i, /wheelchair/i, /Mila’s/];
  for (const re of leaks) check(!re.test(t), `the invitation does not show ${re}`);

  await page.getByTestId('plan-invite-accept').click();
  await page.getByTestId('plan-invite-answered').waitFor({ timeout: 15000 });
  t = await flat(page);
  check(/You’re going/.test(t), 'accepting says "You’re going. It’s in your plans"');
  await shot(page, '7-alex-accepted');
  await page.getByTestId('plan-see-all-plans').click(); await settle(page, 2500);
  t = await flat(page);
  check(/Coming up/.test(t) && /From Sam.*you’re going/.test(t), 'Alex’s Plans now lists it under Coming up, from Sam’s family');
  check(!/Invitations/.test(t), 'and the invitation is gone from the waiting list');
  await shot(page, '8-alex-plans-after-accept');

  // It is Alex’s own plan now: it survives a reload, offline of the invitation list, and opens as a saved plan.
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  check(/From Sam.*you’re going/.test(await flat(page)), 'after a reload it is still there');
  await page.getByTestId('plans-saved-days').getByRole('button').first().click(); await settle(page, 2500);
  t = await flat(page);
  check(/invited you to this day, and you said yes/.test(t), 'it opens as Alex’s plan, saying who invited them');
  check(await page.getByTestId('plan-send').count() === 0 && await page.getByTestId('plan-save-and-send').count() === 0, 'and is never offered for sending on');
  check(await page.getByTestId('plan-add-to-calendar').count() === 1, 'with Add to calendar');
  for (const re of leaks) check(!re.test(t), `the saved copy does not show ${re}`);
  await shot(page, '9-alex-saved-copy');
}

{
  const card = await homeLeads(alex.page, 'h3-alex-home-after', /Up next.*From Sam.*you’re going/, 'the day Alex accepted');
  await card.click(); await settle(alex.page, 2500);
  check(/\/saved-plan/.test(alex.page.url()), 'tapping it opens Alex’s plan');
  // The smallest phone we support: the card must not push the recommendation (or its button) under the navigation.
  await alex.page.setViewportSize({ width: 360, height: 640 });
  await homeLeads(alex.page, 'h4-alex-home-360x640', /Today · A day at/, 'the day on a 360×640 phone', true);
  await alex.page.setViewportSize({ width: 393, height: 852 });
}

// ------------------------------------------------------------------ Sam: a family only on this phone can be invited to connect
console.log('Sam: Invite to connect on a family added on this phone');
{
  const { page } = sam;
  await page.goto(`${BASE}/families`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  // A family typed in on this phone (what adding by postcode stores), added the way the app stores it.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('familypilot-planning-v1') ?? '{"state":{},"version":1}');
    raw.state.families = [...(raw.state.families ?? []).filter((f) => f.id !== 'guest-emma'), { id: 'guest-emma', label: 'Emma', area: 'Walthamstow', latitude: 51.585, longitude: -0.02, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] }];
    localStorage.setItem('familypilot-planning-v1', JSON.stringify(raw));
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  const row = page.getByTestId('local-family-row');
  check(await row.count() === 1, 'Emma’s family is listed on Families as on this phone only');
  check(/On this phone only · not connected/.test(await row.innerText()), 'and says it is not connected');
  check(await page.getByTestId('connected-family-row').count() === 1 && await page.getByTestId('connected-family-row').getByTestId('local-family-invite').count() === 0, 'the connected family (Alex) has no Invite button: it is already connected');
  check(/Until they accept, Emma’s family can’t see or receive anything/.test(await row.innerText()), 'the card says nothing is shared until they accept');
  await row.getByTestId('local-family-invite').click();
  await row.getByTestId('invite-link-card').waitFor({ timeout: 10000 });
  const link = (await row.getByTestId('invite-link-text').innerText()).trim();
  check(/\/invite/.test(link), 'Invite to connect makes the usual single-use invitation link, under that family’s card', link.slice(0, 60));
  check(/Works once and expires in 7 days/.test(await row.innerText()) && /Never names, birthdays or your address/.test(await row.innerText()), 'with the usual terms of what accepting shares');
  await shot(page, 'i-invite-to-connect');
  const waiting = await flat(page);
  check(/Waiting for a reply/.test(waiting), 'and it appears under “Waiting for a reply”');
}

// ------------------------------------------------------------------ Sam: sees it accepted
console.log('Sam: the plan says Alex’s family accepted');
{
  const { page } = sam;
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  let t = await flat(page);
  check(/Alex.* accepted/.test(t), 'Sam’s Plans: "Alex’s family accepted"');
  await page.getByTestId('plans-saved-days').getByRole('button').first().click(); await settle(page, 2500);
  t = await flat(page);
  check(/Alex.* accepted/.test(t), 'and so does the plan itself');
  await shot(page, '10-sam-accepted');
}

// ------------------------------------------------------------------ a second plan, declined; and a send that fails then works
console.log('a second plan: a failed send is retried, then declined');
{
  const { page } = sam;
  // Plan the same place later in the day so it is a different plan.
  const second = planPath.replace(/start=[^&]*/, 'start=14%3A00');
  await page.route('**/api/planning/plan-invites', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Plan sharing is temporarily unavailable. Please try again."}' }) : route.continue()));
  await page.goto(`${BASE}${second}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('plan-save-and-send').waitFor({ timeout: 60000 });
  await page.getByTestId('plan-save-and-send').click();
  await page.getByTestId('plan-share-error').waitFor({ timeout: 15000 }).catch(() => {});
  let t = await flat(page);
  check(/Plan saved/.test(t), 'when sending fails the plan is still saved');
  check(/couldn’t send it to Alex/.test(t), 'and says plainly that it could not be sent, and to whom');
  check(await page.getByTestId('plan-send').count() === 1, 'with a button to try sending again');
  await shot(page, '11-sam-send-failed');
  await page.unroute('**/api/planning/plan-invites');
  await page.getByTestId('plan-send').click();
  await page.getByTestId('plan-share-status').waitFor({ timeout: 15000 }).catch(() => {});
  await settle(page, 1000);
  t = await flat(page);
  check(/Sent to Alex/.test(t), 'trying again sends it');
}
{
  const { page } = alex;
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  check(await page.getByTestId('plans-invitation').count() === 1, 'Alex has exactly one new invitation (the failed attempt left nothing behind)');
  await page.getByTestId('plans-invitation-decline').click(); await settle(page, 2000);
  const t = await flat(page);
  check(!/Invitations/.test(t), 'declining removes it from the waiting list');
  check((await page.getByTestId('plans-saved-days').getByRole('button').count()) === 1, 'and nothing is added to Alex’s plans');
}
{
  const { page } = sam;
  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  const t = await flat(page);
  check(/Alex.* declined/.test(t), 'Sam’s Plans: "Alex’s family declined" on that plan, the other still accepted');
  check(/Alex.* accepted/.test(t), 'the first plan still says accepted');
  await shot(page, '12-sam-plans-declined');
}

// ------------------------------------------------------------------ the privacy rule at the API: what Alex was actually sent
console.log('the invitation as the server holds it');
{
  const tokenFor = async (email, password) => (await api('/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).access_token;
  const token = await tokenFor('alex@example.com', 'another long passphrase');
  const listed = await api('/api/planning/plan-invites', { headers: { authorization: `Bearer ${token}` } });
  const raw = JSON.stringify(listed);
  check(Array.isArray(listed.invites) && listed.invites.length === 2, 'Alex’s account lists the two invitations', raw.slice(0, 120));
  check(listed.invites.every((i) => i.plan && i.plan.v === 2 && i.plan.kind === 'day'), 'each is a shared day (version 2) that is also a valid older-format plan');
  for (const re of [/Theo/, /WD23/, /sam@example/, /routineInsights":\[[^\]]/, /homeAfter":\[[^\]]/, /imageUrl/, /nap-/i]) check(!re.test(raw), `what the server holds for Alex has no ${re}`);
  check(listed.invites.every((i) => JSON.stringify(i.plan).length <= 8000), 'and fits the size the endpoint accepts');
}

await browser.close();
if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall passed');
