/**
 * Conservative pushchair/buggy suitability extraction from official source text.
 * Does not infer from venue type — requires explicit mobility/access wording.
 */

const { cleanEvidenceSnippet } = require('./evidence-text-utils');

const MOBILITY_TERMS =
  /\b(pushchair(s)?|buggy|buggies|pram(s)?|stroller(s)?|wheelchair(s)?)\b/i;

const TERRAIN_TERMS =
  /\b(ramps?|steps?|stairs|gravel|mud(dy)?|uneven|paved|smooth|step.?free|flat|accessible routes?|paths?)\b/i;

const WELCOME_PATTERNS = [
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\s+(are\s+)?(welcome|allowed|permitted)\b/i,
  /\b(welcome|allowed|permitted)\b[^.]{0,40}\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\b/i,
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?|stroller(s)?)\s+(can|may)\s+(be\s+)?(used|brought|taken)\b/i,
];

const DIFFICULT_PATTERNS = [
  /\b(not suitable|not recommended|not advised|impractical|strongly advise against)\b/i,
  /\b(no pushchair|no buggy|no pram|pushchairs?\s+not|buggies?\s+not|prams?\s+not)\b/i,
  /\b(unable to|cannot|can't)\s+(use|bring|access)[^.]{0,30}\b(bugg(y|ies)|pram(s)?|pushchair(s)?)\b/i,
  /\b(bugg(y|ies)|pram(s)?|pushchair(s)?)\s+(are\s+)?(not|unsuitable|discouraged)\b/i,
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

function isRelevantSentence(sentence) {
  return MOBILITY_TERMS.test(sentence) || (TERRAIN_TERMS.test(sentence) && MOBILITY_TERMS.test(sentence));
}

function collectRelevantSentences(text) {
  const sentences = splitSentences(text);
  const relevant = sentences.filter(
    (s) => MOBILITY_TERMS.test(s) || (TERRAIN_TERMS.test(s) && /access|route|path|building|site|visit/i.test(s)),
  );

  if (relevant.length === 0) {
    const mobilityOnly = sentences.filter((s) => MOBILITY_TERMS.test(s));
    return mobilityOnly;
  }

  return relevant;
}

function countMatches(patterns, text) {
  return patterns.filter((re) => re.test(text)).length;
}

/**
 * Classify pushchair suitability from combined official-source text.
 * Returns { value, confidence } or null when insufficient evidence.
 */
function classifyPushchairSuitability(combinedText) {
  if (!combinedText || !MOBILITY_TERMS.test(combinedText)) {
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

  if (hasMixedSignal) {
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

  if (MOBILITY_TERMS.test(combinedText) && TERRAIN_TERMS.test(combinedText) && caveatCount >= 2) {
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
  cleanEvidenceSnippet,
};
