/**
 * Conservative pushchair/buggy suitability extraction from official source text.
 * Does not infer from venue type or wheelchair/accessibility wording alone.
 */

const { cleanEvidenceSnippet, isInterrogativeSentence } = require('./evidence-text-utils');

const PUSHCHAIR_TERMS =
  /\b(pushchair(s)?|buggy|buggies|pram(s)?|stroller(s)?)\b/i;

const WHEELCHAIR_TERMS = /\b(wheelchair(s)?|mobility scooter(s)?)\b/i;

const TERRAIN_TERMS =
  /\b(ramps?|steps?|stairs|gravel|mud(dy)?|uneven|paved|smooth|step.?free|flat|accessible routes?|paths?)\b/i;

const WELCOME_PATTERNS = [
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\s+(are\s+)?(welcome|allowed|permitted)\b/i,
  /\b(welcome|allowed|permitted)\b[^.]{0,40}\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\b/i,
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\s+(can|may)\s+(be\s+)?(used|brought|taken)\b/i,
];

const DIFFICULT_PATTERNS = [
  /\b(not suitable|not recommended|not advised|impractical|strongly advise against)\b[^.]{0,40}\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\b/i,
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)[^.]{0,40}\b(not suitable|not recommended|not advised|impractical)\b/i,
  // Plurals matter here. The original form of this rule was `no pushchair|no buggy|no pram` with a
  // trailing \b, so "No prams allowed." matched nothing -- the \b after "pram" met the "s" -- while
  // WELCOME_PATTERNS happily matched "prams allowed" in the same three words. A flat denial read as
  // a welcome. Found by probing the exported classifier directly, not by any page in the corpus.
  /\bno\s+(?:pushchairs?|buggies|buggy|prams?|strollers?)\b/i,
  /\b(pushchairs?|buggies?|prams?|strollers?)\s+not\b/i,
  /\b(unable to|cannot|can't)\s+(use|bring|access)[^.]{0,30}\b(bugg(y|ies)|pram(s)?|pushchair(s)?)\b/i,
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?)\s+(are\s+)?(not|unsuitable|discouraged)\b/i,
  /\bpushchairs?\s+(are\s+)?not recommended\b/i,
  // Paradox Museum London states this twice on the page behind its live `good` claim: "the space is
  // not accessible for prams/strollers" and "The museum space is inaccessible for prams/strollers".
  // Neither matched any rule above, because they all want wording like "prams not" or "not suitable".
  /\b(?:not\s+accessible|inaccessible)\s+for\s+[^.!?]{0,25}\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\b/i,
];

const MIXED_PATTERNS = [
  /\b(limited access|significant limitations|many steps|steep|hilly|largely inaccessible)\b/i,
  /\b(not all (routes|areas|paths|buildings)|difficult terrain|very uneven)\b/i,
  /\b(mostly|largely)\s+(gravel|uneven|inaccessible)\b/i,
];

const CAVEAT_PATTERNS = [
  /\bgravel\b/i,
  /\bmud(dy)?\b/i,
  /\buneven\b/i,
  /\bsome buildings\b/i,
  /\bnot accommodate\b/i,
  /\boccasional steps\b/i,
  /\bsome areas\b/i,
  /\bcan get muddy\b/i,
  /\bcan become muddy\b/i,
  /\bweather dependent\b/i,
  /\bnot all buildings\b/i,
];

const EXCELLENT_PATTERNS = [
  /\bstep.?free\b/i,
  /\bsmooth paths?\b/i,
  /\bpaved paths?\b/i,
  /\bflat paths?\b/i,
  /\bfully accessible\b/i,
  /\baccessible throughout\b/i,
];

function splitSentences(text) {
  return text
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 10);
}

function collectRelevantSentences(text) {
  // Drop questions before the pushchair-term gate, not after. A page whose only pushchair mention is
  // an FAQ heading ("Are prams allowed?") carries no fact, so it must not qualify the page for
  // classification either -- unknown is the correct answer there, and was not what production gave.
  const sentences = splitSentences(text).filter((s) => !isInterrogativeSentence(s));
  if (!sentences.some((s) => PUSHCHAIR_TERMS.test(s))) {
    return [];
  }

  return sentences.filter(
    (s) =>
      PUSHCHAIR_TERMS.test(s) ||
      (TERRAIN_TERMS.test(s) && /access|route|path|building|site|visit|step/i.test(s)),
  );
}

function countMatches(patterns, text) {
  return patterns.filter((re) => re.test(text)).length;
}

/**
 * Neutralise negated positive phrases before positive signals are counted.
 *
 * `EXCELLENT_PATTERNS` and `ACCESS_ROUTE_PATTERNS` both look for "step-free", which matches happily
 * inside "A few exhibits are not step-free" -- the exact opposite of what the page says. Rather than
 * bolt a lookbehind onto each pattern, the negated span is replaced once, here, with a token that
 * matches nothing. Positive signals are computed on the masked text; negatives always read the
 * original, so "not accessible for prams" stays visible to DIFFICULT_PATTERNS.
 */
const NEGATED_POSITIVE =
  /\b(?:not|non|never)[\s-]+(step.?free|fully\s+accessible|accessible|suitable|recommended|advised|allowed|permitted|welcome(?:d)?)\b/gi;

/**
 * "No prams allowed" negates the welcome verb from in front of the noun rather than behind it, so
 * NEGATED_POSITIVE cannot see it -- there is no "not". Masked separately.
 */
