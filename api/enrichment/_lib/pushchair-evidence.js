/**
 * Conservative pushchair/buggy suitability extraction from official source text.
 * Does not infer from venue type or wheelchair/accessibility wording alone.
 */

const { cleanEvidenceSnippet } = require('./evidence-text-utils');

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
  /\b(no pushchair|no buggy|no pram|pushchairs?\s+not|buggies?\s+not|prams?\s+not)\b/i,
  /\b(unable to|cannot|can't)\s+(use|bring|access)[^.]{0,30}\b(bugg(y|ies)|pram(s)?|pushchair(s)?)\b/i,
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?)\s+(are\s+)?(not|unsuitable|discouraged)\b/i,
  /\bpushchairs?\s+(are\s+)?not recommended\b/i,
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
  const sentences = splitSentences(text);
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

function hasPushchairSpecificTerm(text) {
  return PUSHCHAIR_TERMS.test(text);
}

/**
 * Classify pushchair suitability from combined official-source text.
 * Requires explicit pushchair/buggy/pram/stroller terminology — not wheelchair alone.
 */
function classifyPushchairSuitability(combinedText) {
  if (!combinedText || !hasPushchairSpecificTerm(combinedText)) {
    return null;
  }

  const hasWelcome = WELCOME_PATTERNS.some((re) => re.test(combinedText));
  const hasDifficult = DIFFICULT_PATTERNS.some((re) => re.test(combinedText));
  const hasMixedSignal = MIXED_PATTERNS.some((re) => re.test(combinedText));
  const caveatCount = countMatches(CAVEAT_PATTERNS, combinedText);
  const excellentCount = countMatches(EXCELLENT_PATTERNS, combinedText);

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

  if (
    hasPushchairSpecificTerm(combinedText) &&
    ACCESS_ROUTE_PATTERNS.some((re) => re.test(combinedText)) &&
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
