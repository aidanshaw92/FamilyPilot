/**
 * What the parent actually wrote, extracted deterministically.
 *
 * This is one of only two sources allowed to create a hard eligibility constraint; the other is
 * the family profile. A language model may suggest, paraphrase and rank, but it may not decide
 * that a venue disappears — production showed it both dropping "it must have parking" and
 * inventing a required pushchair nobody asked for, and either direction silently changes which
 * places a parent is shown.
 *
 * Everything here is a pure function of the text. Same input, same output, no model, no network.
 */

/** Words that mark a stated requirement. Only these can produce `required`. */
const REQUIRED_WORDS = /\b(must|need|needs|needed|require|requires|required|have to|has to|essential)\b/;
/** Words that mark a stated preference. */
const PREFERRED_WORDS = /\b(want|wants|prefer|prefers|preferably|ideally|looking for|would like|hoping|nice to have)\b/;

/**
 * Where a clause says nothing about how badly it is wanted.
 *
 * `preferred`, never `required`: inventing a hard gate from a bare mention is the same failure as
 * letting the model invent one. A parent has to actually say they need it.
 */
const DEFAULT_STRENGTH = 'preferred';

/**
 * Concept patterns.
 *
 * `parking` is deliberately `\bparking\b` / `\bcar park\b` and never a bare "park" — half the
 * catalogue is parks, and "we went to the park" is not a parking requirement.
 */
const CONCEPTS = [
  { field: 'environment', value: 'indoor', pattern: /\b(indoors?|inside|undercover)\b/ },
  { field: 'environment', value: 'outdoor', pattern: /\b(outdoors?|outside|fresh air|open air)\b/ },
  { field: 'energyLevel', value: 'high', pattern: /\b(burn off (some )?energy|burn some energy|run around|let off steam|active|energetic)\b/ },
  { field: 'energyLevel', value: 'low', pattern: /\b(quiet|calm|calmer|relaxed|chilled|low key|low-key)\b/ },
  { field: 'pushchair', value: 'not_difficult', pattern: /\b(pushchair|pushchairs|buggy|buggies|pram|prams|stroller|strollers)\b/ },
  { field: 'babyChanging', value: 'yes', pattern: /\b(baby ?changing|changing facilities|changing table|nappy change|nappy changing)\b/ },
  { field: 'toilets', value: 'yes', pattern: /\b(toilets?|loos?|bathrooms?|restrooms?)\b/ },
  { field: 'parking', value: 'yes', pattern: /\b(parking|car park|car parks)\b/ },
];

/** Sentence-level punctuation. A new clause starts a new requirement context. */
const CLAUSE_SPLIT = /[,;.!?]+/;
/**
 * Within a clause, " and " starts a new segment — but only a segment carrying its own strength
 * word changes the context. "it must have baby changing and parking" keeps `parking` required,
 * because the second segment says nothing of its own; "we need parking and we want to run around"
 * correctly splits, because the second segment says "want".
 */
const SEGMENT_SPLIT = /\s+and\s+/;

function strengthOf(text) {
  // Requirement wins a tie: "we need X, ideally Y" in one segment is safer read as required.
  if (REQUIRED_WORDS.test(text)) return 'required';
  if (PREFERRED_WORDS.test(text)) return 'preferred';
  return null;
}

/**
 * Explicit visit-length limits, in the unambiguous forms only.
 *
 * "a 2 hour visit" is a stated limit; "we were there 2 hours last time" is not, so only the
 * bounded phrasings below count. Anything vaguer is left to the model as a soft suggestion.
 */
const LIMIT_PREFIX = '(?:within|under|no more than|max(?:imum)?(?: of)?|up to|less than)';

function visitDurationFrom(text) {
  // Hours are safe unqualified: a family states a drive limit in minutes, never "within 2 hours".
  const hours = text.match(new RegExp(`\\b${LIMIT_PREFIX}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:hours?|hrs?)\\b`));
  if (hours) return Math.round(Number(hours[1]) * 60);

  // Minutes are NOT safe unqualified. "within 20 minutes" is far more likely to be how far the
  // parent will drive than how long they will stay, and reading it as a visit length would
  // silently impose the wrong limit. Only take it when the sentence says it is about the visit.
  const minutes = text.match(
    new RegExp(`\\b${LIMIT_PREFIX}\\s+(\\d+)\\s*(?:minutes?|mins?)\\b`),
  );
  if (minutes && /\b(visit|stay|there|inside|at the (?:venue|place))\b/.test(text)) {
    return Number(minutes[1]);
  }
  return null;
}

/**
 * Every concept the text mentions at all, regardless of strength.
 *
 * Used to tell "the parent talked about this and we read it" apart from "the model produced a
 * field nothing in the text supports".
 */
function mentionedFields(text) {
  const mentioned = new Set();
  for (const concept of CONCEPTS) {
    if (concept.pattern.test(text)) mentioned.add(concept.field);
  }
  if (visitDurationFrom(text) != null) mentioned.add('visitDuration');
  return mentioned;
}

/**
 * Parse a parent's own words into constraints.
 *
 * Returns `{ constraints, mentioned }`. `constraints` is authoritative: whatever it contains, no
 * model output may weaken, strengthen or contradict.
 */
function parseExplicitTextConstraints(rawText) {
  const text = typeof rawText === 'string' ? rawText.toLowerCase() : '';
  const constraints = {};
  if (!text.trim()) return { constraints, mentioned: new Set() };

  for (const clause of text.split(CLAUSE_SPLIT)) {
    if (!clause.trim()) continue;

    // Strength carries forward across " and " until a segment states its own.
    let carried = null;
    for (const segment of clause.split(SEGMENT_SPLIT)) {
      const own = strengthOf(segment);
      if (own) carried = own;
      const strength = carried ?? DEFAULT_STRENGTH;

      for (const concept of CONCEPTS) {
        if (!concept.pattern.test(segment)) continue;
        // First statement of a field wins; a later bare mention cannot downgrade it.
        if (constraints[concept.field]) continue;
        constraints[concept.field] = { strength, value: concept.value };
      }

      const maxMinutes = visitDurationFrom(segment);
      if (maxMinutes != null && !constraints.visitDuration) {
        constraints.visitDuration = { strength, value: { maxMinutes } };
      }
    }
  }

  return { constraints, mentioned: mentionedFields(text) };
}

module.exports = {
  CONCEPTS,
  DEFAULT_STRENGTH,
  parseExplicitTextConstraints,
  visitDurationFrom,
};
