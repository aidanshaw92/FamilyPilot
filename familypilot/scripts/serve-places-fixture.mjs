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
 * It serves the exported web bundle too, on the same origin as the API. That is not a convenience:
 * `places-api-client.ts` and `place-photo-url.ts` resolve their base URL from
 * `EXPO_PUBLIC_PLACES_API_URL` and fall back to `window.location.origin`, and an earlier version of
 * this fixture ran the API on a second port and relied on that variable being inlined into the
 * bundle by `expo export`. It was not: the built bundle contained no trace of the URL, the client
 * fell back to its own origin, got a 404 from the static server, and `fallbackSearch` quietly served
 * the two demo venues from `server/places/lib/fallback.js` instead. The run still printed a venue
 * name and still said "0/3 layers are showing a decoded photograph", which is exactly the kind of
 * half-working green that hides a problem. Serving both from one origin is also how production
 * actually works, so there is nothing left to inline and nothing left to get wrong.
 *
 * Usage: node scripts/serve-places-fixture.mjs [port] [distDir]
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

/**
 * The same distance estimator the deployed journey endpoint falls back to when Google is disabled.
 * Reused rather than reimplemented so a day planned against this fixture is timed by the arithmetic
 * production uses, and so nothing here needs a Distance Matrix call (each one bills per element).
 */
const { estimateDriveMinutes } = createRequire(import.meta.url)(
  '../../server/context/lib/geo-utils.js',
);

const PORT = Number(process.argv[2] || 4173);
const DIST = resolve(process.argv[3] || join(process.cwd(), 'dist'));

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

/**
 * Which set of venues the search payload carries.
 *
 *  - `sparse` (default): the fifteen uniform, unreviewed, flat-colour-photo venues. This is the locked
 *    composition the Home verifiers measure, and one honest robustness state (nothing reviewed, so no
 *    Family Fit number anywhere).
 *  - `realistic` (FIXTURE_SCENARIO=realistic): the same fifteen ids and coordinates, but carrying the
 *    spread of data a live city actually returns -- reviewed venues with confirmed facts and photographs,
 *    partial facts, a reviewed negative, a missing photograph, an unreviewed one and an over-long name --
 *    so the screens can be judged, and regression-tested, in the states a parent really meets.
 *
 * Both are synthetic and zero-spend: no Google, Overpass or paid provider is ever contacted.
 */
const SCENARIO = process.env.FIXTURE_SCENARIO === 'realistic' ? 'realistic' : 'sparse';

const FULL_FACILITIES = { toilets: 'yes', babyChanging: 'yes', parking: 'yes', freeParking: 'yes' };

function scenarioMetadata(id, over = {}) {
  return {
    familypilotPlaceId: id,
    enrichmentStatus: 'enriched',
    bestAges: '1 to 8',
    minRecommendedAge: 1,
    maxRecommendedAge: 8,
    terrain: 'flat',
    facilities: ['toilets', 'baby_changing', 'parking', 'cafe', 'playground', 'pushchair_friendly'],
    familyFacilities: FULL_FACILITIES,
    pushchairSuitability: 'good',
    parkingInfo: 'Free on-site car park, busiest before 11am at weekends.',
    visitDurationMinutes: 120,
    environment: 'mixed',
    energyLevel: 'moderate',
    estimatedSpend: '£8 to £15 for a family of four',
    goodToKnow: ['Buggies can go everywhere on the main loop'],
    provenance: {},
    lastChecked: '2026-09-28',
    checkedBy: 'fixture',
    updatedAt: '2026-09-28',
    ...over,
  };
}

/** What each of the fifteen venues stands for in the realistic scenario. */
const REALISTIC_PLAN = [
  { kind: 'full' }, // 0  complete data and photographs
  { kind: 'full' }, // 1
  { kind: 'full' }, // 2
  { kind: 'full' }, // 3
  { kind: 'partial' }, // 4  some confirmed facts, the rest unknown
  { kind: 'noPhoto' }, // 5  useful data, no photograph (category placeholder)
  { kind: 'sparse' }, // 6  nothing reviewed: "Not yet reviewed", no number
  { kind: 'long' }, // 7  an over-long name and fact
  { kind: 'caution' }, // 8  a reviewed negative that counts against the match
  { kind: 'partial' }, // 9
  { kind: 'full' }, // 10
  { kind: 'sparse' }, // 11
  { kind: 'full' }, // 12
  { kind: 'noPhoto' }, // 13
  { kind: 'full' }, // 14
];

