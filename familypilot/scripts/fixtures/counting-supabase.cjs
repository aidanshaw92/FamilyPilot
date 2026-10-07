/**
 * A fake Supabase admin client that answers queries from in-memory tables, COUNTS every round trip and can charge each
 * one a latency (optionally under a concurrency cap, as a connection pool would). Shared by the search benchmark
 * (scripts/bench-places-search.cjs) and the evidence-batch equivalence test, so both measure the same thing.
 *
 * Supports the query methods the search path uses: select, eq, neq, in, gte, lte, not(col,'is',null), is, order (several),
 * limit, range, maybeSingle/single, upsert/insert, and awaiting the builder.
 *
 * Like PostgREST, a read returns at most `maxRows` rows (Supabase's default max-rows is 1000) and says nothing when it
 * stops there, so code that forgets to page loses rows here exactly as it would in production.
 */
function createCountingClient({ latencyMs = 0, concurrency = Infinity, tables = {}, maxRows = 1000 } = {}) {
  const stats = { queries: 0, byTable: {}, inFlight: 0, peak: 0 };
  const waiting = [];
  async function roundTrip(table) {
    stats.queries += 1;
    stats.byTable[table] = (stats.byTable[table] || 0) + 1;
    while (stats.inFlight >= concurrency) await new Promise((r) => waiting.push(r));
    stats.inFlight += 1;
    stats.peak = Math.max(stats.peak, stats.inFlight);
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    stats.inFlight -= 1;
    const next = waiting.shift();
    if (next) next();
  }
  const table = (name) => (tables[name] = tables[name] || []);
  const client = {
    tables,
    from(name) {
      const rows = table(name);
      const filters = [];
      let limitN = Infinity;
      let offset = 0;
      const orders = [];
      const matches = () => {
        let out = rows.filter((r) => filters.every((f) => f(r)));
        if (orders.length) {
          out = [...out].sort((a, b) => {
            for (const { key, asc } of orders) {
              const x = String(a[key]);
              const y = String(b[key]);
              const c = asc ? x.localeCompare(y) : y.localeCompare(x);
              if (c !== 0) return c;
            }
            return 0;
          });
        }
        return out.slice(offset, offset + Math.min(limitN, maxRows)).map((r) => ({ ...r }));
      };
      const api = {
        select: () => api,
        eq: (k, v) => { filters.push((r) => r[k] === v); return api; },
        neq: (k, v) => { filters.push((r) => r[k] !== v); return api; },
        in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return api; },
        gte: (k, v) => { filters.push((r) => r[k] >= v); return api; },
        lte: (k, v) => { filters.push((r) => r[k] <= v); return api; },
        not: (k, op, v) => { filters.push((r) => (op === 'is' && v === null ? r[k] != null : true)); return api; },
        is: (k, v) => { filters.push((r) => r[k] === v); return api; },
        order: (key, o) => { orders.push({ key, asc: o?.ascending !== false }); return api; },
        limit: (n) => { limitN = n; return api; },
        range: (from, to) => { offset = from; limitN = to - from + 1; return api; },
        upsert: async () => { await roundTrip(name); return { error: null }; },
        insert: async () => { await roundTrip(name); return { error: null }; },
        maybeSingle: async () => { await roundTrip(name); return { data: matches()[0] ?? null, error: null }; },
        single: async () => { await roundTrip(name); return { data: matches()[0] ?? null, error: null }; },
        then: (resolve, reject) => roundTrip(name).then(() => resolve({ data: matches(), error: null }), reject),
      };
      return api;
    },
    rpc: async () => { await roundTrip('rpc'); return { data: null, error: null }; },
  };
  return { client, stats };
}

module.exports = { createCountingClient };
