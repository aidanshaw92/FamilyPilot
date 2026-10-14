/**
 * Turns the tags of one OpenStreetMap feature into a decision: is it a candidate for Explore, which group, which subtype, which facts
 * does the source itself state, and what is its operating status.
 *
 * THE RULES, in the order they apply:
 *   1. A feature mapped as no longer there (disused:, abandoned:, was:, demolished:) or not open to the public is rejected, with the tag.
 *   2. A feature with no name is rejected. (An unnamed playground can still add evidence to a named park; see `dry-run.mjs`.)
 *   3. The GROUP comes only from a classifying tag. `attraction=animal` is NOT one: it marks a single enclosure inside a zoo or farm ("Coatis",
 *      "Aviary", "Horses" on the first real extract), which is not a venue. A name is never enough: a shop called "Soft Play Supplies" is not soft play.
 *   4. FACTS are copied only when the source states them. A tag that is absent is unknown, never "no".
 *   5. STATUS is unknown unless the source says otherwise, and then it carries the tag that says so.
 *
 * Pure: no network, no file, no database. Calibrate on the first real extract by reading 40 accepted and 40 rejected rows.
 */

/** Keys that, prefixed to a feature key, mean the thing is gone (`disused:leisure=playground`). */
const GONE_PREFIXES = ['disused:', 'abandoned:', 'was:', 'demolished:', 'removed:', 'razed:'];

/** The keys whose value makes a feature a venue for this dry run. */
const CLASSIFYING_KEYS = ['tourism', 'leisure', 'attraction', 'amenity', 'shop', 'building'];

/** [tag, value, group, subtype]. First match wins, so specific entries come before general ones. */
const RULES = [
  ['tourism', 'zoo', 'animals', (tags) => ({ petting_zoo: 'petting_zoo', wildlife_park: 'wildlife_park' }[tags.zoo] ?? 'zoo')],
  ['tourism', 'aquarium', 'animals', 'aquarium'],
  ['leisure', 'trampoline_park', 'play', 'trampoline_park'],
  ['leisure', 'indoor_play', 'play', 'indoor_play'],
  ['leisure', 'playground', 'play', (tags) => (tags.indoor === 'yes' ? 'indoor_play' : null)],
  ['leisure', 'playground', 'parks', 'playground'],
  ['tourism', 'museum', 'museums', 'museum'],
  ['tourism', 'gallery', 'museums', 'gallery'],
  ['leisure', 'nature_reserve', 'parks', 'nature_reserve'],
  ['leisure', 'park', 'parks', 'park'],
  ['tourism', 'theme_park', 'attractions', 'theme_park'],
  ['leisure', 'water_park', 'attractions', 'water_park'],
  ['leisure', 'ice_rink', 'attractions', 'ice_rink'],
  ['leisure', 'miniature_golf', 'attractions', 'miniature_golf'],
  ['leisure', 'bowling_alley', 'attractions', 'bowling_alley'],
];

const FAMILY_KEYS = ['wheelchair', 'toilets', 'changing_table', 'fee', 'opening_hours', 'min_age', 'max_age'];

/** The first tag that says this feature is gone, or not for the public. */
export function rejectedAsGone(tags) {
  for (const key of Object.keys(tags)) {
    const prefix = GONE_PREFIXES.find((p) => key.startsWith(p));
    // A lifecycle prefix says the THING is gone only when it sits on the key that makes it a venue (`was:tourism=museum`). On any other key
    // it is history about an attribute: `was:name=Geffrye Museum` is the Museum of the Home's old name, not its closure, and
    // `was:dog:conditional=...` on Bushy Park is an old rule about dogs. Found on the first real extract, where both were rejected as gone.
    if (prefix && CLASSIFYING_KEYS.includes(key.slice(prefix.length).split(':')[0])) return `${key}=${tags[key]}`;
  }
  if (tags.disused === 'yes') return 'disused=yes';
  if (tags.abandoned === 'yes') return 'abandoned=yes';
  if (tags.access === 'private' || tags.access === 'no') return `access=${tags.access}`;
  if (tags.opening_hours === 'off') return 'opening_hours=off';
  return null;
}

const yesNo = (value) => (value === 'yes' ? 'yes' : value === 'no' ? 'no' : null);

/** Facts the source itself states. Anything not stated is simply absent, which means unknown. */
export function factsFromTags(tags) {
  const facts = {};
  if (['yes', 'limited', 'no'].includes(tags.wheelchair)) facts.stepFree = tags.wheelchair;
  if (yesNo(tags.toilets)) facts.toilets = yesNo(tags.toilets);
  if (yesNo(tags.changing_table)) facts.babyChanging = yesNo(tags.changing_table);
  if (yesNo(tags.fee)) facts.fee = yesNo(tags.fee);
  // Hours are kept as the source's text. They are not parsed, so they are never presented as "open now".
  if (tags.opening_hours && typeof tags.opening_hours === 'string') facts.openingHoursText = tags.opening_hours;
  const minAge = Number(tags.min_age);
  const maxAge = Number(tags.max_age);
  if (Number.isFinite(minAge) && tags.min_age !== '') facts.minAge = minAge;
  if (Number.isFinite(maxAge) && tags.max_age !== '') facts.maxAge = maxAge;
  return facts;
}

/** The website only. Phone and email are personal contact details of small businesses and are never kept. */
export function websiteFromTags(tags) {
  const url = tags.website ?? tags['contact:website'];
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

export function classifyOsm(tags) {
  const gone = rejectedAsGone(tags);
  if (gone) return { ok: false, gate: 'operating_status', reason: `mapped as gone or not public: ${gone}` };

  if (!tags.name || !String(tags.name).trim()) return { ok: false, gate: 'identity', reason: 'no name' };

  for (const [key, value, group, subtype] of RULES) {
    if (tags[key] !== value) continue;
    const resolved = typeof subtype === 'function' ? subtype(tags) : subtype;
    // A rule whose subtype function returns null does not apply to this feature (an outdoor playground is not indoor play).
    if (typeof subtype === 'function' && resolved === null) continue;
    const decidedBy = { [key]: value };
    for (const extra of ['indoor', 'zoo', 'attraction']) if (tags[extra] && extra !== key) decidedBy[extra] = tags[extra];
    return {
      ok: true,
      group,
      subtype: resolved,
      decidedBy,
      facts: factsFromTags(tags),
      website: websiteFromTags(tags),
      // Signals that a thing is a destination people look for, not a pocket of land or a shop: a link to Wikidata or Wikipedia.
      signals: { wikidata: Boolean(tags.wikidata), wikipedia: Boolean(tags.wikipedia) },
      // Unknown stays unknown: nothing in an OSM tag set is evidence that a place is open today.
      status: { value: 'unknown', evidence: null },
      factTags: Object.fromEntries(FAMILY_KEYS.filter((k) => tags[k] !== undefined).map((k) => [k, tags[k]])),
    };
  }
  return { ok: false, gate: 'classification', reason: 'no classifying tag (a name alone is never enough)' };
}

export const OSM_RULE_TABLE = RULES.map(([key, value, group]) => ({ key, value, group }));