/** A long, real two-part photographer's name: the credit must wrap whole at the narrowest thumbnail. */
const LONG_CREDIT = 'Christopher Montgomery';
const LONG_NAME = 'The Royal Borough Of Something Extremely Long Memorial Gardens And Family Activity Centre';

function realisticPlace(place, index) {
  const { kind } = REALISTIC_PLAN[index];
  const id = place.familypilotId;
  const out = { ...place };
  if (kind === 'sparse') return out; // provider_only, no metadata: the honest unreviewed state
  out.enrichmentStatus = 'enriched';
  if (kind === 'partial') {
    out.familyMetadata = scenarioMetadata(id, {
      familyFacilities: { toilets: 'yes', babyChanging: 'unknown', parking: 'unknown' },
      pushchairSuitability: undefined,
      parkingInfo: undefined,
      goodToKnow: [],
      facilities: ['toilets'],
    });
  } else if (kind === 'caution') {
    out.familyMetadata = scenarioMetadata(id, {
      familyFacilities: { toilets: 'yes', babyChanging: 'no', parking: 'yes' },
      pushchairSuitability: 'difficult',
      terrain: 'hilly',
      goodToKnow: ['Steep paths; a carrier suits small children better than a pushchair'],
    });
  } else if (kind === 'long') {
    out.name = LONG_NAME;
    out.photos = out.photos.map((u) => u.replace(/credit=[^&]*/, `credit=${encodeURIComponent(LONG_CREDIT)}`));
    out.familyMetadata = scenarioMetadata(id, {
      goodToKnow: [
        'Baby changing is in the east wing, a ten minute walk from the main entrance along the canal path, and the cafe closes an hour before the gardens do',
      ],
    });
  } else {
    out.familyMetadata = scenarioMetadata(id);
  }
  if (kind === 'noPhoto' || kind === 'partial') out.photos = kind === 'noPhoto' ? [] : out.photos;
  return out;
}

const BASE_PLACES = NAMES.map((_, index) => fixturePlace(index));
const PLACES = SCENARIO === 'realistic' ? BASE_PLACES.map(realisticPlace) : BASE_PLACES;

/**
 * Venues that exist only on the detail endpoint, for the cases the uniform fifteen cannot show.
 *
 * Deliberately NOT added to the search payload. Home's visual regression measures the deck against a
 * locked Figma frame, so changing what Explore and Home return would make a design check fail for a
 * reason that has nothing to do with the design. These are reached by opening their URL directly,
 * which is exactly how the audit drives them.
 *
 * The important one is `edge-rich`. Every base venue returns `metadata: null`, so until now no
 * browser check had ever rendered a venue whose facts are CONFIRMED -- only the unknown path. A
 * screen that says "not confirmed" correctly and then mangles a known fact would have passed
 * everything.
 */
const EDGE_METADATA = {
  'fp-google-FIXTUREedgeRich': {
    familypilotPlaceId: 'fp-google-FIXTUREedgeRich',
    enrichmentStatus: 'enriched',
    bestAges: '2 to 10',
    minRecommendedAge: 2,
    maxRecommendedAge: 10,
    terrain: 'flat',
    facilities: ['toilets', 'baby_changing', 'parking', 'cafe', 'playground', 'pushchair_friendly'],
    familyFacilities: { toilets: 'yes', babyChanging: 'yes', parking: 'yes', freeParking: 'yes' },
    pushchairSuitability: 'good',
    parkingInfo: 'Free on-site car park, about 120 spaces, busiest before 11am at weekends.',
    visitDurationMinutes: 150,
    environment: 'mixed',
    energyLevel: 'moderate',
    estimatedSpend: '£12 to £20 for a family of four',
    goodToKnow: ['Buggies can go everywhere on the main loop', 'The cafe has highchairs'],
    familyNotes: 'A synthetic venue whose family facts are all confirmed, so the known path renders.',
    provenance: {},
    lastChecked: '2026-09-28',
    checkedBy: 'fixture',
    updatedAt: '2026-09-28',
  },
  'fp-google-FIXTUREedgeLongName': {
    familypilotPlaceId: 'fp-google-FIXTUREedgeLongName',
    enrichmentStatus: 'enriched',
    familyFacilities: { toilets: 'yes', babyChanging: 'no', parking: 'unknown' },
    pushchairSuitability: 'difficult',
    provenance: {},
    updatedAt: '2026-09-28',
  },
};

