import { create } from 'zustand';

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
   * True from the moment a password-reset link signs the person in until they have chosen a new password. The link creates a
   * session, so without this a family invited by "Forgot password" would be signed in with no password of their own.
   */
  recovering: boolean;
  init: () => void;
  clearRecovery: () => void;
}

let subscribed = false;

export const useAuthStore = create<AuthState>((set) => ({
  status: isSupabaseConfigured ? 'loading' : 'disabled',
  userId: null,
  email: null,
  emailConfirmed: false,
  initialised: false,
  recovering: false,
  clearRecovery: () => set({ recovering: false }),
  init: () => {
    if (subscribed) return;
    if (!supabase) {
      // Prerendering on the server has no client either, and must not claim the app is account-free: it stays loading.
      if (!isSupabaseConfigured) set({ status: 'disabled', initialised: true });
      return;
    }
    subscribed = true;
    const apply = (session: { user: { id: string; email?: string | null; email_confirmed_at?: string | null } } | null) =>
      set(
        session
          ? { status: 'signed_in', userId: session.user.id, email: session.user.email ?? null, emailConfirmed: Boolean(session.user.email_confirmed_at), initialised: true }
          : { status: 'signed_out', userId: null, email: null, emailConfirmed: false, initialised: true },
      );
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    supabase.auth.onAuthStateChange((event, session) => {
      apply(session);
      if (event === 'PASSWORD_RECOVERY') set({ recovering: true });
      else if (!session) set({ recovering: false });
    });
  },
}));

/** A parent must have an account; a build with no auth backend (local, fixture, CI) is the only exception. */
export function accountRequired(): boolean {
  return isSupabaseConfigured;
}
