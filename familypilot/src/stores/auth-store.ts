import { create } from 'zustand';

import { mustChoosePassword } from '@/src/services/account/credentials';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase/client';

/**
 * Whether there is a signed-in account on this device.
 *
 * Every FamilyPilot user has an account. This store is the one place the rest of the app reads that from: the root
 * navigator uses it to keep signed-out people on Welcome and account creation, and nothing else asks Supabase directly.
 *
 * When Supabase is not configured at all (a local build, the fixture server, CI) there is nothing to sign in to, so the
 * status is `disabled` and the app behaves as it did before accounts: that is how every visual and behavioural check
 * runs without an account backend. A deployed build always has Supabase configured, so `disabled` never reaches a
 * parent. `accountRequired()` is the single expression of that rule.
 */
export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'disabled';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  /** True once Supabase Auth reports the address as confirmed. */
  emailConfirmed: boolean;
  initialised: boolean;
  /**
   * True from the moment an invitation or password-reset link signs the person in until they have chosen their password. The
   * link creates a session, so without this an invited family would be signed in with no password of their own and could
   * never sign in again. Survives a reload: it is recorded on the account (`password_set`), not only in memory.
   */
  recovering: boolean;
  init: () => void;
  clearRecovery: () => void;
}

let subscribed = false;
/** Set by a password-reset link and kept until the password is chosen, whatever else the session reports meanwhile. */
let recoveryPending = false;

export const useAuthStore = create<AuthState>((set) => ({
  status: isSupabaseConfigured ? 'loading' : 'disabled',
  userId: null,
  email: null,
  emailConfirmed: false,
  initialised: false,
  recovering: false,
  clearRecovery: () => {
    recoveryPending = false;
    set({ recovering: false });
  },
  init: () => {
    if (subscribed) return;
    if (!supabase) {
      // Prerendering on the server has no client either, and must not claim the app is account-free: it stays loading.
      if (!isSupabaseConfigured) set({ status: 'disabled', initialised: true });
      return;
    }
    subscribed = true;
    type SessionUser = { id: string; email?: string | null; email_confirmed_at?: string | null; invited_at?: string | null; user_metadata?: Record<string, unknown> | null };
    const apply = (session: { user: SessionUser } | null) =>
      set(
        session
          ? { status: 'signed_in', userId: session.user.id, email: session.user.email ?? null, emailConfirmed: Boolean(session.user.email_confirmed_at), initialised: true, recovering: mustChoosePassword(session.user) || (recoveryPending && session.user.user_metadata?.password_set !== true) }
          : { status: 'signed_out', userId: null, email: null, emailConfirmed: false, initialised: true, recovering: (recoveryPending = false) },
      );
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    supabase.auth.onAuthStateChange((event, session) => {
      apply(session);
      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryPending = true;
        set({ recovering: true });
        // Record it on the account so a reload before the password is chosen does not skip the step. Deferred: calling the auth
        // client from inside its own state callback can deadlock it.
        setTimeout(() => void supabase?.auth.updateUser({ data: { password_set: false } }).catch(() => {}), 0);
      }
    });
  },
}));

/** A parent must have an account; a build with no auth backend (local, fixture, CI) is the only exception. */
export function accountRequired(): boolean {
  return isSupabaseConfigured;
}