function edgePlace(id, over) {
  const base = fixturePlace(0);
  return {
    ...base,
    familypilotId: id,
    externalId: `google:${id.slice('fp-google-'.length)}`,
    name: 'Edge Case Venue',
    category: 'park',
    latitude: 51.52,
    longitude: -0.12,
    address: 'Edge Row, London',
    description: 'A synthetic venue that exists only to exercise one rendering edge.',
    enrichmentStatus: 'enriched',
    ...over,
  };
}

/**
 * Hours wide enough that a day fits whatever time the audit runs at.
 *
 * The base fixture opens 09:00-17:00, which made the journey's happy path pass in the morning and
 * fail in the afternoon: a check whose result depends on the wall clock tells you nothing. The
 * venue that shuts early is a separate venue below, so that case is covered on purpose.
 */
const WIDE_HOURS = {
  weekdayText: ['Monday to Sunday: 08:00 to 20:00'],
  source: 'fixture',
  periods: Array.from({ length: 7 }, (_, day) => ({
    open: { day, hour: 8, minute: 0 },
    close: { day, hour: 20, minute: 0 },
  })),
  timeZone: 'Europe/London',
};

const EDGE_PLACES = [
  // Confirmed facts throughout: the path no browser check had ever rendered.
  edgePlace('fp-google-FIXTUREedgeRich', { name: 'Confirmed Facts Gardens', openingHours: WIDE_HOURS }),
  // Shuts at 09:30, so no visit of any useful length fits. The sequencer should say exactly that
  // rather than returning a generic "no day fits".
  edgePlace('fp-google-FIXTUREedgeClosesEarly', {
    name: 'Closes Early Hall',
    openingHours: {
      weekdayText: ['Monday to Sunday: 09:00 to 09:30'],
      source: 'fixture',
      periods: Array.from({ length: 7 }, (_, day) => ({
        open: { day, hour: 9, minute: 0 },
        close: { day, hour: 9, minute: 30 },
      })),
      timeZone: 'Europe/London',
    },
  }),
  // A name far longer than any header was designed for.
  edgePlace('fp-google-FIXTUREedgeLongName', {
    name: 'The Royal Borough Of Something Extremely Long Memorial Gardens And Family Activity Centre',
    openingHours: WIDE_HOURS,
  }),
  // No photograph at all: the category gradient has to carry the hero.
  edgePlace('fp-google-FIXTUREedgeNoPhoto', { name: 'No Photograph Park', photos: [], openingHours: WIDE_HOURS }),
  // An OpenStreetMap-sourced venue. ODbL requires crediting its contributors wherever its data is
  // shown, and three such venues are served to parents in production today, so the audit renders one.
  edgePlace('fp-osm-FIXTUREedgeOsm', {
    name: 'Open Data Common',
    provider: 'osm',
    externalId: 'osm:FIXTUREedgeOsm',
    photos: [],
    openingHours: WIDE_HOURS,
  }),
  /**
   * No coordinates at all.
   *
   * The nearby-food lookup is disabled without them, and react-query reports a disabled query as
   * pending-and-idle. A plan route that waited on `isPending` would therefore never generate for this
   * venue. That hang is what this venue exists to catch.
   */
  edgePlace('fp-google-FIXTUREedgeNoCoords', {
    name: 'No Coordinates Park',
    latitude: undefined,
    longitude: undefined,
    openingHours: WIDE_HOURS,
  }),
  // Hours with no structured periods: nobody can say whether it is open on a given date.
  edgePlace('fp-google-FIXTUREedgeNoHours', {
    name: 'Unknown Hours Museum',
    category: 'museum',
    openingHours: { weekdayText: [], source: 'fixture', periods: [], timeZone: 'Europe/London' },
  }),
];

