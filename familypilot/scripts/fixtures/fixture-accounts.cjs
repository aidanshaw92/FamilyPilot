/**
 * A local, in-memory account backend for the fixture server: enough of Supabase Auth's HTTP API for the real
 * supabase-js client to sign up, confirm an email, sign in, refresh and sign out, plus the REAL connections handler
 * (api/planning/connections.js) running against an in-memory table.
 *
 * It exists so the complete first-run journey (Welcome, create account, verify email, family, invite, Home; and the
 * recipient's accept) can be driven in a real browser with no Supabase project, no email provider and no network.
 * Nothing here is a model of production: it is the smallest thing the client's own code will talk to.
 *
 * Test hooks (never reachable in production: this module is loaded only by scripts/serve-places-fixture.mjs, which
 * refuses to start in a production environment):
 *   GET  /__fixture/confirm?email=...   simulates clicking the verification link: confirms and redirects with a session
 *   GET  /__fixture/emails              the verification emails "sent" so far
 *   POST /__fixture/reset               forgets every account, email and connection
 */
const { createRequire } = require('node:module');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const req_ = createRequire(__filename);
const { createFakeAdmin } = require('./fake-supabase-admin.cjs');

const REQUIRE_CONFIRMATION = process.env.FIXTURE_AUTH_CONFIRM !== '0';

const users = new Map(); // email -> { id, email, password, confirmed }
const sent = []; // { to, type, at }
let admin = null;

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function jwtFor(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.fixture`;
}
function subFromToken(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()).sub || null;
  } catch {
    return null;
  }
}
function userJson(user) {
  return {
    id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
    email_confirmed_at: user.confirmed ? new Date().toISOString() : null,
    identities: [{ id: user.id, provider: 'email' }], app_metadata: { provider: 'email' }, user_metadata: {},
    created_at: new Date().toISOString(),
  };
}
function sessionJson(user) {
  return { access_token: jwtFor(user), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r.${user.id}`, user: userJson(user) };
}

function ensureAdmin() {
  if (admin) return admin;
  admin = createFakeAdmin((token) => subFromToken(token), {});
  // The real handler requires this module for its database client; hand it ours before it loads.
  const adminPath = req_.resolve(path.join(__dirname, '..', '..', '..', 'server', 'enrichment', '_lib', 'supabase-admin.js'));
  req_.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getSupabaseAdmin: () => admin.client, isSupabaseConfigured: () => true } };
  return admin;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Adapts a Node response to the `res.status().json()` shape the Vercel-style handler uses. */
function vercelRes(res) {
  const headers = {};
  let code = 200;
  const out = {
    setHeader: (k, v) => { headers[k] = v; },
    status: (c) => { code = c; return out; },
    json: (body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers }); res.end(JSON.stringify(body)); return out; },
    end: () => { res.writeHead(code, headers); res.end(); return out; },
    redirect: () => out,
  };
  return out;
}

/** Returns true when it handled the request. */
async function handleAccountRoutes(req, res, url) {
  const p = url.pathname;

  if (req.method === 'OPTIONS' && (p.startsWith('/auth/v1/') || p === '/api/planning/connections')) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
    res.end();
    return true;
  }

  if (p === '/__fixture/reset' && req.method === 'POST') {
    users.clear(); sent.length = 0; admin = null;
    json(res, 200, { ok: true });
    return true;
  }
  if (p === '/__fixture/emails') {
    json(res, 200, { emails: sent });
    return true;
  }
  if (p === '/__fixture/confirm') {
    const email = (url.searchParams.get('email') || '').toLowerCase();
    const user = users.get(email);
    if (!user) { json(res, 404, { error: 'no such user' }); return true; }
    user.confirmed = true;
    const s = sessionJson(user);
    const hash = `access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer&type=signup`;
    res.writeHead(302, { Location: `/#${hash}` });
    res.end();
    return true;
  }

  if (p === '/auth/v1/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').toLowerCase();
    if (!email || !body.password) return json(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Email and password required' }), true;
    const existing = users.get(email);
    if (existing) {
      // Like Supabase with confirmation on: no error, no email, and a user with no identities.
      json(res, 200, { ...userJson(existing), identities: [] });
      return true;
    }
    const user = { id: randomUUID(), email, password: body.password, confirmed: !REQUIRE_CONFIRMATION };
    users.set(email, user);
    if (REQUIRE_CONFIRMATION) {
      sent.push({ to: email, type: 'signup', at: new Date().toISOString() });
      json(res, 200, userJson(user));
    } else {
      json(res, 200, sessionJson(user));
    }
    return true;
  }

  if (p === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const body = await readBody(req);
    if (grant === 'refresh_token') {
      const id = String(body.refresh_token || '').replace(/^r\./, '');
      const user = [...users.values()].find((u) => u.id === id);
      if (!user) return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }), true;
      json(res, 200, sessionJson(user));
      return true;
    }
    const user = users.get(String(body.email || '').toLowerCase());
    if (!user || user.password !== body.password) return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), true;
    if (!user.confirmed) return json(res, 400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }), true;
    json(res, 200, sessionJson(user));
    return true;
  }

  if (p === '/auth/v1/user' && req.method === 'GET') {
    const id = subFromToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    const user = [...users.values()].find((u) => u.id === id);
    if (!user) return json(res, 401, { code: 401, msg: 'invalid JWT' }), true;
    json(res, 200, userJson(user));
    return true;
  }

  if (p === '/auth/v1/resend' && req.method === 'POST') {
    const body = await readBody(req);
    sent.push({ to: String(body.email || '').toLowerCase(), type: 'resend', at: new Date().toISOString() });
    json(res, 200, {});
    return true;
  }
  if (p === '/auth/v1/recover' && req.method === 'POST') {
    json(res, 200, {});
    return true;
  }
  if (p === '/auth/v1/logout') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return true;
  }

  if (p === '/api/planning/connections') {
    ensureAdmin();
    const handlerPath = req_.resolve(path.join(__dirname, '..', '..', '..', 'api', 'planning', 'connections.js'));
    const handler = req_(handlerPath);
    const body = req.method === 'POST' || req.method === 'DELETE' ? await readBody(req) : undefined;
    const query = Object.fromEntries(url.searchParams.entries());
    await (handler.default || handler)({ method: req.method, headers: req.headers, body, query }, vercelRes(res));
    return true;
  }

  return false;
}

module.exports = { handleAccountRoutes };
