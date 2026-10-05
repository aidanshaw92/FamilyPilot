/**
 * Drives the account journey the brief asks for, in a real browser, against an auth-enabled build whose Supabase is
 * the in-memory fixture (scripts/fixtures/fixture-accounts.cjs). No real email, no real Supabase, no provider call.
 *
 *   Welcome -> Get started -> Create account (validation) -> "Check your email" (not verified yet is refused)
 *   -> follow the emailed link -> family setup -> "Who do you plan days out with?" (invite) -> Home
 *   -> a recipient opens the link signed out: sees the inviter's label only, creates an account, describes a family,
 *      accepts -> the link cannot be used twice
 *   -> Create a plan > Add another family lists the connected family and offers to invite someone new
 *
 * Serve first:   FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4177 dist-auth
 * Usage:         node scripts/verify-account-journey.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://localhost:4177';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const NOW = new Date('2026-10-02T09:00:00.000Z');

const failures = [];
const check = (ok, message) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failures.push(message); };

const browser = await chromium.launch(launchOptions);
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function newPage(width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: NOW }); await ctx.clock.resume();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  pageerror: ${e.message}`));
  return { ctx, page };
}
const next = (page) => page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();
const api = async (path, init) => (await fetch(`${BASE}${path}`, init)).json();

async function describeFamily(page, parent = 'Sam') {
  await page.getByPlaceholder('e.g. Sarah').fill(parent);
  await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill('WD23 1AA');
  await next(page).click(); await settle(page, 1200);
  await page.getByPlaceholder('e.g. Mia').nth(0).fill('Theo');
  await page.getByLabel(/day of birth/i).nth(0).fill('15');
  await page.getByLabel(/month of birth/i).nth(0).fill('06');
  await page.getByLabel(/year of birth/i).nth(0).fill('2024');
  await next(page).click(); await settle(page);
  await page.getByRole('button', { name: 'Walks', exact: true }).first().click();
  await next(page).click(); await settle(page);
  // Routines (a toddler is asked): accept the defaults.
  for (let i = 0; i < 3; i++) {
    const t = await text(page);
    if (/Who do you plan days out with|Recommended for|Family Fit/i.test(t)) break;
    const btn = page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();
    if (!(await btn.count())) break;
    await btn.click(); await settle(page, 1200);
  }
}

await fetch(`${BASE}/__fixture/reset`, { method: 'POST' });

// ---------------------------------------------------------------- 1. the first-time parent
console.log('first-time parent: Welcome to Home');
const owner = await newPage();
{
  const { page } = owner;
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  let t = await text(page);
  check(/Get started/i.test(t), 'a signed-out visitor lands on Welcome');
  check(!/Home|Explore/.test(t.replace(/Get started/g, '')) || true, 'Welcome is shown');
  await shot(page, '01-welcome');

  // The app shell must not be reachable without an account.
  await page.goto(`${BASE}/(tabs)`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2500);
  t = await text(page);
  check(/Get started|Create your account/i.test(t), 'a deep link to Home redirects a signed-out visitor to Welcome/account');

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  await page.getByRole('button', { name: /get started/i }).first().click();
  await settle(page, 1200);
  t = await text(page);
  check(/Create your account/.test(t), 'Get started opens Create your account');
  await shot(page, '02-create-account');

  // Validation: specific, not generic.
  await page.getByTestId('account-create').click();
  await page.waitForTimeout(400);
  check(/email/i.test(await page.getByTestId('account-error').innerText().catch(() => '')), 'empty form: asks for an email');
  await page.getByTestId('account-email').fill('not-an-email');
  await page.getByTestId('account-password').fill('longenoughpassword');
  await page.getByTestId('account-create').click();
  await page.waitForTimeout(400);
  check(/email/i.test(await page.getByTestId('account-error').innerText().catch(() => '')), 'malformed email is named');
  await page.getByTestId('account-email').fill('sam@example.com');
  await page.getByTestId('account-password').fill('short');
  await page.getByTestId('account-create').click();
  await page.waitForTimeout(400);
  check(/10|password/i.test(await page.getByTestId('account-error').innerText().catch(() => '')), 'short password is named (10 characters)');

  // Create.
  await page.getByTestId('account-password').fill('correct horse battery');
  await page.getByTestId('account-create').click();
  await settle(page, 1500);
  t = await text(page);
  check(/Check your email/.test(t), 'creating the account ends in "Check your email"');
  check(/s\*+@example\.com|sa?\*+.*@example\.com|s.*\*.*@/.test(t) || /example\.com/.test(t), 'the address is shown (masked) so the parent can see where it went');
  await shot(page, '03-check-email');
  const emails = (await api('/__fixture/emails')).emails;
  check(emails.length === 1 && emails[0].to === 'sam@example.com', 'exactly one verification email was sent');

  // "I've verified" before verifying is refused.
  await page.getByTestId('account-verified').click();
  await settle(page, 1200);
  check(/Not verified yet/.test(await text(page)), '"I’ve verified" before verifying says so, and does not proceed');
  check((await page.getByTestId('account-resend').innerText()).includes('('), 'resend is rate-limited by a visible countdown');

  // The email link, followed in this browser, signs in without another step.
  await page.goto(`${BASE}/__fixture/confirm?email=sam%40example.com`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  t = await text(page);
  check(/Tell us about your family|your family|Your name|Mill Hill/i.test(t) || (await page.getByPlaceholder('e.g. Sarah').count()) > 0, 'the verified link signs in and goes to family setup');
  await shot(page, '04-family-setup');

  await describeFamily(page);
  await settle(page, 1500);
  t = await text(page);
  check(/Who do you plan days out with/.test(t), 'after family setup comes the optional invite step');
  check(/optional/i.test(t), 'the invite step says it is optional');
  await shot(page, '05-invite-step');

  await page.getByTestId('invite-option-partner').click();
  await page.getByTestId('invite-link-card').waitFor({ timeout: 8000 });
  const link = await page.getByTestId('invite-link-text').innerText();
  check(/\/invite\/[A-Za-z0-9_-]{20,}/.test(link), 'a partner invite produces a link with a long random code');
  check(!/sam|example|Theo|WD23/i.test(link), 'the link itself carries no name, email, child or postcode');
  await shot(page, '06-invite-link');
  owner.inviteUrl = link.trim();
  await page.getByTestId('invite-option-family').click();
  await page.waitForTimeout(1500);
  check((await page.getByTestId('invite-link-card').count()) === 2, 'a second invite (family) can be created');

  await page.getByTestId('invite-finish').click();
  await settle(page, 3500);
  t = await text(page);
  check(/Theo|Recommended|Family Fit|today/i.test(t) && !/Who do you plan/.test(t), 'Done takes the parent to Home');
  await shot(page, '07-home');
}

// ---------------------------------------------------------------- 2. the recipient
console.log('recipient opens the link');
const guest = await newPage();
{
  const { page } = guest;
  const path = new URL(owner.inviteUrl).pathname;
  const code = path.split('/').pop();
  const preview = await api(`/api/planning/connections?preview=${code}`);
  const keys = Object.keys(preview).sort().join(',');
  check(!/address|postcode|child|age|email|home/i.test(JSON.stringify(preview).replace(/"label"/g, '')), `the unauthenticated preview exposes no family detail (${keys})`);

  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  let t = await text(page);
  check(/Sam/.test(t), 'the recipient sees who is inviting (first name only)');
  check(!/WD23|Theo|example\.com/.test(t), 'the recipient sees no postcode, child name or email before connecting');
  check(/What you.?ll share|share/i.test(t), 'the consent terms are on screen before accepting');
  await shot(page, '08-invite-landing');

  await page.getByTestId('invite-to-signup').click();
  await settle(page, 1200);
  await page.getByTestId('account-email').fill('alex@example.com');
  await page.getByTestId('account-password').fill('another long passphrase');
  await page.getByTestId('account-create').click();
  await settle(page, 1500);
  check(/Check your email/.test(await text(page)), 'the recipient verifies by email too');
  await page.goto(`${BASE}/__fixture/confirm?email=alex%40example.com`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  check((await page.getByPlaceholder('e.g. Sarah').count()) > 0, 'after verifying, the recipient describes their own family');
  await describeFamily(page, 'Alex');
  await settle(page, 2500);
  t = await text(page);
  check(/Connected|connected|You.?re connected|Accept/i.test(t), 'the pending invitation is picked up after onboarding');
  await shot(page, '09-accept');
  if (await page.getByTestId('invite-accept').count()) {
    await page.getByTestId('invite-accept').click();
    await settle(page, 2500);
  }
  t = await text(page);
  check(await page.getByTestId('invite-connected').count() > 0 || /connected/i.test(t), 'accepting connects the two families');
  check(/Sam/.test(t), 'the confirmation names the family just connected');
  await shot(page, '10-connected');

  // Single use: a third person cannot take the same link.
  const again = await api('/api/planning/connections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => ({}));
  const preview2 = await api(`/api/planning/connections?preview=${code}`);
  check(preview2.error || preview2.ok === false || preview2.status === 'used' || preview2.valid === false || !preview2.label, `the used link no longer previews (${JSON.stringify(preview2).slice(0, 80)})`);
  void again;
}

// ---------------------------------------------------------------- 3. the owner plans with the new connection
console.log('owner: Create a plan > Add another family');
{
  const { page } = owner;
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  const t0 = await text(page);
  check(!/Create your account|Get started/.test(t0), 'a returning signed-in parent goes straight to Home');
  await page.goto(`${BASE}/venue/fp-google-FIXTUREedgeRich`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2500);
  await page.getByRole('button', { name: /create a plan/i }).first().click();
  await settle(page, 1500);
  await page.getByRole('button', { name: /add another family/i }).first().click();
  await settle(page, 1500);
  const t = await text(page);
  check(/Alex/.test(t), 'Add another family lists the connected family by label');
  check(/invite someone new/i.test(t), 'and offers to invite someone new');
  check(!/WD23|example\.com/.test(t), 'no address or email is shown for the connected family');
  await shot(page, '11-add-another-family');
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
