/**
 * Venues FamilyPilot can serve WITHOUT a Google copy: a venue's identity, and where it is, from sources that are not Google.
 *
 * WHY THIS EXISTS. The stored catalogue (`catalogue.js`) serves a venue only while its Google row is under 30 days old. That gate treats
 * four different things as one:
 *
 *   - that a venue EXISTS (a fact about the world, and ours: the canonical venue, its id, its place-ID link),
 *   - the provider's copy of its CONTENT (name, address, hours, photos, summary, position as Google returned them: 30 days),
 *   - our own EVIDENCE about it (facts read from the venue's own pages, each with its own expiry), and
 *   - whether it has CLOSED (an event, not a clock).
 *
 * When the Google copy ages out, the venue vanishes from Explore and Meet halfway even where we hold an independently sourced name and
 * position. This module is the second route in: a short, reviewed, provenance-carrying list whose entries are served when no fresh
 * Google row covers the same id. It never carries, and cannot be made to carry, anything Google returned.
 *
 * WHAT AN ENTRY IS. A name and a category (ours), where the venue is (OpenStreetMap only, for now, because that is the one independent
 * position source the app can credit), and its website, each with a source, a licence and a reviewer. The shape is closed: an unknown key,
 * a Google-hosted URL, a licence the source cannot carry, or an unreviewed entry is dropped, never served.
 *
 * WHAT THIS DOES NOT DO. It does not fetch anything, does not call Google, and does not write to a database. The data file ships empty:
 * adding an entry is a reviewed change to `data/independent-identities.json`, so every serving decision shows in a diff.
 */

/**
 * One file per licence family, so what must be offered under the ODbL is a file, not a filter: `osm.json` holds every entry whose name or
 * position came from OpenStreetMap, and nothing else may hold one. Separate files are a technical measure that makes the licence easy to
 * honour; they do not by themselves decide whether the combined served data is a Derivative or a Collective Database
 * (docs/OSM_LICENCE_REVIEW.md, open questions).
 */
const CUTOVER = require('../data/identities/cutover.json');
const FILES = {
  osm: require('../data/identities/osm.json'),
  'official-site': require('../data/identities/official-site.json'),
  wikidata: require('../data/identities/wikidata.json'),
  'os-greenspace': require('../data/identities/os-greenspace.json'),
};

/** Identity sources, and the licence each can carry. `venue-website` is the venue's own page, read for the facts on it. */
const IDENTITY_SOURCES = {
  osm: ['ODbL-1.0'],
  'official-site': ['venue-website'],
  wikidata: ['CC0-1.0'],
  // OS Open Greenspace: the Ordnance Survey's park, garden and play-space polygons, published under the Open Government Licence v3.0.
  'os-greenspace': ['OGL-3.0'],
};

/**
 * Position sources. A position is drawn on the app's own map, so its source must be one the app can credit where the licence asks for a credit:
 * OpenStreetMap (ODbL: "© OpenStreetMap contributors"), OS Open Greenspace (OGL: the Ordnance Survey statement) and Wikidata (CC0: none owed).
 * A source joins this list in the same change that adds its credit (see `utils/map-compliance.ts` and `services/places/attribution.ts`).
 */
const LOCATION_SOURCES = { osm: ['ODbL-1.0'], wikidata: ['CC0-1.0'], 'os-greenspace': ['OGL-3.0'] };

const ENTRY_KEYS = ['familypilotId', 'name', 'category', 'identity', 'location', 'website', 'reviewedBy', 'reviewedAt'];
const IDENTITY_KEYS = ['source', 'url', 'retrievedAt', 'licence', 'externalId'];
const LOCATION_KEYS = ['latitude', 'longitude', 'source', 'licence'];

/** Greater London and a margin: a position outside it is a typo or a different venue. */
const BOUNDS = { minLat: 51.1, maxLat: 51.9, minLng: -0.9, maxLng: 0.6 };

/** The reviewer marker of a rehearsal entry. It is not a person; `apply-review --preview-only` writes it and production never serves it. */
const PREVIEW_ONLY = /^preview only/i;
/** Production is a Vercel production deployment, or any Node process told it is production when it is not on Vercel at all. */
const isProduction = () => process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');

const GOOGLE_HOST = /(^|\.)(google|googleapis|googleusercontent|gstatic|ggpht|goo\.gl|g\.page|maps\.app\.goo\.gl)(\.|$)/i;

function onlyKeys(object, allowed) {
  return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every((key) => allowed.includes(key));
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || GOOGLE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}


/**
 * Every entry must be traceable to one record in the source it names, so a person (or a licence holder) can check it: the external id has the source's
 * own shape, and the address is the source's own address for that record. OS Open Greenspace has no page per feature, so its address is the product page
 * and the id is the feature's identifier in the dataset (a release is recorded in the provenance manifest, `PROVENANCE.json`).
 */
