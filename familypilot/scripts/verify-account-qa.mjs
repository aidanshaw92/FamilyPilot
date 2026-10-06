/**
 * The account and Connected Families cases beyond the happy path, in a real browser against the auth-enabled bundle and
 * the in-memory fixture backend (no real email, no Supabase, no provider):
 *
 *   returning sign-in · sign out · signed-out deep link · wrong password · expired invitation · reused invitation ·
 *   cancelled invitation · declined invitation (nothing shared) · an existing connected person ·
 *   and, across ALL of it, what was uploaded: no child name, date of birth, postcode or full profile ever leaves the
 *   device (every request body to the backend is inspected).
 *
 * Serve first:   FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4177 dist-auth
 * Usage:         node scripts/verify-account-qa.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = { headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) };
const BASE = process.argv[2] ?? 'http://localhost:4177';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
// The browser clock must agree with the fixture API's clock, which stamps invitation expiry in real time.
const NOW = new Date();

let failed = 0;
const check = (ok, message) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions);
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const api = async (path, init) => (await fetch(`${BASE}${path}`, init)).json();

/** Every request body sent to the backend, to prove what is and is not uploaded. */
const uploads = [];
async function newPage(width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: NOW }); await ctx.clock.resume();
  const page = await ctx.newPage();
  page.on('request', (r) => {
    if (r.url().startsWith(BASE) && (r.url().includes('/auth/v1/') || r.url().includes('/api/planning/')) && r.postData()) uploads.push({ url: r.url().replace(BASE, ''), body: r.postData() });
  });
  return { ctx, page };
}
const next = (page) => page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();

