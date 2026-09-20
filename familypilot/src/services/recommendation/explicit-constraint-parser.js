/**
 * What the parent actually wrote, extracted deterministically.
 *
 * One of only two sources allowed to create a hard eligibility constraint; the other is the
 * family profile. A language model may paraphrase, spot a synonym and rank, but it may not decide
 * that a venue disappears — production showed it both dropping "it must have parking" and
 * inventing a required pushchair nobody mentioned.
 *
 * Because this layer *is* allowed to gate, it has to be conservative. Three rules follow from
 * that, and each one exists because the naive version was wrong:
 *
 *   - A bare mention never produces `required`. The parent has to say they need it.
 *   - A negated mention produces nothing at all. "I don't need parking" is not a parking
 *     requirement, and there is no negative value in the schema to express instead.
 *   - A duration is only a visit length when the sentence is about the visit. "within 1 hour of
 *     home" is how far they will travel.
 *
 * Plain CommonJS with a sibling .d.ts so the Expo/TypeScript app and the Node server can both use
 * this exact file. The alternative was two implementations of the same rules, which is how the
 * offline path came to disagree with the online one in the first place.
 */

/** Words that mark a stated requirement. Only these can produce `required`. */
const REQUIRED_WORDS = /\b(must|need|needs|needed|require|requires|required|have to|has to|essential)\b/;
/** Words that mark a stated preference. */
const PREFERRED_WORDS = /\b(want|wants|prefer|prefers|preferably|ideally|looking for|would like|hoping|nice to have)\b/;

/**
 * Negation, as parents actually phrase it.
 *
 * A concept is dropped when it appears after one of these in the same segment. Dropped, not
 * inverted: the schema only expresses positive requirements, so "no parking needed" cannot be
 * stored as anything truthful. Silence is the honest answer.
 *
 * Bare "no" excludes "no more than", which is a limit phrase, not a negation — it was otherwise
 * swallowing "a visit of no more than 90 minutes".
 */