const EDGE_BY_ID = new Map(EDGE_PLACES.map((place) => [place.familypilotId, place]));

/**
 * Which nearby-food state a request returns, keyed on the venue that asked.
 *
 * Keyed on placeId, NOT on coordinates: every `edgePlace` sits at the same 51.52,-0.12, so a
 * coordinate discriminator put every venue in the same branch. The client already sends placeId, and
 * it is the only thing that distinguishes one edge venue from another.
 */
function FOOD_SCENARIO_FOR(placeId) {
  if (placeId === 'fp-google-FIXTUREedgeLongName') return 'outage';
  if (placeId === 'fp-google-FIXTUREedgeNoPhoto') return 'empty';
  return 'candidates';
}

/**
 * Three candidates covering what the section has to render honestly: one walkable with hours and
 * child-relevant tags, one walkable with NOTHING mapped beyond its name, and one too far to walk so
 * only a drive is offered. None carries a rating or a photograph, because OpenStreetMap has neither.
 */
function FOOD_CANDIDATES(lat, lng) {
  return [
    {
      familypilotId: 'fp-osm-node-9001',
      externalId: 'osm:node/9001',
      provider: 'osm',
      name: 'The Mapped Kitchen',
      category: 'restaurant',
      latitude: lat + 0.0022,
      longitude: lng,
      distanceKm: 0.24,
      cuisine: 'italian',
      openingHours: 'Mo-Su 11:00-22:00',
      address: '4 Fixture Lane',
      website: null,
      phone: null,
      tagged: { highchair: true, changingTable: true },
      travel: [
        { mode: 'walk', durationMinutes: 6, source: 'estimated-distance', confidence: 'low' },
        { mode: 'drive', durationMinutes: 2, source: 'estimated-distance', confidence: 'medium' },
      ],
    },
    {
      familypilotId: 'fp-osm-node-9002',
      externalId: 'osm:node/9002',
      provider: 'osm',
      name: 'Unlisted Cafe',
      category: 'cafe',
      latitude: lat + 0.0035,
      longitude: lng,
      distanceKm: 0.39,
      cuisine: null,
      openingHours: null,
      address: null,
      website: null,
      phone: null,
      tagged: {},
      travel: [
        { mode: 'walk', durationMinutes: 9, source: 'estimated-distance', confidence: 'low' },
        { mode: 'drive', durationMinutes: 2, source: 'estimated-distance', confidence: 'medium' },
      ],
    },
    {
      familypilotId: 'fp-osm-way-9003',
      externalId: 'osm:way/9003',
      provider: 'osm',
      name: 'Far Side Grill',
      category: 'restaurant',
      latitude: lat + 0.019,
      longitude: lng,
      distanceKm: 2.1,
      cuisine: 'burger',
      openingHours: null,
      address: null,
      website: null,
      phone: null,
      tagged: { outdoorSeating: true },
      travel: [{ mode: 'drive', durationMinutes: 4, source: 'estimated-distance', confidence: 'medium' }],
    },
  ];
}

/**
 * Whether the search payload carries the OpenStreetMap venue as well as the ten Google ones.
 *
 * Off by default, because Home's composition is locked against the Figma frame and an eleventh deck
 * card would move it. On, the list surfaces have a genuinely mixed-provider result set, which is the
 * only way to prove in a browser that each holder is credited once and neither is credited for the
 * other's rows -- the defect being fixed was Home crediting Google for OpenStreetMap museums.
 */
/** Local photographs for the visual-review capture set (see .ui-cap/review-captures.mjs). */
const REVIEW_PHOTOS = process.env.FIXTURE_PHOTO_DIR
  ? readdirSync(process.env.FIXTURE_PHOTO_DIR)
      .filter((f) => /\.(jpe?g|png)$/i.test(f))
      .sort()
      .map((f) => join(process.env.FIXTURE_PHOTO_DIR, f))
  : [];

const SEARCH_PLACES =
  process.env.FIXTURE_SEARCH_INCLUDES_OSM === '1'
    ? [...PLACES, EDGE_BY_ID.get('fp-osm-FIXTUREedgeOsm')]
    : PLACES;


