import { beforeEach, describe, expect, it, vi } from 'vitest';

type U = { id: string; email: string; email_confirmed_at: string; invited_at?: string; user_metadata?: Record<string, unknown> };
type Listener = (event: string, session: { user: U } | null) => void;
const state: { listener: Listener | null; updated: Array<{ password: string; data?: Record<string, unknown> }>; updateError: unknown } = { listener: null, updated: [], updateError: null };
vi.mock('@/src/services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: Listener) => { state.listener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      updateUser: async (a: { password?: string; data?: Record<string, unknown> }) => { if (a.password) state.updated.push({ password: a.password, data: a.data }); return { error: state.updateError }; },
    },
  },
}));
import { setNewPassword } from '@/src/services/account/auth-service';
import { useAuthStore } from '@/src/stores/auth-store';

const session = { user: { id: 'u1', email: 'family@example.com', email_confirmed_at: '2026-10-01' } };

describe('a reset or invitation link must end with the person choosing a password', () => {
  beforeEach(() => { state.updated = []; state.updateError = null; });

  it('is flagged as recovering when the link signs them in, and cleared once the password is set', () => {
    useAuthStore.getState().init();
    expect(useAuthStore.getState().recovering).toBe(false);
    state.listener!('PASSWORD_RECOVERY', session);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_in', recovering: true });
    state.listener!('TOKEN_REFRESHED', session);
    expect(useAuthStore.getState().recovering).toBe(true);
    useAuthStore.getState().clearRecovery();
    expect(useAuthStore.getState().recovering).toBe(false);
  });

  it('is cleared when the session ends', () => {
    state.listener!('PASSWORD_RECOVERY', session);
    state.listener!('SIGNED_OUT', null);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_out', recovering: false });
  });

  it('a normal sign-in never looks like recovery', () => {
    state.listener!('SIGNED_IN', session);
    expect(useAuthStore.getState().recovering).toBe(false);
  });

  it('setNewPassword updates the signed-in session and reports a failure plainly', async () => {
    expect(await setNewPassword('a-long-enough-password')).toEqual({ ok: true });
    expect(state.updated).toEqual([{ password: 'a-long-enough-password', data: { password_set: true } }]);
    state.updateError = { message: 'Failed to fetch' };
    expect(await setNewPassword('a-long-enough-password')).toEqual({ ok: false, failure: 'network' });
  });
});

describe('an invitation link (no recovery event) also ends with choosing a password', () => {
  const invited: U = { id: 'u2', email: 'invited@example.com', email_confirmed_at: '2026-10-09', invited_at: '2026-10-09' };

  it('an invited account with no password yet is held on the step, on sign-in and on a reload', () => {
    state.listener!('SIGNED_IN', { user: invited });
    expect(useAuthStore.getState().recovering).toBe(true);
    state.listener!('INITIAL_SESSION', { user: invited });
    expect(useAuthStore.getState().recovering).toBe(true);
  });

  it('once the password is chosen (recorded on the account) it is never asked again', () => {
    state.listener!('USER_UPDATED', { user: { ...invited, user_metadata: { password_set: true } } });
    expect(useAuthStore.getState().recovering).toBe(false);
    state.listener!('TOKEN_REFRESHED', { user: { ...invited, user_metadata: { password_set: true } } });
    expect(useAuthStore.getState().recovering).toBe(false);
  });

  it('an account that has always had a password is never asked, whatever else it has', () => {
    state.listener!('SIGNED_IN', { user: { id: 'u3', email: 'old@example.com', email_confirmed_at: '2025-01-01', user_metadata: { something: 1 } } });
    expect(useAuthStore.getState().recovering).toBe(false);
  });

  it('a reset flagged password_set=false stays on the step after a reload', () => {
    state.listener!('INITIAL_SESSION', { user: { id: 'u4', email: 'old@example.com', email_confirmed_at: '2025-01-01', user_metadata: { password_set: false } } });
    expect(useAuthStore.getState().recovering).toBe(true);
  });
});
