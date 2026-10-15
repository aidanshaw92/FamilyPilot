/**
 * Venue-quality gates: places that are real, and are in OpenStreetMap, but are not somewhere a family goes for a day out.
 *
 * Found by reading the first real extract (see docs/OPEN_DATA_FIRST_EXTRACT.md): rugby clubs and school playing fields tagged as recreation
 * grounds, commercial galleries with a Wikipedia article, parish churches tagged as attractions, memorials, shops, a zoo enclosure named
 * "Animal Enclosure". Each rule says why, and every held-back place stays in rejected.csv with that reason so a reviewer can re-admit one.
 *
 * Pure: it reads tags and a name and decides. It adds no fact. A place we already hold is never judged here (it has proved it is a destination);
 * the caller decides that.
 *
 * Independent identity is not a claim about the place: nothing here, or anywhere downstream, says a place has toilets, opens at ten or suits a toddler.
 */

/** Names that say who the land belongs to rather than what it is. */
export const PRIVATE_USE_NAME = /\b(football club|rugby|cricket club|fc|rfc|sports club|sports ground|sports centre|sports park|school|academy|university|hospital|tennis club|bowls? club|hockey|athletic|social club|training ground|campus)\b/i;

/** The operator or owner of a park or ground, when that is a school, a club or a hospital rather than a council, a trust or the Royal Parks. */
export const PRIVATE_OPERATOR = /\b(school|academy|college|universit|hospital|nhs|football club|\bfc\b|rugby|cricket club|sports club|golf club|tennis club|bowls? club|hockey)\b/i;

/** A name that names no particular place. */
export const GENERIC_NAME = /^(the )?(park|gardens?|playground|recreation ground|playing fields?|field|green|animal enclosure|enclosure|zoo)$/i;

/** `access=` values that mean the public may not simply walk in. `permissive` and `yes` are fine. */
const CLOSED_ACCESS = new Set(['private', 'no', 'customers', 'members', 'permit', 'delivery', 'military']);

/** Working public buildings tagged as attractions: visitable on a tour, not a day out. */
const WORKING_BUILDING = new Set(['courthouse', 'townhall', 'school', 'college', 'university', 'hospital', 'clinic', 'bank', 'post_office', 'police', 'fire_station', 'prison', 'embassy', 'public_building']);

const MEMORIAL = new Set(['memorial', 'monument', 'wayside_cross', 'wayside_shrine', 'boundary_stone', 'milestone', 'plaque']);

/** The only tags the quality gates read. A row carries these and nothing else, so a phone number or an email address is never held. */
const QUALITY_KEYS = ['amenity', 'shop', 'access', 'operator', 'owner', 'historic', 'fee', 'opening_hours', 'wikidata'];
export const qualityTags = (tags = {}) => Object.fromEntries(QUALITY_KEYS.filter((k) => tags[k] !== undefined).map((k) => [k, tags[k]]));

/**
 * @param {{ name: string, subtype: string, group_id: string, tags: Record<string,string>, website?: string|null }} row
 * @param {{ publicCultural?: Set<string> | null }} [ctx] publicCultural: the Wikidata items that are museums or public galleries (CC0 file);
 *        null or absent means no Wikidata file was supplied, so galleries cannot be shown to be public and are held back.
 * @returns {{ gate: 'identity'|'classification'|'significance', reason: string } | null}
 */
export function qualityHold(row, ctx = {}) {
  const tags = row.tags ?? {};
  const name = String(row.name ?? '').trim();
  if (GENERIC_NAME.test(name)) return { gate: 'identity', reason: 'a name that names no particular place' };

  if (tags.amenity === 'place_of_worship') {
    return { gate: 'classification', reason: 'a place of worship: visitable, but not a family destination unless a person adds it' };
  }
  if (tags.shop) return { gate: 'classification', reason: `a shop (shop=${tags.shop}), not a visitor attraction` };

  const park = row.group_id === 'parks' && ['park', 'recreation_ground', 'nature_reserve', 'garden'].includes(row.subtype);
  if (park) {
    if (CLOSED_ACCESS.has(tags.access)) return { gate: 'classification', reason: `not open to the public (access=${tags.access})` };
    if (row.subtype !== 'nature_reserve' && PRIVATE_USE_NAME.test(name)) {
      return { gate: 'classification', reason: 'named for a club, school or sports ground: private use, not a public park' };
    }
    const owner = `${tags.operator ?? ''} ${tags.owner ?? ''}`;
    if (PRIVATE_OPERATOR.test(owner)) {
      return { gate: 'classification', reason: `run by a school, club or hospital (${owner.trim()}): private use, not a public park` };
    }
  }

  if (row.subtype === 'attraction') {
    if (WORKING_BUILDING.has(tags.amenity)) return { gate: 'classification', reason: `a working public building (amenity=${tags.amenity}), not a day out` };
    const stated = row.website || tags.fee || tags.opening_hours;
    if (MEMORIAL.has(tags.historic) && !stated) {
      return { gate: 'significance', reason: `a ${tags.historic} with no website, fee or opening hours: a landmark, not a destination` };
    }
  }

  if (row.subtype === 'gallery') {
    const qid = tags.wikidata;
    const set = ctx.publicCultural;
    if (!set) return { gate: 'classification', reason: 'a gallery, and no Wikidata file was supplied to show it is a museum or public gallery (most mapped galleries are commercial)' };
    if (!qid || !set.has(qid)) {
      return { gate: 'classification', reason: 'a gallery that Wikidata does not class as a museum or public gallery (most mapped galleries are commercial)' };
    }
  }
  return null;
}

/** The set of Wikidata item ids (`Q123`) whose class is a museum or art museum, from the SPARQL JSON the licence-review fetch writes. */
export function publicCulturalFromWikidata(json) {
  const out = new Set();
  const rows = json?.results?.bindings ?? [];
  for (const b of rows) {
    const label = String(b.classLabel?.value ?? '').toLowerCase();
    if (/museum|gallery/.test(label) && b.item?.value) out.add(b.item.value.split('/').pop());
  }
  return out;
}
