import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The crash-report branch of api/planning/feedback.js, called as the platform calls it, with the database and the auth check
 * stubbed: who may send, what is refused, what reaches the log, and that the account never does.
 */
const req = createRequire(import.meta.url);
const root = '../../../';
let handler: (rq: unknown, rs: unknown) => Promise<unknown>;
let users: Record<string, { id: string; is_anonymous?: boolean }>;

function stub(path: string, exports: unknown) {
  const resolved = req.resolve(root + path);
  req.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports, children: [], paths: [], path: '' } as never;
}

beforeAll(() => {
  users = { good: { id: 'user-aaaa' }, anon: { id: 'user-anon', is_anonymous: true } };
  stub('server/enrichment/_lib/supabase-admin.js', { getSupabaseAdmin: () => ({ auth: { getUser: async (t: string) => (users[t] ? { data: { user: users[t] }, error: null } : { data: { user: null }, error: { message: 'bad' } }) }, rpc: async () => ({ data: null, error: null }) }) });
  stub('server/enrichment/_lib/claims-store.js', { getActiveClaims: async () => [] });
  stub('server/places/lib/canonical-venues.js', { resolvePrimaryPlaceId: async (id: string) => id });
  stub('server/feedback/_lib/store.js', { venueFeedback: async () => ({}) });
  stub('server/accounts/preview-guard.js', { refuseOnPreview: () => false });
  handler = req(root + 'api/planning/feedback.js');
});
afterEach(() => vi.restoreAllMocks());

function call(body: unknown, token?: string, method = 'POST') {
  const out: { status: number; json: unknown } = { status: 200, json: undefined };
  const res = { setHeader() {}, status(c: number) { out.status = c; return res; }, json(j: unknown) { out.json = j; return res; } };
  return handler({ method, query: {}, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res).then(() => out);
}
const report = (over: Record<string, unknown> = {}) => ({ kind: 'client-error', errorKind: 'uncaught', message: 'boom', route: '/venue/fp-x', ...over });

describe('POST feedback { kind: "client-error" }', () => {
  it('needs a signed-in, non-anonymous account', async () => {
    expect((await call(report())).status).toBe(401);
    expect((await call(report(), 'nobody')).status).toBe(401);
    expect((await call(report(), 'anon')).status).toBe(401);
  });

  it('refuses an empty or malformed report', async () => {
    expect((await call(report({ message: '' }), 'good')).status).toBe(400);
    expect((await call({ kind: 'client-error' }, 'good')).status).toBe(400);
  });

  it('logs one scrubbed line, never the account, and answers ok', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await call(report({ message: 'failed for sam@example.com on 2024-06-15', profile: { children: [{ name: 'Ida' }] } }), 'good');
    expect(out).toEqual({ status: 200, json: { ok: true } });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line.startsWith('client-error {')).toBe(true);
    for (const leak of ['user-aaaa', 'sam@example.com', '2024-06-15', 'Ida', 'children']) expect(line).not.toContain(leak);
  });

  it('answers ok but logs nothing past ten reports a minute from one account (abuse cap)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    users.noisy = { id: 'user-noisy' };
    for (let i = 0; i < 14; i++) expect((await call(report({ message: `m${i}` }), 'noisy')).status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(10);
  });
});