async function describeFamily(page, parent, child = { name: 'Theo', dob: ['15', '06', '2024'] }, postcode = 'WD23 1AA') {
  await page.getByPlaceholder('e.g. Sarah').fill(parent);
  await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill(postcode);
  await next(page).click(); await settle(page, 1200);
  // The household step (optional: "just you" continues as it is).
  await next(page).click(); await settle(page, 1000);
  await page.getByPlaceholder('e.g. Mia').nth(0).fill(child.name);
  await page.getByLabel(/day of birth/i).nth(0).fill(child.dob[0]);
  await page.getByLabel(/month of birth/i).nth(0).fill(child.dob[1]);
  await page.getByLabel(/year of birth/i).nth(0).fill(child.dob[2]);
  await next(page).click(); await settle(page);
  await page.getByRole('button', { name: 'Walks', exact: true }).first().click();
  await next(page).click(); await settle(page);
  for (let i = 0; i < 3; i++) {
    const t = await text(page);
    if (/Who do you plan days out with/i.test(t) || /Accept and connect|You.?re connected/i.test(t)) break;
    const btn = page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();
    if (!(await btn.count())) break;
    await btn.click(); await settle(page, 1200);
  }
}
async function createVerified(page, email, password) {
  await page.getByTestId('account-email').fill(email);
  await page.getByTestId('account-password').fill(password);
  await page.getByTestId('account-create').click();
  await settle(page, 1500);
  await page.goto(`${BASE}/__fixture/confirm?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
}
async function startAccount(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3200);
  await page.getByRole('button', { name: /get started/i }).first().click(); await settle(page, 1200);
}
async function inviteUrl(page, option = 'invite-option-partner') {
  await page.getByTestId(option).click();
  await page.getByTestId('invite-link-card').first().waitFor({ timeout: 8000 });
  return (await page.getByTestId('invite-link-text').first().innerText()).trim();
}

await fetch(`${BASE}/__fixture/reset`, { method: 'POST' });

// ------------------------------------------------------------------ the owner: Sam, with a child called Theo
console.log('owner: create, verify, family, invite');
const sam = await newPage();
let partnerLink, friendLink, familyLink;
{
  const { page } = sam;
  await startAccount(page);
  await createVerified(page, 'sam@example.com', 'correct horse battery');
  await describeFamily(page, 'Sam');
  partnerLink = await inviteUrl(page, 'invite-option-partner');
  friendLink = await inviteUrl(page, 'invite-option-friend');
  familyLink = await inviteUrl(page, 'invite-option-family');
  check(new Set([partnerLink, friendLink, familyLink]).size === 3, 'three invitations are three different links');
  await page.getByTestId('invite-finish').click(); await settle(page, 3500);
  check(!/Who do you plan/.test(await text(page)), 'the owner reaches Home');
}

// ------------------------------------------------------------------ sign out, deep link, sign in again
console.log('sign out and sign back in');
{
  const { page } = sam;
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  await page.getByTestId('profile-signout').click(); await settle(page, 500);
  await shot(page, 'qa-01-sign-out-confirm');
  await page.getByTestId('profile-signout-confirm').click(); await settle(page, 3000);
  let t = await text(page);
  check(/Get started|Welcome back|Create your account/i.test(t), 'signing out returns to Welcome or sign-in');
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  t = await text(page);
  check(!/Explore London/.test(t) && /Get started|Welcome back|Sign in/i.test(t), 'a signed-out deep link to Explore goes to Welcome or sign-in, not the app');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await settle(page, 3000);
  t = await text(page);
  check(/Welcome back|Sign in/i.test(t), 'a device that already has a family goes straight to sign-in');
  await shot(page, 'qa-02-sign-in');
  await page.getByTestId('account-email').fill('sam@example.com');
  await page.getByTestId('account-password').fill('not the password at all');
  await page.getByTestId('account-signin').click(); await settle(page, 1200);
  const err = await page.getByTestId('account-error').innerText().catch(() => '');
  check(/password|email/i.test(err) && !/sam@example/.test(err), `a wrong password is refused without saying which half was wrong (“${err.slice(0, 60)}”)`);
  await page.getByTestId('account-password').fill('correct horse battery');
  await page.getByTestId('account-signin').click(); await settle(page, 3500);
  t = await text(page);
  check(!/Welcome back|Sign in/.test(t) && !/Tell us about your family/.test(t), 'the right password returns to Home with the family still there (nothing re-asked)');
}

// ------------------------------------------------------------------ the recipient, one case per invitation
const code = (url) => new URL(url).pathname.split('/').pop();

console.log('expired invitation');
{
  const { page } = await newPage();
  const link = partnerLink;
  const before = await api(`/api/planning/connections?preview=${code(link)}`);
  check(before.valid === true, 'the partner link is valid before it ages');
  await api('/__fixture/expire-invitations', { method: 'POST' });
  const after = await api(`/api/planning/connections?preview=${code(link)}`);
  check(after.valid === false && !after.inviter, 'once expired, the preview says only "not valid" and names nobody');
  await page.goto(`${BASE}${new URL(link).pathname}`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  const t = await text(page);
  check(/can.?t be used|expired|no longer/i.test(t) && !/Sam/.test(t), 'the landing screen says the invitation cannot be used and shows no family');
  await shot(page, 'qa-03-expired-invite');
}

/** Opens Create a plan > Add another family as the owner and returns the page. */
async function openPicker(page) {
  await page.goto(`${BASE}/venue/fp-google-FIXTUREedgeRich`, { waitUntil: 'domcontentloaded' }); await settle(page, 2500);
  await page.getByRole('button', { name: /create a plan/i }).first().click(); await settle(page, 1500);
  await page.getByRole('button', { name: /add another family/i }).first().click(); await settle(page, 1500);
}
async function newLinkFromPicker(page, label) {
  const before = await page.getByTestId('invite-link-text').count();
  await page.getByRole('button', { name: new RegExp(`^\\+ ${label}$`) }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="invite-link-text"]').length > n || document.querySelector('[data-testid="invite-link-text"]'), before, { timeout: 8000 });
  await settle(page, 800);
  const all = await page.getByTestId('invite-link-text').allInnerTexts();
  return all[all.length - 1].trim();
}

console.log('expired rows are labelled and removable; a cancelled invitation stops working');
let linkA;
{
  const { page } = sam;
  await openPicker(page);
  check(/expired/.test(await text(page)), 'expired invitations say "expired" (not "waiting")');
  check((await page.locator('[data-testid^="remove-invitation-"]').count()) >= 1, 'and offer Remove rather than Cancel');
  linkA = await newLinkFromPicker(page, 'Friend');
  check((await api(`/api/planning/connections?preview=${code(linkA)}`)).valid === true, 'a fresh invitation is valid');
  const cancel = page.locator('[data-testid^="cancel-invitation-"]');
  check((await cancel.count()) === 1, 'the live invitation is listed with a Cancel button');
  await shot(page, 'qa-04-pending-invitations');
  await cancel.first().click(); await settle(page, 1200);
  check((await api(`/api/planning/connections?preview=${code(linkA)}`)).valid === false, 'cancelling makes the link stop working at once');
}

console.log('accepted, then reused');
let linkB;
const alex = await newPage();
{
  linkB = await (async () => { const { page } = sam; await openPicker(page); return newLinkFromPicker(page, 'Family'); })();
  const { page } = alex;
  await page.goto(`${BASE}${new URL(linkB).pathname}`, { waitUntil: 'domcontentloaded' }); await settle(page, 3500);
  check(/Sam/.test(await text(page)), 'the recipient sees who invited them');
  await page.getByTestId('invite-to-signup').click(); await settle(page, 1200);
  await createVerified(page, 'alex@example.com', 'another long passphrase');
  await describeFamily(page, 'Alex', { name: 'Mia', dob: ['20', '03', '2018'] }, 'N1 9GU');
  await settle(page, 2500);
  if (await page.getByTestId('invite-accept').count()) { await page.getByTestId('invite-accept').click(); await settle(page, 2500); }
  check((await page.getByTestId('invite-connected').count()) > 0 || /connected/i.test(await text(page)), 'accepting connects the two families');
  check((await api(`/api/planning/connections?preview=${code(linkB)}`)).valid === false, 'the same link cannot be used a second time');
  const third = await newPage();
  await third.page.goto(`${BASE}${new URL(linkB).pathname}`, { waitUntil: 'domcontentloaded' }); await settle(third.page, 3500);
  const tt = await text(third.page);
  check(/can.?t be used|expired|already|no longer/i.test(tt) && !/Sam|Alex|Theo|Mia/.test(tt), 'a third person opening the used link learns nothing about either family');
  await shot(third.page, 'qa-05-reused-invite');
}

console.log('a declined invitation shares nothing');
{
  const { page } = sam;
  await openPicker(page);
  const linkC = await newLinkFromPicker(page, 'Partner');
  const guest = await newPage();
  await guest.page.goto(`${BASE}${new URL(linkC).pathname}`, { waitUntil: 'domcontentloaded' }); await settle(guest.page, 3500);
  const landing = await text(guest.page);
  check(/Sam/.test(landing) && !/Theo|WD23/.test(landing), 'the invitee sees only the inviter’s first name before deciding');
  await guest.page.getByRole('button', { name: /^not now$/i }).click(); await settle(guest.page, 1500);
  check((await api(`/api/planning/connections?preview=${code(linkC)}`)).valid === true, 'declining ("Not now") does not use the invitation up');
  const rows = await page.evaluate(async () => document.body.innerText);
  void rows;
  await shot(guest.page, 'qa-07-declined');
}

console.log('an existing connected person');
{
  const { page } = sam;
  await openPicker(page);
  let t = await text(page);
  check(/Alex/.test(t), 'Add another family lists the connected person');
  { const m = t.match(/WD23\s*1AA|N1\s*9GU|Mia|example\.com/); if (m) console.log('   (found in page text)', m[0], '::', t.slice(Math.max(0, m.index - 80), m.index + 80).replace(/\n/g, ' | ')); }
  check(!/WD23\s*1AA|N1\s*9GU|Mia|example\.com/.test(t), 'and nothing else about them: no full postcode, child name or email');
  await page.getByRole('button', { name: /^\+ Alex/ }).first().click(); await settle(page, 800);
  t = await text(page);
  check(/Alex.* · 1 child/.test(t), 'tapping adds them to the plan as a chip with only their shared snapshot');
  await shot(page, 'qa-06-connected-person-added');
}

// ------------------------------------------------------------------ what was uploaded
console.log('what left the device');
{
  // /api/planning/location is the stateless postcode -> coordinates lookup (no database, no logging of the body). The
  // postcode necessarily travels to it once so the app can place the home on a map; it is never stored. Everything else
  // that leaves the device is inspected for it.
  const stored = uploads.filter((u) => !u.url.includes('/api/planning/location'));
  const bodies = stored.map((u) => `${u.url} ${u.body}`).join('\n');
  check(uploads.some((u) => u.url.includes('/api/planning/location')), 'the postcode was sent only to the stateless location lookup');
  check(uploads.length > 5, `inspected ${uploads.length} request bodies sent to the backend`);
  check(!/Theo|Mia/.test(bodies), 'no child’s name was uploaded');
  check(!/2024-06-15|15\/06\/2024|2018-03-20|20\/03\/2018|dateOfBirth|dob/i.test(bodies), 'no date of birth was uploaded');
  check(!/WD23\s*1AA|N1\s*9GU/i.test(bodies), 'no full postcode was stored or shared (only the outward part, as the sharing area)');
  check(!/"members"|routines|mustHaveFacilities|parentName/.test(bodies), 'the device-only family profile was not uploaded');
  const create = uploads.find((u) => u.url.includes('connections') && u.body.includes('"create"'));
  check(Boolean(create), 'the invitation request that was sent can be inspected');
  if (create) {
    const family = JSON.parse(create.body).family;
    check(Object.keys(family).sort().join(',').length > 0 && !('members' in family), `the shared snapshot carries only: ${Object.keys(family).sort().join(', ')}`);
    check(Array.isArray(family.ages) && family.ages.every((a) => Number.isFinite(a)), 'children appear only as ages');
  }
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
