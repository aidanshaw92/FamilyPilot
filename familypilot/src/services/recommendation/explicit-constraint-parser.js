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
const REQUIRED_WORDS = /\b(?:must|need|needs|needed|require|requires|required|have to|has to|essential|a must)\b/;
/** Words that mark a stated preference. */
const PREFERRED_WORDS = /\b(?:want|wants|prefer|prefers|preferably|ideally|looking for|would like|hoping|nice to have)\b/;

/**
 * Every modality marker in a segment, with its position.
 *
 * Positions matter because one segment routinely governs two concepts differently: in "we need
 * somewhere indoors ideally with parking", `need` governs `indoors` and `ideally` governs
 * `parking`. Testing the segment as a whole and letting `required` win the tie made the parent's
 * merely-ideal parking a hard gate.
 */
const MODALITY_SCAN = new RegExp(`(${REQUIRED_WORDS.source})|(${PREFERRED_WORDS.source})`, 'g');

/**
 * Qualifiers that soften the concept they follow.
 *
 * "with parking if possible" states a preference even though `need` appeared earlier in the
 * sentence. These only ever downgrade, never upgrade, so an over-broad match costs a ranking
 * nudge rather than a wrongly excluded venue.
 *
 * Deliberately excludes `ideally` and `preferably`, which precede what they govern — "indoors
 * ideally with parking" softens the parking, not the indoors. They are prefix markers instead.
 */
const POSTFIX_PREFERRED = /\b(?:if possible|if we can|if they have|if there'?s|if there is|would be nice|is nice|would be good)\b/;

/**
 * Negation, as parents actually phrase it.
 *
 * Negation applies to the WHOLE segment, not just to concepts appearing after the marker. An
 * earlier version required `match.index > negationAt`, which let "parking isn't important"
 * through as a positive preference and, worse, let "parking is not required" through as
 * `required` — the exact inverse of what the parent said. Attributing negation precisely is hard
 * and the cost of getting it wrong is a venue wrongly removed, so the whole segment is dropped.
 *
 * Dropped, not inverted: the schema only expresses positive requirements, so "no parking needed"
 * cannot be stored as anything truthful. Silence is the honest answer.
 *
 * Bare "no" excludes "no more than", which is a limit phrase, not a negation — it was otherwise
 * swallowing "a visit of no more than 90 minutes".
 */
const NEGATION_MARKERS = /\b(?:don'?t|do not|doesn'?t|does not|didn'?t|did not|isn'?t|is not|aren'?t|are not|wasn'?t|was not|won'?t|will not|can'?t|cannot|not|no need|without|never|no(?!\s+more\s+than))\b/;

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

/** Modality markers in a segment, in order, as { index, strength }. */
function modalityMarkers(segment) {
  const markers = [];
  MODALITY_SCAN.lastIndex = 0;
  let match;
  while ((match = MODALITY_SCAN.exec(segment)) !== null) {
    markers.push({ index: match.index, strength: match[1] ? 'required' : 'preferred' });
  }
  MODALITY_SCAN.lastIndex = 0;
  return markers;
}

/**
 * Which modality governs a concept at this position.
 *
 * A marker normally governs what follows it, so the nearest preceding one wins. Where none
 * precedes — "parking is essential" — the nearest following marker governs instead, because the
 * parent has still plainly stated one. Failing both, the strength carried from an earlier
 * coordinated segment applies, and failing that, `preferred`.
 */
function strengthForConcept(markers, conceptIndex, carried) {
  let preceding = null;
  let following = null;
  for (const marker of markers) {
    if (marker.index < conceptIndex) preceding = marker;
    else if (following === null) following = marker;
  }
  if (preceding) return preceding.strength;
  if (following) return following.strength;
  return carried ?? DEFAULT_STRENGTH;
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

      // Any negation anywhere in the segment disqualifies the whole segment.
      if (NEGATION_MARKERS.test(segment)) continue;

      const markers = modalityMarkers(segment);
      const softenedFrom = segment.search(POSTFIX_PREFERRED);
      // The last marker sets the context inherited by a following coordinated segment.
      if (markers.length > 0) carried = markers[markers.length - 1].strength;

      const hits = [];
      for (const concept of CONCEPTS) {
        const match = segment.match(concept.pattern);
        if (match) hits.push({ concept, index: match.index });
      }

      // A postfix qualifier softens only the concept it immediately follows. Applying it to
      // everything earlier in the segment turned "we need somewhere indoors with parking if
      // possible" into a merely-preferred indoors, losing a requirement the parent did state.
      const softened =
        softenedFrom === -1
          ? null
          : hits
              .filter((hit) => hit.index < softenedFrom)
              .sort((a, b) => b.index - a.index)[0] ?? null;

      for (const hit of hits) {
        supported.add(hit.concept.field);
        // First positive statement of a field wins; a later bare mention cannot downgrade it.
        if (constraints[hit.concept.field]) continue;
        const strength =
          hit === softened ? DEFAULT_STRENGTH : strengthForConcept(markers, hit.index, carried);
        constraints[hit.concept.field] = { strength, value: hit.concept.value };
      }

      const maxMinutes = visitDurationFrom(segment);
      if (maxMinutes != null) {
        supported.add('visitDuration');
        if (!constraints.visitDuration) {
          const index = segment.search(MINUTES) !== -1 ? segment.search(MINUTES) : segment.search(HOURS);
          constraints.visitDuration = {
            strength: strengthForConcept(markers, index === -1 ? segment.length : index, carried),
            value: { maxMinutes },
          };
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