/**
 * A valid 800x600 PNG, built here rather than committed, so the repository carries no image binary
 * and `naturalWidth > 1` in `report-photo-evidence.mjs` still has a real decoded photograph to
 * measure. One flat colour; the assertions are about dimensions, not content.
 */
function buildPng(width, height, rgbOrFn) {
  const rgbAt = typeof rgbOrFn === 'function' ? rgbOrFn : () => rgbOrFn;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const pixel = rowStart + 1 + x * 3;
      const rgb = rgbAt(x, y);
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

/**
 * A landscape-like image generated from nothing -- sky, sun, two ranges of hills, a meadow and a few
 * trees -- so the realistic scenario has photographs with tone and edges to judge a composition by,
 * while the repository still carries no image binary and no licensed or reference photograph.
 */
function buildScenePng(width, height, { skyTop, skyBottom, hillFar, hillNear, ground, sun }) {
  const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  const horizon = height * 0.5;
  const trees = [0.18, 0.34, 0.62, 0.8].map((x, i) => ({ x: x * width, y: height * (0.62 + (i % 2) * 0.06), r: height * 0.07 }));
  const pixel = (x, y) => {
    const dx = x - width * 0.76;
    const dy = y - height * 0.2;
    // A soft glow, not a disc: a hard-edged circle reads as a UI shape when a card crops it.
    const glow = Math.max(0, 1 - Math.hypot(dx, dy) / (height * 0.16));
    for (const t of trees) {
      if ((x - t.x) ** 2 + (y - t.y) ** 2 < t.r ** 2) return mix(hillNear, [30, 70, 40], 0.5);
      if (Math.abs(x - t.x) < t.r * 0.12 && y > t.y && y < t.y + t.r * 1.5) return [84, 62, 44];
    }
    const far = horizon - 28 * Math.sin(x / width * 5.1 + 0.6) - 18;
    const near = horizon + 26 + 24 * Math.sin(x / width * 3.3 + 2.2);
    if (y > near) return mix(ground, hillNear, Math.min(1, (y - near) / (height - near)) * 0.4);
    if (y > horizon + 4) return hillNear;
    if (y > far) return hillFar;
    return mix(mix(skyTop, skyBottom, y / horizon), sun, glow * glow * 0.85);
  };
  return buildPng(width, height, pixel);
}

/** Three tones, so the three visible deck layers are distinguishable in a screenshot. */
const SPARSE_IMAGES = [
  buildPng(800, 600, [120, 144, 112]),
  buildPng(800, 800, [148, 126, 104]),
  buildPng(800, 591, [104, 118, 140]),
];
const SCENE_IMAGES = [
  buildScenePng(800, 600, { skyTop: [120, 170, 226], skyBottom: [220, 232, 240], hillFar: [128, 162, 120], hillNear: [88, 132, 80], ground: [110, 156, 84], sun: [255, 238, 170] }),
  buildScenePng(800, 800, { skyTop: [226, 176, 120], skyBottom: [250, 226, 190], hillFar: [150, 130, 118], hillNear: [112, 112, 90], ground: [140, 128, 92], sun: [255, 250, 230] }),
  buildScenePng(800, 591, { skyTop: [96, 140, 196], skyBottom: [190, 214, 232], hillFar: [96, 132, 150], hillNear: [60, 110, 120], ground: [80, 128, 130], sun: [250, 244, 214] }),
];
const IMAGES = SCENARIO === 'realistic' ? SCENE_IMAGES : SPARSE_IMAGES;

/**
 * SYNTHETIC FIXTURE PHOTOGRAPHY (test/demo only).
 *
 * `assets/images/fixtures/venues/<category>.jpg` (optionally `<category>-b.jpg`, `<category>-c.jpg`) are
 * photorealistic SYNTHETIC images made so the realistic scenario can be judged by eye. They are read here,
 * by this test server, and nowhere else: no app code imports them, nothing bundles them, and the production
 * photo pipeline (the proxy, the cache, provider provenance) never sees them. They are never a photograph
 * of any real venue; every one is recorded in that folder's manifest.json as synthetic. Where a category has
 * no file the flat-colour scene above is served, and a place with no photo at all keeps the category
 * fallback (the "no photo" state is deliberate).
 *
 * Only the realistic scenario uses them: the sparse scenario is the locked flat-colour composition the Home
 * geometry verifiers measure.
 */
const FIXTURE_VENUE_PHOTO_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'assets', 'images', 'fixtures', 'venues');
const FIXTURE_VENUE_PHOTOS = new Map();
if (SCENARIO === 'realistic' && existsSync(FIXTURE_VENUE_PHOTO_DIR)) {
  for (const file of readdirSync(FIXTURE_VENUE_PHOTO_DIR).sort()) {
    const match = /^([a-z_]+?)(?:-[b-z])?\.jpe?g$/.exec(file);
    if (!match) continue;
    const list = FIXTURE_VENUE_PHOTOS.get(match[1]) ?? [];
    list.push(readFileSync(join(FIXTURE_VENUE_PHOTO_DIR, file)));
    FIXTURE_VENUE_PHOTOS.set(match[1], list);
  }
}
const CATEGORY_BY_PHOTO_ID = new Map(PLACES.map((place) => [place.familypilotId.replace(/^fp-google-/, ''), place.category]));