const NEGATION_MARKERS = /\b(?:don'?t|do not|doesn'?t|does not|didn'?t|no need|not fussed|not bothered|not important|isn'?t important|aren'?t important|without|never|no(?!\s+more\s+than)\b)/g;

/** Where a segment says nothing about how badly a thing is wanted. Never `required`. */
const DEFAULT_STRENGTH = 'preferred';

/**
 * Concept patterns.
 *
 * `parking` is deliberately `\bparking\b` / `\bcar park\b` and never a bare "park" — half the
 * catalogue is parks, and "a walk in the park" is not a parking requirement.
 */
const CONCEPTS = [
  { field: 'environment', value: 'indoor', pattern: /\b(indoors?|inside|undercover)\b/ },
  { field: 'environment', value: 'outdoor', pattern: /\b(outdoors?|outside|fresh air|open air)\b/ },
  { field: 'energyLevel', value: 'high', pattern: /\b(burn off (some )?energy|burn some energy|run around|let off steam|active|energetic)\b/ },
  { field: 'energyLevel', value: 'low', pattern: /\b(quiet|calm|calmer|relaxed|chilled|low key|low-key)\b/ },
  { field: 'pushchair', value: 'not_difficult', pattern: /\b(pushchairs?|buggy|buggies|prams?|strollers?)\b/ },
  { field: 'babyChanging', value: 'yes', pattern: /\b(baby ?changing|changing facilities|changing table|nappy chang(e|ing))\b/ },
  { field: 'toilets', value: 'yes', pattern: /\b(toilets?|loos?|bathrooms?|restrooms?)\b/ },
  { field: 'parking', value: 'yes', pattern: /\b(parking|car parks?)\b/ },
];

/** Sentence punctuation. A new clause starts a new requirement context. */
const CLAUSE_SPLIT = /[,;.!?]+/;

/**
 * Conjunctions that divide a clause into segments.
 *
 * `and` coordinates: "must have baby changing and parking" means both are required, so strength
 * carries across it. The contrastive ones do the opposite — "I'd prefer indoors but it must have
 * parking" sets one thing against another, so strength must NOT carry, or the "must" leaks
 * backwards and makes the mere preference a hard gate.
 */
const CONJUNCTION_SPLIT = /\s+(and|but|however|although|though)\s+/;
const CONTRASTIVE = new Set(['but', 'however', 'although', 'though']);

/** Phrases that mark a duration as time spent at the venue. */
const STAY_CONTEXT = /\b(stay|staying|visit|visiting|spend|spending|there for|inside for)\b/;
/**
 * Phrases that mark a duration as travel.
 *
 * Checked even when a stay word is also present: "we can stay a while but nothing over an hour
 * away" is about the drive, and guessing the wrong dimension imposes a limit the parent never
 * asked for.
 */
const TRAVEL_CONTEXT = /\b(of home|from home|away|drive|driving|travel|travelling|journey|radius|each way)\b/;

const LIMIT_PREFIX = '(?:within|under|no more than|max(?:imum)?(?: of)?|up to|less than)';
const HOURS = new RegExp(`\\b${LIMIT_PREFIX}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:hours?|hrs?)\\b`);
const MINUTES = new RegExp(`\\b${LIMIT_PREFIX}\\s+(\\d+)\\s*(?:minutes?|mins?)\\b`);

function strengthOf(text) {
  if (REQUIRED_WORDS.test(text)) return 'required';
  if (PREFERRED_WORDS.test(text)) return 'preferred';
  return null;
}

/** Index of the earliest negation marker in a segment, or -1. */
function firstNegationIndex(segment) {
  NEGATION_MARKERS.lastIndex = 0;
  const match = NEGATION_MARKERS.exec(segment);
  NEGATION_MARKERS.lastIndex = 0;
  return match ? match.index : -1;
}

/**
 * A stated visit length, or null.
 *
 * Both hours and minutes require a stay cue and the absence of a travel cue. An earlier version
 * accepted hours unqualified on the theory that nobody states a drive limit in hours; "somewhere
 * within 1 hour of home" is a counter-example, and it became a 60-minute cap on the visit.
 */
function visitDurationFrom(text) {
  if (!STAY_CONTEXT.test(text)) return null;
  if (TRAVEL_CONTEXT.test(text)) return null;

  const hours = text.match(HOURS);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = text.match(MINUTES);
  if (minutes) return Number(minutes[1]);
  return null;
}

/**
 * Parse a parent's own words into constraints.
 *
 * Returns `{ constraints, supported }`. `constraints` is authoritative — no model output may
 * weaken, strengthen or contradict it. `supported` is the set of fields the text positively
 * backs, and is deliberately NOT the set of fields the text mentions: "I don't need parking"
 * mentions parking and supports nothing, so a model that then proposes parking cannot smuggle it
 * back in.
 */
function parseExplicitTextConstraints(rawText) {
  const text = typeof rawText === 'string' ? rawText.toLowerCase() : '';
  const constraints = {};
  const supported = new Set();
  if (!text.trim()) return { constraints, supported };

  for (const clause of text.split(CLAUSE_SPLIT)) {
    if (!clause.trim()) continue;

    const parts = clause.split(CONJUNCTION_SPLIT);
    let carried = null;

    // split() with a capture group interleaves segments and the conjunctions between them.
    for (let i = 0; i < parts.length; i += 2) {
      const segment = parts[i];
      const precedingConjunction = i === 0 ? null : parts[i - 1];
      if (precedingConjunction && CONTRASTIVE.has(precedingConjunction)) {
        // Contrast ends the previous requirement context rather than extending it.
        carried = null;
      }
      if (!segment || !segment.trim()) continue;

      const own = strengthOf(segment);
      if (own) carried = own;
      const strength = carried ?? DEFAULT_STRENGTH;

      const negationAt = firstNegationIndex(segment);
      for (const concept of CONCEPTS) {
        const match = segment.match(concept.pattern);
        if (!match) continue;
        // Negated: the parent said they do not need this. Record nothing, support nothing.
        if (negationAt !== -1 && match.index > negationAt) continue;
        supported.add(concept.field);
        // First positive statement of a field wins; a later bare mention cannot downgrade it.
        if (constraints[concept.field]) continue;
        constraints[concept.field] = { strength, value: concept.value };
      }

      const maxMinutes = visitDurationFrom(segment);
      if (maxMinutes != null && negationAt === -1) {
        supported.add('visitDuration');
        if (!constraints.visitDuration) {
          constraints.visitDuration = { strength, value: { maxMinutes } };
        }
      }
    }
  }

  return { constraints, supported };
}

module.exports = {
  CONCEPTS,
  DEFAULT_STRENGTH,
  parseExplicitTextConstraints,
  visitDurationFrom,
};
