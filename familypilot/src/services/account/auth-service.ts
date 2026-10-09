import { supabase } from '@/src/services/supabase/client';

import { AuthFailure, classifyAuthError, normaliseEmail } from './credentials';

/**
 * Account creation and sign-in, on top of Supabase Auth with an email and a password.
 *
 * WHY EMAIL AND PASSWORD. It is what the app already used (Plans, Families & routines), needs no extra provider and no
 * paid service, and works on web and native alike. The address is verified by the email Supabase sends: with email
 * confirmation on (the recommended setting, see docs/ACCOUNTS_AND_CONNECTIONS.md) `signUp` returns no session until the
 * link is followed, and this module reports that as `needs_verification` rather than treating it as an error. With
 * confirmation off it returns a session at once, and the person goes straight on.
 *
 * WHAT IS SENT. An email address and a password, to Supabase Auth, and nothing else: no name, no child's details, no
 * home location. The family profile stays on the device exactly as before; having an account does not upload it.
 */
export type SignUpResult =
  | { status: 'signed_in' }
  | { status: 'needs_verification' }
  | { status: 'failed'; failure: AuthFailure; message?: string };

export type SignInResult = { status: 'signed_in' } | { status: 'failed'; failure: AuthFailure };

function redirectTarget(): string | undefined {
  return typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/` : undefined;
}

export async function createAccount(email: string, password: string): Promise<SignUpResult> {
  if (!supabase) return { status: 'failed', failure: 'other', message: 'Accounts are not available in this build.' };
  try {
    const { data, error } = await supabase.auth.signUp({
      email: normaliseEmail(email),
      password,
      options: { emailRedirectTo: redirectTarget() },
    });
    if (error) return { status: 'failed', failure: classifyAuthError(error), message: error.message };
    // With confirmation on, signing up an address that already has a confirmed account is not an error (that would
    // reveal which addresses are registered): it returns a user with no identities and sends nothing.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { status: 'failed', failure: 'already-registered' };
    }
    return data.session ? { status: 'signed_in' } : { status: 'needs_verification' };
  } catch {
    return { status: 'failed', failure: 'network' };
  }
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (!supabase) return { status: 'failed', failure: 'other' };
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: normaliseEmail(email), password });
    return error ? { status: 'failed', failure: classifyAuthError(error) } : { status: 'signed_in' };
  } catch {
    return { status: 'failed', failure: 'network' };
  }
}

/** Sends the verification email again. */
export async function resendVerification(email: string): Promise<{ ok: boolean; failure?: AuthFailure }> {
  if (!supabase) return { ok: false, failure: 'other' };
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normaliseEmail(email),
      options: { emailRedirectTo: redirectTarget() },
    });
    return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; failure?: AuthFailure }> {
  if (!supabase) return { ok: false, failure: 'other' };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(normaliseEmail(email), { redirectTo: redirectTarget() });
    return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

/** Sets the password for the signed-in session: the last step of a reset or invitation link. */
export async function setNewPassword(password: string): Promise<{ ok: boolean; failure?: AuthFailure }> {
  if (!supabase) return { ok: false, failure: 'other' };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