/** The synthetic fixture photograph for a place's category, or null when none exists for it. */
function syntheticFixturePhoto(photoId, index) {
  const list = FIXTURE_VENUE_PHOTOS.get(CATEGORY_BY_PHOTO_ID.get(photoId));
  if (!list?.length) return null;
  const seed = [...photoId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return list[(seed + (Number.isInteger(index) ? index : 0)) % list.length];
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolves a request path inside the exported bundle: the file itself, then `<path>.html`, then
 * `<path>/index.html`, then `index.html` as the single-page fallback so client-side routes such as
 * `/venue/<id>` load. `normalize` plus the prefix check keeps a `..` out of the served tree.
 */
function resolveStaticFile(pathname) {
  const requested = normalize(join(DIST, decodeURIComponent(pathname)));
  if (!requested.startsWith(DIST)) return null;

  const candidates = [requested, `${requested}.html`, join(requested, 'index.html')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  const fallback = join(DIST, 'index.html');
  return existsSync(fallback) ? fallback : null;
}

function sendStatic(res, pathname) {
  const file = resolveStaticFile(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  return createReadStream(file).pipe(res);
}

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

  // Places to eat near an anchor. Synthetic, so the audit exercises the real UI states -- candidates,
  // nothing mapped, and a provider outage -- without a single Overpass request. The anchor decides
  // which state is returned, so one fixture covers all three.
  if (url.pathname === '/api/places/search' && url.searchParams.get('intent') === 'nearby-food') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return sendJson(res, 400, { error: 'Invalid anchor coordinates', code: 'INVALID_ANCHOR' });
    }
    // The long-name venue stands in for the outage case, and the no-photo venue for a neighbourhood
    // with nothing mapped, so the audit can reach every branch by navigating.
    const scenario = FOOD_SCENARIO_FOR(url.searchParams.get('placeId'));
    if (scenario === 'outage') {
      return sendJson(res, 503, {
        error: 'Restaurant lookup is unavailable just now',
        code: 'FOOD_PROVIDER_UNAVAILABLE',
        provider: 'osm',
        googleCalls: 0,
      });
    }
    return sendJson(res, 200, {
      anchor: { latitude: lat, longitude: lng, placeId: url.searchParams.get('placeId') },
      candidates: scenario === 'empty' ? [] : FOOD_CANDIDATES(lat, lng),
      totalFound: scenario === 'empty' ? 0 : FOOD_CANDIDATES(lat, lng).length,
      provider: 'osm',
      googleCalls: 0,
      overpassRequests: 0,
      cacheState: 'hit',
      radiusM: 1200,
      fetchedAt: new Date().toISOString(),
      attribution: 'osm',
    });
  }

  if (url.pathname === '/api/places/search') {
    return sendJson(res, 200, {
      places: SEARCH_PLACES,
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
    const place = EDGE_BY_ID.get(id) ?? PLACES.find((candidate) => candidate.familypilotId === id);
    if (!place) return sendJson(res, 404, { error: 'Place not found', code: 'NOT_FOUND' });
    return sendJson(res, 200, {
      place,
      metadata: EDGE_METADATA[id] ?? null,
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
    // Visual-review mode: FIXTURE_PHOTO_DIR names a local folder of photographs, served in place of
    // the flat fixture colours so a composition can be judged. Still no provider call is made; the
    // deterministic verifiers run without the variable and keep the flat colours.
    if (REVIEW_PHOTOS.length) {
      const seed = [...(url.searchParams.get('id') || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const file = REVIEW_PHOTOS[(seed + (Number.isInteger(index) ? index : 0)) % REVIEW_PHOTOS.length];
      const body = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': body.length,
      });
      return res.end(body);
    }
    const synthetic = syntheticFixturePhoto(url.searchParams.get('id') || '', index);
    if (synthetic) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        // Machine-readable: this is not a photograph of a real place.
        'X-FamilyPilot-Fixture': 'synthetic',
        'Content-Length': synthetic.length,
      });
      return res.end(synthetic);
    }
    const image = IMAGES[Number.isInteger(index) && index >= 0 && index < IMAGES.length ? index : 0];
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': image.length,
    });
    return res.end(image);
  }

  // The journey endpoint, estimated from distance. A plan needs travel times for every leg, and
  // without this the matrix reports every leg as unobtainable and no day can be built at all.
  if (url.pathname === '/api/context/journey') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
      return res.end();
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      const origin = body.origin ?? {};
      if (!Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)) {
        return sendJson(res, 400, { error: 'Invalid origin coordinates' });
      }
      const destinations = Array.isArray(body.destinations) ? body.destinations : [];
      return sendJson(res, 200, {
        journeys: destinations.map((destination) => ({
          placeId: destination.placeId,
          driveMinutes: estimateDriveMinutes(
            origin.latitude,
            origin.longitude,
            destination.latitude,
            destination.longitude,
          ),
          // Labelled for what it is. The Plan screen says "Estimated from distance" because of this.
          source: 'estimated',
        })),
        provider: 'fallback',
        source: 'estimated',
        fetchedAt: new Date().toISOString(),
      });
    });
    return undefined;
  }

  // Weather, so the console is not full of 404s that have nothing to do with what is being checked.
  // `fetchLiveWeatherSafe` already swallows a failure, which is exactly why the noise was misleading.
  if (url.pathname === '/api/context/weather') {
    return sendJson(res, 200, {
      condition: 'cloudy',
      temperature: 14,
      description: 'Synthetic fixture weather',
      source: 'estimated',
      provider: 'fixture',
      fetchedAt: new Date().toISOString(),
      coordinates: {
        latitude: Number(url.searchParams.get('lat')),
        longitude: Number(url.searchParams.get('lng')),
      },
    });
  }

  // The venue trust panel asks for visit feedback. Unserved, it logged a 404 that looked like a
  // defect in whatever screen was being checked; an empty answer is the truth for a synthetic venue.
  if (url.pathname === '/api/planning/feedback') {
    return sendJson(res, 200, { fields: [], questions: [] });
  }

  // Onboarding step 1 resolves the home town through this endpoint before it will advance, and the
  // real one asks postcodes.io (and, gated, Google Geocoding). A fixed answer keeps the onboarding
  // captures offline and deterministic; nothing about the input is looked up.
  if (url.pathname === '/api/planning/location') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    return sendJson(res, 200, { area: 'Bushey, Hertfordshire', latitude: 51.643, longitude: -0.36 });
  }

  if (url.pathname === '/api/places/status') {
    return sendJson(res, 200, { runtime: { configuredProvider: 'fixture' }, probe: null });
  }

  // Any other /api/ path is a route this fixture has not been taught. Answering it with the bundle's
  // index.html would hand the client HTML where it expected JSON and produce a confusing parse error,
  // so say so plainly instead.
  if (url.pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: `fixture has no route for ${url.pathname}` });
  }

  return sendStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`places fixture: ${PLACES.length} synthetic venues on http://localhost:${PORT}`);
  if (existsSync(join(DIST, 'index.html'))) {
    console.log(`serving the exported bundle from ${DIST} on the same origin`);
  } else {
    console.log(`WARNING: no index.html under ${DIST}; run \`npm run build:web\` first`);
  }
  console.log('No Google Places request is made by this server. Nothing here is Google content.');
});
