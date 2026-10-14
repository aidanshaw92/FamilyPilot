/**
 * Does this open-data feature name the same place as one we already hold?
 *
 * The app's own alias detector (server/places/lib/venue-alias-detection.js) is deliberately strict because a false merge there hides a
 * venue. Here a false match costs a person's glance, so a second, looser test runs after it. Anything the loose test finds is marked
 * `needs_review`, and nothing is keyed to a stored place until a person has confirmed it.
 *
 * Found on the first real extract: "Burgh House" and "Burgh House and Hampstead Museum" (4 m apart), "Lane7 London Camden" and "Lane7"
 * (51 m), "Byron Park" and "Byron Recreation Ground" (20 m), "Sunny Hill Park" and "Sunnyhill Park" (128 m) all failed the strict test.
 */

/** Words that say what kind of place it is, not which one. */
const KIND_WORDS = new Set([
  'the', 'and', 'of', 'at', 'in', 'london', 'park', 'parks', 'gardens', 'garden', 'recreation', 'ground', 'grounds', 'green', 'common',
  'museum', 'gallery', 'centre', 'center', 'house', 'hall', 'farm', 'zoo', 'playground', 'play', 'area', 'open', 'space', 'nature', 'reserve',
]);

const words = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const compact = (name) => words(name).join('');
const keyWords = (name) => words(name).filter((w) => w.length > 1 && !KIND_WORDS.has(w));

/**
 * True when the two names are plausibly one place, given they lie within `km` of each other. Used only as a second opinion.
 * Within 120 m: the names are equal once spaces are removed ("Sunny Hill" / "Sunnyhill"), or every distinguishing word of the shorter
 * name appears in the longer ("Lane7" in "Lane7 London Camden", "Byron" in "Byron Recreation Ground"). A name with no distinguishing
 * word left ("The Park") never matches this way.
 */
export function looseSameVenue(nameA, nameB, km) {
  if (!(km <= 0.12)) return false;
  if (compact(nameA) === compact(nameB)) return true;
  const a = keyWords(nameA);
  const b = keyWords(nameB);
  if (!a.length || !b.length) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const have = new Set(longer);
  const joined = longer.join('');
  return shorter.every((w) => have.has(w) || (w.length > 4 && joined.includes(w)));
}
