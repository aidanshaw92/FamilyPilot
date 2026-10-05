import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const adminPath = require_.resolve('../../../server/enrichment/_lib/supabase-admin.js');
const handlerPath = '../../../api/planning/connections.js';

const { createFakeAdmin } = require_('../../scripts/fixtures/fake-supabase-admin.cjs');

function fakeAdmin() {
  const users: Record<string, string> = { 'token-alice': 'alice', 'token-bob': 'bob', 'token-cara': 'cara' };
  const admin = createFakeAdmin((token: string) => users[token] ?? null);
  return { rows: admin.tables.planning_connections ?? (admin.tables.planning_connections = []), client: admin.client };
}

function res() {
  const out: { statusCode: number; headers: Record<string, string>; body: any } = { statusCode: 200, headers: {}, body: undefined };
  return Object.assign(out, {
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
    status: (c: number) => { out.statusCode = c; return out; },
    json: (b: unknown) => { out.body = b; return out; },
    end: () => out,
  });
}

const family = (label: string, extra: Record<string, unknown> = {}) => ({
  label, area: 'Islington', latitude: 51.5362, longitude: -0.103, ages: [7, 2], maxDriveMinutes: 30, budgetTier: 'moderate', pushchair: true, required: ['babyChanging'], ...extra,
});

let admin: ReturnType<typeof fakeAdmin>;
let handler: (req: unknown, res: unknown) => Promise<unknown>;

async function call(method: string, token: string | null, opts: { body?: unknown; query?: Record<string, string> } = {}) {
  const response = res();
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: opts.body, query: opts.query ?? {} }, response);
  return response;
}

beforeEach(async () => {
  admin = fakeAdmin();
  require_.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getSupabaseAdmin: () => admin.client, isSupabaseConfigured: () => true } } as never;
  delete require_.cache[require_.resolve(handlerPath)];
  const mod = require_(handlerPath);
  handler = mod.default ?? mod;
});
afterEach(() => { delete require_.cache[adminPath]; });

describe('connection invitations', () => {
  async function invite(relationship?: string) {
    const created = await call('POST', 'token-alice', { body: { action: 'create', family: family('The Morgans', { relationship }) } });
    expect(created.statusCode).toBe(200);
    return created.body.code as string;
  }

  it('creates a 64-character single-use code and stores only its hash', async () => {
    const code = await invite('partner');
    expect(code).toMatch(/^[a-f0-9]{64}$/);
    expect(admin.rows).toHaveLength(1);
    expect(admin.rows[0].token_hash).toBe(createHash('sha256').update(code).digest('hex'));
    expect(JSON.stringify(admin.rows[0])).not.toContain(code);
  });

  it('lets a link be previewed before sign-in, showing the inviter’s label and nothing else', async () => {
    const code = await invite('friend');
    const preview = await call('GET', null, { query: { preview: code } });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toEqual({ valid: true, inviter: { label: 'The Morgans', relationship: 'friend' } });
    const text = JSON.stringify(preview.body);
    for (const secret of ['Islington', '51.5', '-0.1', 'ages', 'babyChanging', 'budget']) expect(text).not.toContain(secret);
  });

  it('shows nothing for a code that is unknown, malformed, expired or already used', async () => {
    const code = await invite();
    expect((await call('GET', null, { query: { preview: 'f'.repeat(64) } })).body).toEqual({ valid: false });
    expect((await call('GET', null, { query: { preview: 'not-a-code' } })).body).toEqual({ valid: false });
    admin.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await call('GET', null, { query: { preview: code } })).body).toEqual({ valid: false });
    admin.rows[0].expires_at = new Date(Date.now() + 86400000).toISOString();
    const accepted = await call('POST', 'token-bob', { body: { action: 'accept', code, family: family('The Patels') } });
    expect(accepted.statusCode).toBe(200);
    expect((await call('GET', null, { query: { preview: code } })).body).toEqual({ valid: false });
  });

  it('is single use: a second person cannot accept the same invitation', async () => {
    const code = await invite();
    expect((await call('POST', 'token-bob', { body: { action: 'accept', code, family: family('The Patels') } })).statusCode).toBe(200);
    const second = await call('POST', 'token-cara', { body: { action: 'accept', code, family: family('The Joneses') } });
    expect(second.statusCode).toBe(400);
  });

  it('will not let someone accept their own invitation', async () => {
    const code = await invite();
    const self = await call('POST', 'token-alice', { body: { action: 'accept', code, family: family('The Morgans') } });
    expect(self.statusCode).toBe(400);
  });

  it('will not accept an expired invitation', async () => {
    const code = await invite();
    admin.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await call('POST', 'token-bob', { body: { action: 'accept', code, family: family('The Patels') } })).statusCode).toBe(400);
  });

  it('tells the accepter who invited them, and shares nothing before acceptance', async () => {
    const code = await invite();
    const pendingForOwner = await call('GET', 'token-alice');
    expect(pendingForOwner.body.connections).toHaveLength(1);
    expect(pendingForOwner.body.connections[0]).toMatchObject({ pending: true, family: null });
    const accepted = await call('POST', 'token-bob', { body: { action: 'accept', code, family: family('The Patels') } });
    expect(accepted.body).toMatchObject({ ok: true, inviter: { label: 'The Morgans' } });
  });

  it('after acceptance each side sees only the other’s consented snapshot', async () => {
    const code = await invite('partner');
    await call('POST', 'token-bob', { body: { action: 'accept', code, family: family('The Patels', { latitude: 51.6, longitude: -0.2 }) } });
    const aliceView = (await call('GET', 'token-alice')).body.connections[0];
    const bobView = (await call('GET', 'token-bob')).body.connections[0];
    expect(aliceView.pending).toBe(false);
    expect(aliceView.family.label).toBe('The Patels');
    expect(bobView.family.label).toBe('The Morgans');
    // coordinates are rounded to about a kilometre before they are stored, and there is no address field at all
    expect(aliceView.family.latitude).toBe(51.6);
    expect(JSON.stringify(aliceView)).not.toMatch(/address|childName|email/);
  });

  it('ignores a relationship that is not one of the fixed words', async () => {
    await call('POST', 'token-alice', { body: { action: 'create', family: family('The Morgans', { relationship: 'my wife Jane at 3 Elm Road' }) } });
    expect(admin.rows[0].owner_snapshot.relationship).toBeUndefined();
  });

  it('lets either side remove a connection or cancel a pending invitation, and nobody else', async () => {
    await invite();
    const id = admin.rows[0].id;
    expect((await call('DELETE', 'token-cara', { body: { id } })).statusCode).toBe(200); // not hers: matches nothing
    expect(admin.rows).toHaveLength(1);
    expect((await call('DELETE', 'token-alice', { body: { id } })).statusCode).toBe(200);
    expect(admin.rows).toHaveLength(0);
  });

  it('requires an account for everything except the preview', async () => {
    expect((await call('POST', null, { body: { action: 'create', family: family('x') } })).statusCode).toBe(401);
    expect((await call('GET', null)).statusCode).toBe(401);
    expect((await call('GET', 'bad-token')).statusCode).toBe(401);
  });
});
