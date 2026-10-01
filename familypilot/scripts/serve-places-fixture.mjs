#!/usr/bin/env node
/**
 * A stand-in for the deployed `/api/places` API, for the visual-regression job.
 *
 * Why this exists: the Home visual-regression workflow pointed the build it was testing at
 * PRODUCTION (`https://family-pilot-seven.vercel.app/api/places`) and ran on every pull request
 * touching `familypilot/**`. It ran 49 times in September 2026. Each run loaded Home in eight fresh
 * browser contexts, and each of those cost nine billable Nearby Search requests (the nine-point
 * London grid) plus a Place Details and a Place Photos call per photograph, through a proxy that set
 * `Cache-Control: no-store`. A design check was the single largest Google Places cost centre in the
 * project.
 *
 * The 88 assertions in those scripts measure GEOMETRY against a locked Figma frame -- positions,
 * widths, type sizes, gesture behaviour. None of them needs a real venue, which is why serving
 * synthetic data loses nothing and removes the whole bill.
 *
 * The venues below are invented. That is deliberate and not merely convenient: Google's Maps
 * Platform terms permit a place ID to be stored indefinitely but other Places content only to be
 * cached temporarily, so committing real venue names, addresses and photographs as a test fixture
 * would be a retention problem as well as a cost one. Nothing here came from Google.
 *
 * Usage: node scripts/serve-places-fixture.mjs [port]
 */
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';

const PORT = Number(process.argv[2] || 4174);

/**
 * Fifteen venues, because that is the deck length the gesture harness walks end to end. Coordinates
 * are spread across Greater London so distance-based ranking and the "travel from home" labels have
 * something to differentiate, and categories cover the rail Home renders.
 */
const CATEGORIES = [
  'park', 'museum', 'soft_play', 'farm', 'activity',
  'zoo', 'attraction', 'park', 'museum', 'activity',
  'soft_play', 'park', 'farm', 'attraction', 'museum',
];

const NAMES = [
  'Alderbrook Meadows', 'Brambleside Commons', 'Cedarmill Play Barn', 'Dovecote Farm Park',
  'Eastgate Adventure Yard', 'Fernhollow Wildlife Park', 'Granary Wharf Lookout',
  'Hollybank Gardens', 'Ironbridge Story Rooms', 'Juniper Climb Centre',
  'Kettleford Play House', 'Larchmere Water Gardens', 'Marlow End Farm',
  'Nettlefold Tower', 'Oakhaven Collection',
];

/** A deterministic spread over Greater London. No real venue sits at any of these points. */
function fixtureCoordinate(index) {
  const ring = Math.floor(index / 5);
  const step = index % 5;
  return {
    latitude: Number((51.42 + ring * 0.07 + step * 0.012).toFixed(6)),
    longitude: Number((-0.33 + step * 0.11 + ring * 0.02).toFixed(6)),
  };
}

/**
 * Shaped like a Google place id so that every `startsWith('fp-google-')` branch in the app and the
 * API client is exercised, without being one. The prefix makes that explicit to anyone reading a log.
 */
function fixturePlaceId(index) {
  return `fp-google-FIXTUREnotArealPlaceId${String(index).padStart(4, '0')}`;
}

const CREDITS = ['A. Fixture', 'B. Sample', 'C. Placeholder'];

function fixturePlace(index) {
  const { latitude, longitude } = fixtureCoordinate(index);
  const id = fixturePlaceId(index);
  const photos = [0, 1, 2].map((photoIndex) => {
    const params = new URLSearchParams({
      id: id.slice('fp-google-'.length),
      index: String(photoIndex),
      credit: CREDITS[photoIndex],
      authorUri: 'https://example.invalid/contributor',
      photoUri: 'https://example.invalid/photo',
    });
    return `/api/places/photo?${params.toString()}`;
  });

  return {
    familypilotId: id,
    externalId: `google:${id.slice('fp-google-'.length)}`,
    provider: 'google',
    name: NAMES[index],
    latitude,
    longitude,
    category: CATEGORIES[index],
    address: `${index + 1} Fixture Row, London`,
    description: `${NAMES[index]} is a synthetic venue used by the visual-regression fixture.`,
    website: `https://example.invalid/${index}`,
    phone: null,
    openingHours: {
      weekdayText: ['Monday to Sunday: 09:00 to 17:00'],
      source: 'fixture',
      periods: Array.from({ length: 7 }, (_, day) => ({
        open: { day, hour: 9, minute: 0 },
        close: { day, hour: 17, minute: 0 },
      })),
      timeZone: 'Europe/London',
    },
    photos,
    isOpen: true,
    fetchedAt: new Date().toISOString(),
    enrichmentStatus: 'provider_only',
    googlePrimaryType: CATEGORIES[index],
    googleTypes: [CATEGORIES[index]],
  };
}

const PLACES = NAMES.map((_, index) => fixturePlace(index));

/**
 * A valid 800x600 PNG, built here rather than committed, so the repository carries no image binary
 * and `naturalWidth > 1` in `report-photo-evidence.mjs` still has a real decoded photograph to
 * measure. One flat colour; the assertions are about dimensions, not content.
 */
function buildPng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const pixel = rowStart + 1 + x * 3;
      raw[pixel] = rgb[0];
      raw[pixel + 1] = rgb[1];
      raw[pixel + 2] = rgb[2];
    }
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return crc ^ -1;
}

/** Three tones, so the three visible deck layers are distinguishable in a screenshot. */
const IMAGES = [
  buildPng(800, 600, [120, 144, 112]),
  buildPng(800, 800, [148, 126, 104]),
  buildPng(800, 591, [104, 118, 140]),
];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/places/search') {
    return sendJson(res, 200, {
      places: PLACES,
      provider: 'google',
      configuredProvider: 'google',
      intent: url.searchParams.get('intent') || 'explore',
      cached: true,
      cacheState: 'fixture',
      fetchedAt: new Date().toISOString(),
      fallbackUsed: false,
    });
  }

  if (url.pathname === '/api/places/detail') {
    const id = url.searchParams.get('id');
    const place = PLACES.find((candidate) => candidate.familypilotId === id);
    if (!place) return sendJson(res, 404, { error: 'Place not found', code: 'NOT_FOUND' });
    return sendJson(res, 200, {
      place,
      metadata: null,
      requestedPlaceId: id,
      canonicalIdentity: null,
      provider: 'google',
      configuredProvider: 'google',
      cached: true,
      fetchedAt: new Date().toISOString(),
      fallbackUsed: false,
    });
  }

  if (url.pathname === '/api/places/photo') {
    const index = Number(url.searchParams.get('index') || 0);
    const image = IMAGES[Number.isInteger(index) && index >= 0 && index < IMAGES.length ? index : 0];
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': image.length,
    });
    return res.end(image);
  }

  if (url.pathname === '/api/places/status') {
    return sendJson(res, 200, { runtime: { configuredProvider: 'fixture' }, probe: null });
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`places fixture serving ${PLACES.length} synthetic venues on http://localhost:${PORT}`);
  console.log('No Google Places request is made by this server. Nothing here is Google content.');
});
