/**
 * The invitation, password and recovery journey in a REAL browser against a REAL Supabase Auth server (GoTrue, built from
 * github.com/supabase/auth), configured the way production is meant to be: public sign-ups OFF, email confirmation on,
 * site URL and redirect allow-list set, minimum password length 10. Email goes to a local SMTP sink and the links in it are
 * followed exactly as a person would. Nothing here touches Supabase production.
 *
 * Needs (see docs/pilot/beta/AUTH_VERIFICATION.md): GoTrue on :9999 behind a /auth/v1 proxy on :9998, the SMTP sink writing .eml
 * files to MAIL_DIR, a bundle built with EXPO_PUBLIC_SUPABASE_URL=http://localhost:9998 served on :4177, and PGHOST for
 * the two direct database edits that stand in for time passing.
 *
 * Usage: node scripts/verify-real-auth.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4177';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AUTH = process.env.AUTH_URL ?? 'http://localhost:9998/auth/v1';
const SECRET = process.env.GOTRUE_JWT_SECRET ?? 'local-test-secret-at-least-32-characters-long!!';
const MAIL_DIR = process.env.MAIL_DIR ?? '/tmp/claude-0/gotrue/mail';
const PSQL = process.env.PSQL_CMD ?? 'su postgres -c "psql -h /tmp/pgtest -p 5499 -d gotrue -Atq -c \\"$SQL\\""';
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const serviceJwt = () => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`; return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`; };
const admin = async (path, body) => { const r = await fetch(`${AUTH}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${serviceJwt()}`, apikey: 'x' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const sql = (q) => execFileSync('bash', ['-c', PSQL], { env: { ...process.env, SQL: q } }).toString().trim();

const qp = (s) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
/** The newest email to `to` whose subject/body matches, and the verification link inside it. */
async function emailLink(to, kind, after = 0) {
  for (let i = 0; i < 40; i++) {
    const files = existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR).sort() : [];
    for (const f of files.reverse()) {
      const raw = readFileSync(`${MAIL_DIR}/${f}`, 'utf8');
      const stamp = Number(f.split('-')[1]?.replace('.eml', '') ?? 0);
      if (stamp <= after || !new RegExp(`^To:.*${to.replace(/[+.]/g, '\\$&')}`, 'mi').test(raw)) continue;
      const body = qp(raw);
      const m = body.match(/href="([^"]*\/verify\?[^"]*)"/i);
      if (m && body.toLowerCase().includes(kind)) return { link: m[1].replace(/&amp;/g, '&'), stamp, body };
      if (m && kind === 'any') return { link: m[1].replace(/&amp;/g, '&'), stamp, body };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} email for ${to}`);
}

let failed = 0;
const check = (ok, message) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const newPage = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/London' }); const page = await ctx.newPage(); page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e))); return page; };
const run = randomUUID().slice(0, 8);
const invitee = `family-${run}@example.com`;
const stranger = `stranger-${run}@example.com`;
const existing = `existing-${run}@example.com`;
const EXISTING_PASSWORD = 'Existing-pass-1234';
const FIRST_PASSWORD = 'Chosen-by-family-1';
const SECOND_PASSWORD = 'Chosen-after-reset-2';

async function signInUi(page, email, password) {
  await page.goto(`${BASE}/(onboarding)/account?mode=signin`); await settle(page);
  await page.getByTestId('account-email').fill(email);
  await page.getByTestId('account-password').fill(password);
  await page.getByTestId('account-signin').click(); await settle(page, 1800);
}

console.log('config: what the server says');
const settings = await (await fetch(`${AUTH}/settings`)).json();
check(settings.disable_signup === true, 'public sign-ups are disabled');
check(settings.mailer_autoconfirm === false, 'email confirmation is required');
check(settings.external?.anonymous_users === false, 'anonymous sign-ins are off');

console.log('10. an existing account stays accessible');
{
  const made = await admin('/admin/users', { email: existing, password: EXISTING_PASSWORD, email_confirm: true });
  check(made.status === 200, `an account created before sign-ups were closed exists (${made.status})`);
  const page = await newPage();
  await signInUi(page, existing, EXISTING_PASSWORD);
  const t = await text(page);
  check(!/Choose your password/i.test(t), 'an existing account is NOT asked to choose a password');
  const session = await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth-token/.test(k)).map((k) => JSON.parse(localStorage.getItem(k) || '{}')?.user?.email));
  check(session.includes(existing), 'an existing account is signed in (a real session exists for it)');
  check(!/Welcome back|Reset your password|Create your account/.test(t), 'and has left the sign-in screen');
  await shot(page, '10-existing-account');
  await page.context().close();
}

console.log('10b. recovery still works for an account that was never invited, with sign-ups off');
{
  const page = await newPage();
  await page.goto(`${BASE}/(onboarding)/account?mode=signin`); await settle(page);
  await page.getByRole('button', { name: /forgot password/i }).click(); await settle(page, 500);
  await page.getByTestId('account-email').fill(existing);
  const before = Date.now() - 1000;
  await page.getByRole('button', { name: /send reset link/i }).click(); await settle(page, 1500);
  const mail = await emailLink(existing, 'recovery', before);
  await page.goto(mail.link); await settle(page, 2500);
  check(/Choose your password/i.test(await text(page)), 'an existing account can recover its password');
  await page.getByTestId('account-password').fill('Existing-new-pass-5');
  await page.getByTestId('account-new-password').click(); await settle(page, 2500);
  check(!/Choose your password/i.test(await text(page)), 'and choose a new one');
  await page.context().close();
}

console.log('9. an uninvited person cannot register');
{
  const api = await fetch(`${AUTH}/signup`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'x' }, body: JSON.stringify({ email: stranger, password: 'Stranger-pass-123' }) });
  const body = await api.json();
  check(api.status >= 400 && /signup/i.test(JSON.stringify(body)), `the API refuses a sign-up (${api.status} ${body.error_code ?? body.msg ?? ''})`);
  const page = await newPage();
  await page.goto(`${BASE}/(onboarding)/account`); await settle(page);
  await page.getByTestId('account-email').fill(stranger);
  await page.getByTestId('account-password').fill('Stranger-pass-123');
  await page.getByTestId('account-create').click(); await settle(page, 1500);
  const t = await text(page);
  check(/by invitation/i.test(t), 'the app says FamilyPilot is by invitation (not a raw error)');
  check(/Forgot password/i.test(t), 'and says what to do if invited');
  check(sql(`select count(*) from auth.users where email='${stranger}'`) === '0', 'no account row was created for the stranger');
  await shot(page, '09-uninvited');
  await page.context().close();
}

console.log('1-4. an administrator invites a family; the link requires a password');
let inviteLinkStamp = 0;
{
  const sent = await admin('/invite', { email: invitee });
  check(sent.status === 200, `administrator invitation accepted (${sent.status})`);
  const mail = await emailLink(invitee, 'any');
  inviteLinkStamp = mail.stamp;
  check(/\/auth\/v1\/verify\?token=.*type=invite/.test(mail.link), 'the email carries a verify link of type=invite');
  const page = await newPage();
  await page.goto(mail.link); await settle(page, 2500);
  let t = await text(page);
  check(/Choose your password/i.test(t), 'following the invitation lands on "Choose your password"');
  await shot(page, '03-choose-password');
  // cannot skip it
  await page.goto(`${BASE}/`); await settle(page, 1800);
  t = await text(page);
  check(/Choose your password/i.test(t), 'going to the app address instead does not skip it');
  await page.goto(`${BASE}/(tabs)/profile`); await settle(page, 1800);
  t = await text(page);
  check(/Choose your password/i.test(t), 'a deep link to a tab does not skip it');
  // validation
  await page.getByTestId('account-password').fill('short');
  await page.getByTestId('account-new-password').click(); await settle(page, 600);
  t = await text(page);
  check(/at least 10/i.test(t) && /Choose your password/i.test(t), 'a short password is refused with a plain message');
  await page.getByTestId('account-password').fill(FIRST_PASSWORD);
  await page.getByTestId('account-new-password').click(); await settle(page, 2500);
  t = await text(page);
  check(!/Choose your password/i.test(t), 'a valid password is saved and the person moves on');
  await shot(page, '04-after-password');
  check(sql(`select coalesce(raw_user_meta_data->>'password_set','') from auth.users where email='${invitee}'`) === 'true', 'the account records that its password has been chosen');
  // 5. sign out
  await page.goto(`${BASE}/(tabs)/profile`); await settle(page, 2000);
  const hasProfile = await page.getByTestId('profile-signout').count();
  if (hasProfile) { await page.getByTestId('profile-signout').click(); await page.getByTestId('profile-signout-confirm').click(); await settle(page, 1500); }
  t = await text(page);
  check(hasProfile > 0 && !/Choose your password/i.test(t), '5. the person can sign out');
  // 6. sign back in
  await page.goto(`${BASE}/(onboarding)/account?mode=signin`); await settle(page);
  await page.getByTestId('account-email').fill(invitee);
  await page.getByTestId('account-password').fill('Wrong-password-12');
  await page.getByTestId('account-signin').click(); await settle(page, 1500);
  t = await text(page);
  check(/don.t match/i.test(t), '6a. a wrong password is refused');
  await page.getByTestId('account-password').fill(FIRST_PASSWORD);
  await page.getByTestId('account-signin').click(); await settle(page, 2500);
  t = await text(page);
  check(!/Welcome back|don.t match|Choose your password/i.test(t), '6b. the chosen password signs them back in');
  await shot(page, '06-signed-back-in');
  await page.context().close();
}

console.log('8a. the invitation link cannot be used twice');
{
  const page = await newPage();
  const mail = await emailLink(invitee, 'any');
  await page.goto(mail.link); await settle(page, 2500);
  const t = await text(page);
  const url = page.url();
  check(!/Choose your password/i.test(t), 'a reused invitation does not offer a password screen');
  check(/expired|already been used|no longer valid|invalid/i.test(t) || /error_code=otp_expired/.test(url), `it fails safely (${/error_code=[a-z_]+/.exec(url)?.[0] ?? 'message shown'})`);
  check(!(await page.evaluate(() => Object.keys(localStorage).some((k) => /auth-token/.test(k) && localStorage.getItem(k)))), 'and no session was created');
  await shot(page, '08a-reused-invite');
  await page.context().close();
}

console.log('7. password reset works (and ends with choosing a password)');
let resetLink;
{
  const page = await newPage();
  await page.goto(`${BASE}/(onboarding)/account?mode=signin`); await settle(page);
  await page.getByRole('button', { name: /forgot password/i }).click(); await settle(page, 500);
  await page.getByTestId('account-email').fill(invitee);
  const before = Date.now() - 1000;
  await page.getByRole('button', { name: /send reset link/i }).click(); await settle(page, 1500);
  check(/if there is an account/i.test(await text(page)), 'the app confirms without revealing whether the address exists');
  const mail = await emailLink(invitee, 'recovery', before);
  resetLink = mail.link;
  await page.goto(mail.link); await settle(page, 2500);
  let t = await text(page);
  check(/Choose your password/i.test(t), 'the reset link lands on "Choose your password"');
  await page.getByTestId('account-password').fill(SECOND_PASSWORD);
  await page.getByTestId('account-new-password').click(); await settle(page, 2500);
  check(!/Choose your password/i.test(await text(page)), 'the new password is saved');
  await shot(page, '07-reset-done');
  await page.context().close();
  const p2 = await newPage();
  await signInUi(p2, invitee, SECOND_PASSWORD);
  check(!/don.t match|Welcome back/i.test(await text(p2)), 'the NEW password works');
  await p2.context().close();
  const p3 = await newPage();
  await signInUi(p3, invitee, FIRST_PASSWORD);
  check(/don.t match/i.test(await text(p3)), 'the OLD password no longer works');
  await p3.context().close();
}

console.log('8b. a reset link cannot be reused');
{
  const page = await newPage();
  await page.goto(resetLink); await settle(page, 2500);
  const t = await text(page);
  check(!/Choose your password/i.test(t), 'a used reset link offers no password screen');
  check(/expired|already been used|no longer valid|invalid/i.test(t) || /error_code=otp_expired/.test(page.url()), 'it fails safely');
  await shot(page, '08b-reused-reset');
  await page.context().close();
}

console.log('8c. an expired reset link fails safely');
{
  const page = await newPage();
  await page.goto(`${BASE}/(onboarding)/account?mode=signin`); await settle(page);
  await page.getByRole('button', { name: /forgot password/i }).click();
  await page.getByTestId('account-email').fill(invitee);
  const before = Date.now() - 1000;
  await page.getByRole('button', { name: /send reset link/i }).click(); await settle(page, 1500);
  const mail = await emailLink(invitee, 'recovery', before);
  sql(`update auth.users set recovery_sent_at = now() - interval '3 hours' where email='${invitee}'`);
  await page.goto(mail.link); await settle(page, 2500);
  const t = await text(page);
  check(!/Choose your password/i.test(t), 'an expired link offers no password screen');
  check(/expired|already been used|no longer valid|invalid/i.test(t) || /error_code=otp_expired/.test(page.url()), 'it fails safely');
  await shot(page, '08c-expired');
  await page.context().close();
}

console.log('8d. an invalid / tampered link fails safely');
{
  const page = await newPage();
  await page.goto(`${AUTH}/verify?token=${'0'.repeat(32)}&type=recovery&redirect_to=${encodeURIComponent(BASE)}`); await settle(page, 2500);
  const t = await text(page);
  check(!/Choose your password/i.test(t), 'a made-up token offers no password screen');
  check(/expired|already been used|no longer valid|invalid/i.test(t) || /error_code=/.test(page.url()), 'it fails safely');
  const page2 = await newPage();
  await page2.goto(`${BASE}/#access_token=not-a-real-token&refresh_token=nope&type=recovery&expires_in=3600&token_type=bearer`); await settle(page2, 2500);
  check(!/Choose your password/i.test(await text(page2)), 'a forged token in the address bar offers no password screen');
  check(page2.errors.length === 0, `and nothing crashed (${page2.errors.length} page errors)`);
  await page.context().close(); await page2.context().close();
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
await browser.close();
process.exit(failed ? 1 : 0);
