import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { accountsAllowedHere, refuseOnPreview } = require_('../../../server/accounts/preview-guard.js');

function fakeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {} }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('accounts never exist on a Vercel Preview', () => {
  it('the server refuses on preview, and only on preview', () => {
    expect(accountsAllowedHere({ VERCEL_ENV: 'preview' })).toBe(false);
    for (const env of [{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'development' }, {}]) expect(accountsAllowedHere(env)).toBe(true);
    const res = fakeRes();
    expect(refuseOnPreview(res, { VERCEL_ENV: 'preview' })).toBe(true);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('accounts_disabled_on_preview');
    const ok = fakeRes();
    expect(refuseOnPreview(ok, { VERCEL_ENV: 'production' })).toBe(false);
    expect(ok.body).toBeNull();
  });

  it('every account-bearing endpoint calls the guard before it touches Supabase', () => {
    const fs = require_('node:fs');
    for (const file of ['connections.js', 'plan-invites.js', 'feedback.js']) {
      const text = fs.readFileSync(require_.resolve(`../../../api/planning/${file}`), 'utf8');
      const guard = text.indexOf('refuseOnPreview(res)');
      expect(guard, file).toBeGreaterThan(-1);
      // The guard comes before the first account read (auth.getUser) in each handler.
      const firstAuth = text.indexOf('auth.getUser');
      expect(guard, file).toBeLessThan(firstAuth);
    }
  });

  describe('the client build', () => {
    const KEYS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_DEPLOY_ENV'] as const;
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    afterEach(() => {
      for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
      vi.resetModules();
    });
    const load = async (deploy: string | undefined) => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0123456789abcdef';
      if (deploy === undefined) delete process.env.EXPO_PUBLIC_DEPLOY_ENV; else process.env.EXPO_PUBLIC_DEPLOY_ENV = deploy;
      vi.resetModules();
      return import('@/src/services/supabase/client');
    };

    it('a preview build is not configured for accounts even though it has the Supabase keys', async () => {
      const m = await load('preview');
      expect(m.accountsBlockedOnThisBuild).toBe(true);
      expect(m.isSupabaseConfigured).toBe(false);
    });

    it('production, development, and unstamped (local, CI, fixture) builds keep accounts', async () => {
      for (const deploy of ['production', 'development', undefined]) {
        const m = await load(deploy);
        expect(m.accountsBlockedOnThisBuild, String(deploy)).toBe(false);
        expect(m.isSupabaseConfigured, String(deploy)).toBe(true);
      }
    });

    it('the build script stamps VERCEL_ENV into the bundle', () => {
      const fs = require_('node:fs');
      const script = fs.readFileSync(require_.resolve('../../scripts/build-web.mjs'), 'utf8');
      expect(script).toMatch(/EXPO_PUBLIC_DEPLOY_ENV/);
      expect(script).toMatch(/VERCEL_ENV/);
      const pkg = JSON.parse(fs.readFileSync(require_.resolve('../../package.json'), 'utf8'));
      expect(pkg.scripts['build:web']).toBe('node scripts/build-web.mjs');
    });
  });
});
