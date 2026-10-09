/**
 * What an email and a password have to look like before they are sent anywhere. Pure, so the same rules run in the
 * form, the tests and any future server check. Deliberately modest: the real check is the one Supabase Auth makes, and
 * the aim here is to catch a typo before a verification email goes to the wrong address.
 */
export const MIN_PASSWORD_LENGTH = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailProblem(value: string): string | null {
  const email = normaliseEmail(value);
  if (!email) return 'Enter your email address.';
  if (!EMAIL.test(email)) return 'That doesn’t look like an email address. Check it for a typo.';
  return null;
}

export function passwordProblem(value: string): string | null {
  if (!value) return 'Choose a password.';
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

/** Hides most of an address for display ("a***@gmail.com") where the whole of it is not needed on screen. */
export function maskEmail(value: string): string {
  const email = normaliseEmail(value);
  const at = email.indexOf('@');
  if (at < 2) return email;
  return `${email[0]}${'*'.repeat(Math.min(3, at - 1))}${email.slice(at)}`;
}

export type AuthFailure = 'invite-only' | 'link-expired' | 'link-invalid' | 'email-not-confirmed' | 'invalid-credentials' | 'already-registered' | 'rate-limited' | 'network' | 'other';

/** Turns whatever Supabase Auth said into the one thing the screen has to decide on. */
export function classifyAuthError(error: { message?: string; status?: number; code?: string } | null | undefined): AuthFailure {
  const message = (error?.message ?? '').toLowerCase();
  const code = (error?.code ?? '').toLowerCase();
  // Public sign-up switched off (the beta is by invitation): Supabase says so by code, and by these words on older versions.
  if (code === 'signup_disabled' || code === 'email_provider_disabled' || message.includes('signups not allowed') || message.includes('signup is disabled') || message.includes('signups are disabled')) return 'invite-only';
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'email-not-confirmed';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'invalid-credentials';
  if (code === 'user_already_exists' || message.includes('already registered') || message.includes('already been registered')) return 'already-registered';
  if (error?.status === 429 || code.includes('rate_limit') || message.includes('rate limit') || message.includes('too many')) return 'rate-limited';
  if (message.includes('fetch') || message.includes('network') || error?.status === 0) return 'network';
  return 'other';
}

export const AUTH_FAILURE_COPY: Record<AuthFailure, string> = {
  'invite-only': 'FamilyPilot is by invitation for now. If you were invited, open the link in your invitation email. If it has expired, choose Sign in, then “Forgot password”, with the email address the invitation went to.',
  'link-expired': 'That link has expired or has already been used. Sign in, or choose “Forgot password” and we will send a new one.',
  'link-invalid': 'That link didn’t work. Sign in, or choose “Forgot password” and we will send a new one.',
  'email-not-confirmed': 'Your email isn’t verified yet. Open the link we sent you, then try again.',
  'invalid-credentials': 'That email and password don’t match. Check them, or choose “Forgot password”.',
  'already-registered': 'There’s already an account with that email. Sign in instead.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  network: 'We couldn’t reach FamilyPilot. Check your connection and try again.',
  other: 'Something went wrong. Please try again.',
};

/**
 * Supabase reports a link that cannot be used (expired, already used, tampered with) by redirecting back to the app with
 * `#error=...&error_code=otp_expired&error_description=...` in the address. Reads that, and nothing else from it.
 */
export function parseAuthLinkError(hashOrSearch: string | null | undefined): 'link-expired' | 'link-invalid' | null {
  const raw = (hashOrSearch ?? '').replace(/^[#?]/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const code = (params.get('error_code') ?? '').toLowerCase();
  if (!params.get('error') && !code) return null;
  if (code === 'otp_expired' || /expired|already been used/i.test(params.get('error_description') ?? '')) return 'link-expired';
  return 'link-invalid';
}

/** Minimal shape of the signed-in user that decides whether a password still has to be chosen. */
export function mustChoosePassword(user: { invited_at?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!user) return false;
  const flag = user.user_metadata?.password_set;
  if (flag === true) return false;
  if (flag === false) return true;
  // An invited account has no password until its owner chooses one; any other account was created with one.
  return Boolean(user.invited_at);
}
