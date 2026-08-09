/**
 * Conservative environment extraction from explicit official wording only.
 * Does not infer from venue category or type.
 */

const { cleanEvidenceSnippet } = require('./evidence-text-utils');

const MIXED_PATTERNS = [
  /\bindoors?\b[^.!?]{0,50}\b(?:and|&)\b[^.!?]{0,50}\boutdoors?\b/i,
  /\boutdoors?\b[^.!?]{0,50}\b(?:and|&)\b[^.!?]{0,50}\bindoors?\b/i,
  /\bplay\s+outdoors?\b[^.!?]{0,40}\bindoors?\b/i,
  /\bindoors?\b[^.!?]{0,40}\bplay\s+outdoors?\b/i,
  /\bexplore[^.!?]{0,30}\bindoors?\b[^.!?]{0,40}\boutdoors?\b/i,
];

const INDOOR_PATTERNS = [/\bindoor\b/i, /\bindoors\b/i];

const OUTDOOR_PATTERNS = [/\boutdoor\b/i, /\boutdoors\b/i, /\bopen[\s-]air\b/i];

function buildAnalysisText(text, pageTitle) {
  const parts = [];
  if (pageTitle && typeof pageTitle === 'string') parts.push(pageTitle.trim());
  if (text && typeof text === 'string') parts.push(text.trim());
  return parts.filter(Boolean).join(' ');
}

function splitSentences(text) {
  return text
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 10);
}

function extractEnvironmentEvidenceClause(text) {
  const clausePatterns = [
    /whatever the weather[^.!?]{10,180}/i,
    /[^.!?]{0,30}indoors?\s+and\s+(?:play\s+)?outdoors?[^.!?]{0,80}/i,
    /[^.!?]{0,30}outdoors?\s+and\s+[^.!?]{0,30}indoors?[^.!?]{0,80}/i,
    /[^.!?]{0,40}\bindoor\b[^.!?]{0,80}/i,
    /[^.!?]{0,40}\boutdoor\b[^.!?]{0,80}/i,
    /[^.!?]{0,40}\bopen[\s-]air\b[^.!?]{0,80}/i,
  ];

  for (const pattern of clausePatterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = cleanEvidenceSnippet(match[0]);
      if (cleaned && cleaned.length >= 12) return cleaned;
    }
  }

  return cleanEvidenceSnippet(text.length > 200 ? text.slice(-200) : text);
}

function classifyEnvironment(analysisText) {
  if (!analysisText) return null;

  for (const sentence of splitSentences(analysisText)) {
    if (MIXED_PATTERNS.some((re) => re.test(sentence))) {
      return { value: 'mixed', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(sentence) };
    }
  }

  for (const sentence of splitSentences(analysisText)) {
    const hasIndoor = INDOOR_PATTERNS.some((re) => re.test(sentence));
    const hasOutdoor = OUTDOOR_PATTERNS.some((re) => re.test(sentence));
    if (hasIndoor && hasOutdoor) {
      return { value: 'mixed', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(sentence) };
    }
  }

  for (const sentence of splitSentences(analysisText)) {
    if (INDOOR_PATTERNS.some((re) => re.test(sentence)) && !OUTDOOR_PATTERNS.some((re) => re.test(sentence))) {
      return { value: 'indoor', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(sentence) };
    }
  }

  for (const sentence of splitSentences(analysisText)) {
    if (OUTDOOR_PATTERNS.some((re) => re.test(sentence)) && !INDOOR_PATTERNS.some((re) => re.test(sentence))) {
      return { value: 'outdoor', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(sentence) };
    }
  }

  return null;
}

function extractEnvironmentEvidence(text, sourceMeta) {
  const analysisText = buildAnalysisText(text, sourceMeta?.pageTitle);
  const classification = classifyEnvironment(analysisText);
  if (!classification) return null;

  const evidenceText = cleanEvidenceSnippet(classification.evidenceText);
  if (!evidenceText) return null;

  return {
    field: 'environment',
    value: classification.value,
    confidence: classification.confidence,
    evidenceText,
    sourceUrl: sourceMeta.url,
    sourceType: sourceMeta.sourceType,
    retrievedAt: sourceMeta.retrievedAt,
  };
}

module.exports = {
  extractEnvironmentEvidence,
  classifyEnvironment,
  buildAnalysisText,
  MIXED_PATTERNS,
};
