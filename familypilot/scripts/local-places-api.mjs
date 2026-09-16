/**
 * A stand-in for the `/api/places/*` routes, for driving the exported web build locally.
 *
 * The static export has no API, so `placesApiClient.search` 404s and the app falls back to the
 * bundled mock venues — which carry no photos, so every screenshot shows the category-gradient
 * fallback whatever the real data looks like. This serves the real production rows instead, taken
 * verbatim from `place_records`, so the deck is exercised with the photo paths it will actually
 * receive.
 *
 * `/api/places/photo` is where the resemblance stops. In production it resolves the Google photo
 * reference server-side and 302s to a signed googleusercontent URL. This sandbox cannot reach
 * either host, so the stub answers with a flat placeholder unless PHOTO_BYTES names a directory of
 * real images. Those bytes are a harness convenience for proving the client renders what it
 * fetches — they are never a venue's real photograph and must not be read as one.
 *
 * Usage: node scripts/local-places-api.mjs [port] [distDir]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2] ?? 4173);
const DIST = process.argv[3] ?? join(process.cwd(), 'dist');
const FIXTURE = join(process.cwd(), 'scripts', 'fixtures', 'production-places.json');
const PHOTO_BYTES = process.env.PHOTO_BYTES;

const places = JSON.parse(readFileSync(FIXTURE, 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** A 1x1 grey PNG: enough for expo-image to report a successful load. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const photoFiles = PHOTO_BYTES && existsSync(PHOTO_BYTES)
  ? readdirSync(PHOTO_BYTES).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f)).sort()
  : [];

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function servePhoto(res, id, index) {
  if (photoFiles.length === 0) {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    return res.end(PLACEHOLDER_PNG);
  }
  // Deterministic per place + index, so a given card always gets the same stand-in.
  const hash = [...`${id}${index}`].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const file = photoFiles[hash % photoFiles.length];
  const path = join(PHOTO_BYTES, file);
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': statSync(path).size,
    'Cache-Control': 'no-store',
  });
  createReadStream(path).pipe(res);
}

function serveStatic(res, pathname) {
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, clean);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const asHtml = `${file.replace(/\/$/, '')}.html`;
    file = existsSync(asHtml) ? asHtml : join(DIST, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/api/places/search') {
    return json(res, { provider: 'google', places, cachedAt: new Date().toISOString() });
  }

  if (url.pathname === '/api/places/detail') {
    const id = url.searchParams.get('id');
    const place = places.find((p) => p.familypilotId === id);
    return place
      ? json(res, { provider: 'google', place })
      : json(res, { error: 'Not found' }, 404);
  }

  if (url.pathname === '/api/places/photo') {
    return servePhoto(res, url.searchParams.get('id') ?? '', url.searchParams.get('index') ?? '0');
  }

  if (url.pathname.startsWith('/api/')) {
    return json(res, { error: 'Not stubbed' }, 501);
  }

  return serveStatic(res, url.pathname);
}).listen(PORT, () => {
  console.log(`Local places API + dist on http://localhost:${PORT}`);
  console.log(`  ${places.length} production place records`);
  console.log(
    photoFiles.length
      ? `  /api/places/photo -> ${photoFiles.length} stand-in image(s) from ${PHOTO_BYTES}`
      : '  /api/places/photo -> 1x1 placeholder (set PHOTO_BYTES to a directory of images)',
  );
});