const NEGATED_BY_LEADING_NO =
  /\bno\s+(?:pushchairs?|buggies|buggy|prams?|strollers?)\s+(?:are\s+)?(?:allowed|permitted|welcome(?:d)?)\b/gi;

function maskNegatedPositives(text) {
  return text.replace(NEGATED_POSITIVE, ' XNEGATEDX ').replace(NEGATED_BY_LEADING_NO, ' XNEGATEDX ');
}

function hasPushchairSpecificTerm(text) {
  return PUSHCHAIR_TERMS.test(text);
}

/**
 * Strip questions from text about to be classified. See isInterrogativeSentence.
 *
 * Splits on its own rather than reusing splitSentences, which discards fragments of 10 characters or
 * fewer. That filter is right when gathering candidate sentences and wrong here: routing classifier
 * input through it silently made short statements like "No prams." unclassifiable.
 */
function dropInterrogatives(text) {
  return String(text)
    .split(/(?:\n|\r|•|·|•|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s !== '' && !isInterrogativeSentence(s))
    .join(' ');
}

/**
 * Classify pushchair suitability from combined official-source text.
 * Requires explicit pushchair/buggy/pram/stroller terminology — not wheelchair alone.
 *
 * Questions are discarded HERE rather than only in collectRelevantSentences, because this function is
 * exported and called directly. Guarding just the one call path is how the original defect survived:
 * the field-pattern extractor already refused question-only evidence, the pushchair classifier did
 * not, and the same FAQ heading was read two different ways on the same page.
 */
function classifyPushchairSuitability(rawText) {
  const combinedText = rawText ? dropInterrogatives(rawText) : '';
  if (!combinedText || !hasPushchairSpecificTerm(combinedText)) {
    return null;
  }

  // Negatives read the original text; positives read the masked text. See maskNegatedPositives.
  const positiveText = maskNegatedPositives(combinedText);

  const hasWelcome = WELCOME_PATTERNS.some((re) => re.test(positiveText));
  const hasDifficult = DIFFICULT_PATTERNS.some((re) => re.test(combinedText));
  const hasMixedSignal = MIXED_PATTERNS.some((re) => re.test(combinedText));
  const caveatCount = countMatches(CAVEAT_PATTERNS, combinedText);
  const excellentCount = countMatches(EXCELLENT_PATTERNS, positiveText);

  if (hasDifficult && !hasWelcome) {
    return { value: 'difficult', confidence: 'high' };
  }

  if (hasDifficult && hasWelcome) {
    return { value: 'mixed', confidence: 'high' };
  }

  if (hasMixedSignal && hasWelcome) {
    return { value: 'mixed', confidence: 'high' };
  }

  if (hasWelcome && caveatCount >= 1) {
    return { value: 'good', confidence: 'high' };
  }

  if (hasWelcome && excellentCount >= 1 && caveatCount === 0) {
    return { value: 'excellent', confidence: 'high' };
  }

  if (hasWelcome) {
    return { value: 'good', confidence: 'medium' };
  }

  const ACCESS_ROUTE_PATTERNS = [
    /\bwide\s+aisles\b[^.!?]{0,50}\b(wheelchair(s)?|pushchair(s)?|buggy|buggies|pram(s)?)\b/i,
    /\b(wheelchair(s)?|pushchair(s)?|buggy|buggies|pram(s)?)\b[^.!?]{0,50}\bwide\s+aisles\b/i,
    /\b(wheelchair(s)?|pushchair(s)?)\b[^.!?]{0,50}\b(step.?free|lifts?\s+to)\b/i,
    /\b(step.?free)\b[^.!?]{0,50}\b(wheelchair(s)?|pushchair(s)?)\b/i,
  ];

  // This is the branch that actually published Paradox Museum's `good`, once the FAQ heading had
  // supplied a welcome; without that heading it is still reachable, because "not wheelchair accessible
  // A few exhibits are not step-free" put a pushchair-or-wheelchair term within 50 characters of
  // "step-free" with no sentence punctuation between them. The masked text is what it reads now.
  if (
    hasPushchairSpecificTerm(combinedText) &&
    ACCESS_ROUTE_PATTERNS.some((re) => re.test(positiveText)) &&
    !hasDifficult
  ) {
    return { value: 'good', confidence: 'high' };
  }

  if (hasPushchairSpecificTerm(combinedText) && TERRAIN_TERMS.test(combinedText) && caveatCount >= 2) {
    return { value: 'mixed', confidence: 'medium' };
  }

  return null;
}

function extractPushchairEvidence(text, sourceMeta) {
  const relevant = collectRelevantSentences(text);
  if (relevant.length === 0) return null;

  const combined = relevant.join(' ');
  const classification = classifyPushchairSuitability(combined);
  if (!classification) return null;

  const evidenceText = cleanEvidenceSnippet(combined);
  if (!evidenceText) return null;

  return {
    field: 'pushchairSuitability',
    value: classification.value,
    confidence: classification.confidence,
    evidenceText,
    sourceUrl: sourceMeta.url,
    sourceType: sourceMeta.sourceType,
    retrievedAt: sourceMeta.retrievedAt,
  };
}

module.exports = {
  extractPushchairEvidence,
  classifyPushchairSuitability,
  collectRelevantSentences,
  hasPushchairSpecificTerm,
  cleanEvidenceSnippet,
  PUSHCHAIR_TERMS,
  WHEELCHAIR_TERMS,
};
