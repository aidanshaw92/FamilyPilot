import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: string, session: { user: { id: string; email: string; email_confirmed_at: string } } | null) => void;
const state: { listener: Listener | null; updated: Array<{ password: string }>; updateError: unknown } = { listener: null, updated: [], updateError: null };
vi.mock('@/src/services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: Listener) => { state.listener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      updateUser: async (a: { password: string }) => { state.updated.push(a); return { error: state.updateError }; },
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
    expect(state.updated).toEqual([{ password: 'a-long-enough-password' }]);
    state.updateError = { message: 'Failed to fetch' };
    expect(await setNewPassword('a-long-enough-password')).toEqual({ ok: false, failure: 'network' });
  });
});