const OS_PRODUCT_URL = 'https://www.ordnancesurvey.co.uk/products/os-open-greenspace';
function provenanceProblem(identity) {
  const id = identity.externalId;
  switch (identity.source) {
    case 'osm':
      if (typeof id !== 'string' || !/^(node|way|relation)\/\d+$/.test(id)) return 'identity.externalId must be an OpenStreetMap element such as way/123';
      if (identity.url !== `https://www.openstreetmap.org/${id}`) return 'identity.url must be the OpenStreetMap page of identity.externalId';
      return null;
    case 'wikidata':
      if (typeof id !== 'string' || !/^Q\d+$/.test(id)) return 'identity.externalId must be a Wikidata item such as Q42';
      if (identity.url !== `https://www.wikidata.org/wiki/${id}`) return 'identity.url must be the Wikidata page of identity.externalId';
      return null;
    case 'os-greenspace':
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return 'identity.externalId must be the OS Open Greenspace feature identifier';
      if (identity.url !== OS_PRODUCT_URL) return 'identity.url must be the OS Open Greenspace product page';
      return null;
    default:
      return null; // official-site: the venue's own page is the record
  }
}

const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(value) && Number.isFinite(Date.parse(value));

/**
 * Why an entry would not be served, or null when it is valid. Returned as text so a test (and a person reading a failed build) can
 * see which rule an entry broke.
 */
function problemWith(entry, options = {}) {
  if (!onlyKeys(entry, ENTRY_KEYS)) return 'unknown key: only a name, category, identity, location, website and review are allowed';
  if (typeof entry.familypilotId !== 'string' || !/^fp-[a-z0-9_-]+$/i.test(entry.familypilotId)) return 'familypilotId must be an fp- id';
  if (typeof entry.name !== 'string' || entry.name.trim().length < 2 || entry.name.length > 120) return 'name is missing or too long';
  // Required here, not at the top: catalogue.js requires this module, and the categories are the ones it serves.
  const { EXPLORE_CATEGORIES } = require('./catalogue');
  if (!EXPLORE_CATEGORIES.includes(entry.category)) return `category must be one of ${EXPLORE_CATEGORIES.join(', ')}`;
  if (typeof entry.reviewedBy !== 'string' || !entry.reviewedBy.trim() || !isoDate(entry.reviewedAt)) return 'an entry needs a reviewer and the date they reviewed it';
  // Output generated for a simulation says so, and can never be served.
  if (/^unreviewed/i.test(entry.reviewedBy.trim())) return 'reviewedBy says the entry is unreviewed';
  // An entry that rehearses a release on a Preview carries this marker instead of a person's name. It is not a review, and production refuses it, so
  // a rehearsal branch that is merged by mistake cannot put unreviewed venues in front of parents.
  if (PREVIEW_ONLY.test(entry.reviewedBy.trim()) && (options.production ?? isProduction())) return 'a preview-only entry is not served in production';

  const identity = entry.identity;
  if (!onlyKeys(identity, IDENTITY_KEYS)) return 'identity has an unknown key';
  if (!Object.prototype.hasOwnProperty.call(IDENTITY_SOURCES, identity.source)) return `identity.source must be one of ${Object.keys(IDENTITY_SOURCES).join(', ')}`;
  if (!IDENTITY_SOURCES[identity.source].includes(identity.licence)) return `identity.licence ${identity.licence} is not one ${identity.source} can carry`;
  if (!httpsUrl(identity.url)) return 'identity.url must be an https address that is not Google’s';
  const provenance = provenanceProblem(identity);
  if (provenance) return provenance;
  if (!isoDate(identity.retrievedAt)) return 'identity.retrievedAt must be a date';

  if (entry.website != null && !httpsUrl(entry.website)) return 'website must be an https address that is not Google’s';

  if (entry.location != null) {
    const location = entry.location;
    if (!onlyKeys(location, LOCATION_KEYS)) return 'location has an unknown key';
    if (!Object.prototype.hasOwnProperty.call(LOCATION_SOURCES, location.source)) return `location.source must be one of ${Object.keys(LOCATION_SOURCES).join(', ')}`;
    if (!LOCATION_SOURCES[location.source].includes(location.licence)) return `location.licence ${location.licence} is not one ${location.source} can carry`;
    const { latitude, longitude } = location;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'location needs a latitude and longitude';
    if (latitude < BOUNDS.minLat || latitude > BOUNDS.maxLat || longitude < BOUNDS.minLng || longitude > BOUNDS.maxLng) return 'location is outside Greater London';
  }
  return null;
}

