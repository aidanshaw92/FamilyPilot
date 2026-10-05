/**
 * A small in-memory stand-in for the Supabase admin client, implementing only the query methods the planning
 * endpoints use, so the REAL handler code (api/planning/connections.js) can run against it in tests and in the fixture
 * server with no database and no network.
 *
 * `resolveUser(token)` maps a bearer token to a user id (or null). Tables are plain arrays, shared by reference.
 */
function createFakeAdmin(resolveUser, tables = {}) {
  let seq = 0;
  const table = (name) => (tables[name] = tables[name] || []);

  function builder(name) {
    const rows = table(name);
    let op = 'select';
    let patch = {};
    let inserted = null;
    const filters = [];
    let head = false;
    let limitN = Infinity;
    const matches = () => rows.filter((r) => filters.every((f) => f(r))).slice(0, limitN);
    const api = {
      select: (_cols, opts) => { head = Boolean(opts && opts.head); return api; },
      insert: (row) => {
        op = 'insert';
        inserted = {
          id: `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          accepted_at: null, guest_id: null, guest_snapshot: null, ...row,
        };
        return api;
      },
      upsert: (row) => { op = 'upsert'; inserted = row; return api; },
      update: (p) => { op = 'update'; patch = p; return api; },
      delete: () => { op = 'delete'; return api; },
      eq: (k, v) => { filters.push((r) => r[k] === v); return api; },
      neq: (k, v) => { filters.push((r) => r[k] !== v); return api; },
      is: (k, v) => { filters.push((r) => r[k] === v); return api; },
      gt: (k, v) => { filters.push((r) => Date.parse(r[k]) > Date.parse(v)); return api; },
      gte: (k, v) => { filters.push((r) => r[k] >= v); return api; },
      in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return api; },
      or: (expr) => {
        const parts = expr.split(',').map((p) => p.split('.eq.'));
        filters.push((r) => parts.some(([k, v]) => r[k] === v));
        return api;
      },
      order: () => api,
      limit: (n) => { limitN = n; return api; },
      single: async () => api.maybeSingle(),
      maybeSingle: async () => {
        if (op === 'insert') { rows.push(inserted); return { data: inserted, error: null }; }
        if (op === 'update') { const hit = matches()[0]; if (hit) Object.assign(hit, patch); return { data: hit || null, error: null }; }
        return { data: matches()[0] || null, error: null };
      },
      then: (resolve) => {
        if (op === 'delete') { for (const r of matches()) rows.splice(rows.indexOf(r), 1); return resolve({ error: null }); }
        if (op === 'upsert') { rows.push(inserted); return resolve({ error: null }); }
        if (head) return resolve({ count: matches().length, error: null });
        return resolve({ data: matches(), error: null });
      },
    };
    return api;
  }

  return {
    tables,
    client: {
      from: (name) => builder(name),
      rpc: async () => ({ data: 1, error: null }),
      auth: {
        getUser: async (token) => {
          const id = resolveUser(token);
          return id ? { data: { user: { id, email: `${id}@example.test` } }, error: null } : { data: {}, error: { message: 'bad token' } };
        },
      },
    },
  };
}

module.exports = { createFakeAdmin };
