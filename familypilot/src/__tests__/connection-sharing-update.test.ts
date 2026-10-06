import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Older Connected Families keep their relationship and gain richer routines only when the person chooses.
 *
 * A connection made before routines carried a kind shares only "Home time". It must NOT have to be disconnected and
 * re-invited to share naps and feeds: the owner of each side can update their own side in place, through the same
 * allow-list a new invitation uses. Until they do, the old value stays as it was and is read conservatively.
 */

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

const LEGACY = [{ id: 'busy-0', label: 'Home time', time: '12:20', durationMinutes: 90, atHome: true }];

let admin: ReturnType<typeof fakeAdmin>;
let handler: (req: unknown, res: unknown) => Promise<unknown>;

async function call(method: string, token: string | null, opts: { body?: unknown; query?: Record<string, string> } = {}) {
  const response = res();
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: opts.body, query: opts.query ?? {} }, response);
  return response;
}

/** An accepted connection: Alice owns it, Bob accepted. Each side's snapshot is set directly, as an older version stored it. */
function connection(over: { owner?: Record<string, unknown>; guest?: Record<string, unknown>; accepted?: boolean } = {}) {
  admin.rows.push({
    id: '11111111-1111-4111-8111-111111111111',
    owner_id: 'alice',
    guest_id: over.accepted === false ? null : 'bob',
    owner_snapshot: { ...family('Alice’s family', { relationship: 'friend' }), routines: LEGACY, ...over.owner },
    guest_snapshot: over.accepted === false ? null : { ...family('Bob’s family'), routines: [], ...over.guest },
    accepted_at: over.accepted === false ? null : new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    token_hash: 'x',
  });
  return '11111111-1111-4111-8111-111111111111';
}

beforeEach(async () => {
  admin = fakeAdmin();
  require_.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getSupabaseAdmin: () => admin.client, isSupabaseConfigured: () => true } } as never;
  delete require_.cache[require_.resolve(handlerPath)];
  const mod = require_(handlerPath);
  handler = mod.default ?? mod;
});
afterEach(() => { delete require_.cache[adminPath]; });

describe('what I currently share is reported to me, and only to me', () => {
  it('reads an older "Home time" share as legacy, a current one as current, and nothing as none', async () => {
    connection();
    const alice = await call('GET', 'token-alice');
    expect(alice.body.connections[0].mySharing).toEqual({ routines: 'legacy', routineCount: 1 });
    const bob = await call('GET', 'token-bob');
    expect(bob.body.connections[0].mySharing).toEqual({ routines: 'none', routineCount: 0 });
    admin.rows[0].owner_snapshot.routines = [{ id: 'busy-0', label: 'Nap', kind: 'nap', time: '12:20', durationMinutes: 90, atHome: true }];
    expect((await call('GET', 'token-alice')).body.connections[0].mySharing).toEqual({ routines: 'current', routineCount: 1 });
  });

  it('shows the other family’s side as it is stored: the older value is untouched until its owner updates it', async () => {
    connection();
    const bob = await call('GET', 'token-bob');
    expect(bob.body.connections[0].family.routines).toEqual(LEGACY);
  });
});

describe('updating what I share, in place', () => {
  it('rewrites only my side, keeps the connection and the relationship, and gives routines a kind', async () => {
    const id = connection();
    const before = JSON.stringify(admin.rows[0].guest_snapshot);
    const updated = await call('POST', 'token-alice', {
      body: { action: 'update', id, family: family('Alice’s family', { shareAvailability: true, routines: [{ id: 'nap-1', label: 'Ozzie’s nap', kind: 'nap', time: '12:30', durationMinutes: 90, atHome: true }, { id: 'feed-1', label: 'Feed', kind: 'feed', time: '15:00', durationMinutes: 30, atHome: true }] }) },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.body.mySharing).toEqual({ routines: 'current', routineCount: 2 });

    expect(admin.rows).toHaveLength(1);
    expect(admin.rows[0].id).toBe(id);
    expect(admin.rows[0].accepted_at).toBeTruthy();
    // The other family's side is exactly as it was.
    expect(JSON.stringify(admin.rows[0].guest_snapshot)).toBe(before);
    // My side keeps the relationship I made it with, and now carries kinds, never a name or an id of mine.
    const mine = admin.rows[0].owner_snapshot;
    expect(mine.relationship).toBe('friend');
    expect(mine.routines.map((r: any) => [r.id, r.label, r.kind])).toEqual([['busy-0', 'Nap', 'nap'], ['busy-1', 'Feed', 'feed']]);
    expect(JSON.stringify(mine)).not.toMatch(/Ozzie/);
  });

  it('works from the guest’s side too, and writes the guest’s snapshot, not the owner’s', async () => {
    const id = connection();
    const ownerBefore = JSON.stringify(admin.rows[0].owner_snapshot);
    const done = await call('POST', 'token-bob', {
      body: { action: 'update', id, family: family('Bob’s family', { shareAvailability: true, routines: [{ id: 'n', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true }] }) },
    });
    expect(done.statusCode).toBe(200);
    expect(JSON.stringify(admin.rows[0].owner_snapshot)).toBe(ownerBefore);
    expect(admin.rows[0].guest_snapshot.routines).toHaveLength(1);
  });

  it('stops sharing routines when the person turns it off, and keeps the connection', async () => {
    const id = connection();
    const done = await call('POST', 'token-alice', { body: { action: 'update', id, family: family('Alice’s family', { shareAvailability: false, routines: [{ id: 'n', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true }] }) } });
    expect(done.body.mySharing).toEqual({ routines: 'none', routineCount: 0 });
    expect(admin.rows[0].owner_snapshot.routines).toEqual([]);
    expect(admin.rows[0].accepted_at).toBeTruthy();
  });

  it('applies the same allow-list as a new invitation: an invalid snapshot is refused and nothing changes', async () => {
    const id = connection();
    const before = JSON.stringify(admin.rows[0]);
    const refused = await call('POST', 'token-alice', { body: { action: 'update', id, family: { ...family('x'), ages: [99] } } });
    expect(refused.statusCode).toBe(400);
    expect(JSON.stringify(admin.rows[0])).toBe(before);
  });

  it('cannot touch a connection that is not mine', async () => {
    const id = connection();
    const before = JSON.stringify(admin.rows[0]);
    const refused = await call('POST', 'token-cara', { body: { action: 'update', id, family: family('Cara’s family', { shareAvailability: true, routines: [] }) } });
    expect(refused.statusCode).toBe(404);
    expect(JSON.stringify(admin.rows[0])).toBe(before);
  });

  it('cannot update an invitation nobody has accepted, and rejects a malformed id', async () => {
    const id = connection({ accepted: false });
    expect((await call('POST', 'token-alice', { body: { action: 'update', id, family: family('x') } })).statusCode).toBe(404);
    expect((await call('POST', 'token-alice', { body: { action: 'update', id: 'not-an-id', family: family('x') } })).statusCode).toBe(400);
  });

  it('needs a signed-in person', async () => {
    const id = connection();
    expect((await call('POST', null, { body: { action: 'update', id, family: family('x') } })).statusCode).toBe(401);
  });
});