/**
 * The categories served from the independent files INSTEAD of Google. Every other category is served as before (fresh Google rows, plus
 * independent entries for venues no fresh Google row covers). A category is switched over when its independent coverage is at least what
 * Google's was, so a list is not a blend of the two sources within one data type.
 *
 * @param {{ cutover?: string[] }} [options] `cutover` is injectable for tests.
 */
function cutoverCategories(options = {}) {
  const { EXPLORE_CATEGORIES } = require('./catalogue');
  const list = options.cutover ?? (Array.isArray(CUTOVER.categories) ? CUTOVER.categories : []);
  return new Set(list.filter((category) => EXPLORE_CATEGORIES.includes(category)));
}

/** Why an entry may not live in this file, or null. OpenStreetMap content is in `osm.json` and only there. */
function fileProblem(file, entry) {
  const fromOsm = entry?.identity?.source === 'osm' || entry?.location?.source === 'osm';
  if (file === 'osm') return fromOsm ? null : 'osm.json holds only entries whose identity or position is from OpenStreetMap';
  if (fromOsm) return `OpenStreetMap content belongs in osm.json, not ${file}.json`;
  if (entry?.identity?.source !== file) return `${file}.json holds only identity.source ${file}`;
  // One licence family per file: a position from another source would put that source's content in this file.
  if (entry.location != null && entry.location.source !== file) return `${file}.json holds only positions whose source is ${file}`;
  return null;
}

/** Every entry in the shipped files, each checked for the file it is in. `onProblem` reports the ones that may not be there. */
function shippedEntries(onProblem) {
  const entries = [];
  for (const [file, content] of Object.entries(FILES)) {
    for (const entry of Array.isArray(content.entries) ? content.entries : []) {
      const problem = fileProblem(file, entry);
      if (problem) {
        if (onProblem) onProblem(entry && entry.familypilotId ? entry.familypilotId : '(no id)', problem);
        continue;
      }
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * The entries that may be served, in file order. Duplicate ids keep the first. Invalid entries are dropped and reported through
 * `onProblem`, because a bad entry must never take the catalogue down or be served half-checked.
 *
 * @param {{ entries?: any[], production?: boolean, onProblem?: (id: string, problem: string) => void }} [options] `entries` and `production` are injectable for tests.
 */
function loadIdentities(options = {}) {
  const entries = options.entries ?? shippedEntries(options.onProblem);
  const seen = new Set();
  const valid = [];
  for (const entry of entries) {
    const problem = problemWith(entry, options);
    const id = entry && typeof entry.familypilotId === 'string' ? entry.familypilotId : '(no id)';
    if (problem) {
      if (options.onProblem) options.onProblem(id, problem);
      continue;
    }
    if (seen.has(id)) {
      if (options.onProblem) options.onProblem(id, 'duplicate id');
      continue;
    }
    seen.add(id);
    valid.push(entry);
  }
  return valid;
}

/**
 * An entry in the shape the search endpoint returns for a place.
 *
 * Only what the entry holds. There is no description, no photograph, no opening hours, no phone, no rating and no address, because none
 * of those is in an entry: the screen shows them as not checked, from our own evidence layer where we hold some. `provider` is `osm` only
 * when the POSITION is OpenStreetMap's (that is what the credit and the map rule act on); otherwise it is our own row, which owes nobody
 * a credit and is never drawn on a map because it has no position of its own.
 */
function identityToPlace(entry) {
  const located = entry.location != null;
  return {
    familypilotId: entry.familypilotId,
    externalId: `${entry.identity.source}:${entry.identity.externalId ?? entry.familypilotId}`,
    provider: located ? entry.location.source : 'familypilot',
    name: entry.name,
    latitude: located ? entry.location.latitude : undefined,
    longitude: located ? entry.location.longitude : undefined,
    category: entry.category,
    website: entry.website ?? undefined,
    photos: [],
    fetchedAt: new Date(entry.identity.retrievedAt).toISOString(),
    enrichmentStatus: 'provider_only',
    googleTypes: [],
    independentSource: entry.identity.source,
  };
}

/** The places an independent entry adds to a stored list: every valid entry whose id no Google row already covers. */
function independentPlaces(coveredIds, options = {}) {
  const covered = coveredIds instanceof Set ? coveredIds : new Set(coveredIds);
  return loadIdentities(options)
    .filter((entry) => !covered.has(entry.familypilotId))
    .map(identityToPlace);
}

/** One entry's place, or null: used by the detail endpoint when a Google copy has aged out. */
function independentPlaceFor(id, options = {}) {
  const entry = loadIdentities(options).find((candidate) => candidate.familypilotId === id);
  return entry ? identityToPlace(entry) : null;
}

module.exports = {
  loadIdentities,
  cutoverCategories,
  shippedEntries,
  fileProblem,
  identityToPlace,
  independentPlaces,
  independentPlaceFor,
  problemWith,
  IDENTITY_SOURCES,
  LOCATION_SOURCES,
};
