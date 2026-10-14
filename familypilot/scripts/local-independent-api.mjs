/**
 * PREVIEW ONLY. Serves the exported web build and runs the REAL `/api/places/*` handlers against an empty stored Google catalogue, so the app shows
 * exactly what it would show after the Google rows have expired: the independently sourced venues in the registry, and nothing else. No Google
 * request is made; no database is read (a stub client answers "no rows"); nothing is written.
 *
 * Usage: node scripts/local-independent-api.mjs [port] [distDir]
 */
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(process.cwd(), '..');
const PORT = Number(process.argv[2] ?? 4180);
const DIST = process.argv[3] ?? join(process.cwd(), 'dist');

// A database client that holds no rows: every select resolves to an empty list, so the catalogue is the independent registry alone.
const empty = { data: [], error: null };
const chain = new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'then' ? (resolve) => resolve(empty) : () => chain),
  apply: () => chain,
});
const stub = { from: () => chain, rpc: async () => empty };
const adminPath = require.resolve(join(ROOT, 'server/enrichment/_lib/supabase-admin.js'));
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getSupabaseAdmin: () => stub, isSupabaseConfigured: () => false } };

// Every serverless handler the app calls, mounted at its Vercel path. Nothing is switched on: Google and TfL stay off (no keys, no network), so a journey
// time is whatever the server's own estimate says, and a call that needs a service we do not have fails as it would with the service off.
const handlers = {};
for (const [dir, name] of [['places', 'search'], ['places', 'detail'], ['places', 'status'], ['context', 'journey'], ['context', 'weather']]) {
  try { handlers[`/api/${dir}/${name}`] = require(join(ROOT, `api/${dir}/${name}.js`)); } catch (error) { console.warn(`not mounted: ${dir}/${name}: ${error.message}`); }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const IMMUTABLE = process.env.IMMUTABLE_ASSETS === '1';
const gzCache = new Map();
/** Static files as Vercel serves them: compressed when the browser accepts it, and (when IMMUTABLE_ASSETS=1) hashed assets cached for a year. */
function serveStatic(req, res, pathname) {
  let file = normalize(join(DIST, pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(`${file}.html`) ? `${file}.html` : join(DIST, 'index.html');
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type };
  if (IMMUTABLE && /^\/(_expo\/static|assets)\//.test(pathname)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  const compress = /gzip/.test(req.headers['accept-encoding'] ?? '') && /(javascript|css|json|html|svg|ttf)/.test(type + extname(file));
  if (compress) {
    if (!gzCache.has(file)) gzCache.set(file, gzipSync(readFileSync(file), { level: 6 }));
    const body = gzCache.get(file);
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': body.length });
    return res.end(body);
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = handlers[url.pathname];
  if (!handler) {
    if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"not served by the local independent API"}'); }
    return serveStatic(req, res, url.pathname);
  }
  req.query = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    const chunks = []; for await (const c of req) chunks.push(c);
    try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { req.body = {}; }
  }
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.end(typeof body === 'string' ? body : JSON.stringify(body)); return res; };
  res.json = (body) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); return res; };
  try { await handler(req, res); } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(error?.message ?? error) })); }
}).listen(PORT, () => console.log(`independent-only API and app on http://localhost:${PORT}`));
