/**
 * Keyword-based evidence extraction from official source text.
 * Does NOT invent facts — only extracts explicit or strongly implied statements.
 */

const FIELD_PATTERNS = [
  {
    field: 'toilets',
    yes: [/toilet(s)?\s+(are\s+)?available/i, /toilet\s+facilities/i, /restroom(s)?\s+available/i],
    no: [/no\s+toilet/i],
  },
  {
    field: 'babyChanging',
    yes: [/baby\s+chang(e|ing)/i, /nappy\s+chang(e|ing)/i, /changing\s+facilit(y|ies)/i],
    no: [/no\s+baby\s+chang/i],
  },
  {
    field: 'parking',
    yes: [/parking\s+(is\s+)?available/i, /car\s+park/i, /on.?site\s+parking/i],
    no: [/no\s+parking/i, /limited\s+parking/i],
  },
  {
    field: 'cafe',
    yes: [/caf[eé]\s+(on\s+site|available)/i, /coffee\s+shop/i, /refreshments?\s+available/i],
    no: [/no\s+caf[eé]/i],
  },
  {
    field: 'wheelchairAccessible',
    yes: [/wheelchair\s+access/i, /step.?free/i, /accessible\s+to\s+all/i],
    no: [/not\s+wheelchair/i],
  },
  {
    field: 'accessibleToilet',
    yes: [/accessible\s+toilet/i, /disabled\s+toilet/i, /changing\s+places/i],
    no: [/no\s+accessible\s+toilet/i],
  },
  {
    field: 'pushchairSuitability',
    yes: [/pushchair/i, /buggy/i, /pram/i, /stroller/i],
    no: [/no\s+pushchair/i, /buggies?\s+not/i],
  },
  {
    field: 'playground',
    yes: [/playground/i, /play\s+area/i],
    no: [/no\s+playground/i],
  },
  {
    field: 'sensoryFriendlySessions',
    yes: [/sensory\s+friendly/i, /quiet\s+session/i, /relaxed\s+performance/i],
    no: [],
  },
];

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function matchField(sentence, patterns) {
  for (const re of patterns.no) {
    if (re.test(sentence)) return { value: 'no', confidence: 'high' };
  }
  for (const re of patterns.yes) {
    if (re.test(sentence)) return { value: 'yes', confidence: 'high' };
  }
  return null;
}

function extractEvidenceFromText(text, sourceMeta) {
  const sentences = splitSentences(text);
  const facts = [];

  for (const pattern of FIELD_PATTERNS) {
    for (const sentence of sentences) {
      const match = matchField(sentence, pattern);
      if (!match) continue;
      facts.push({
        field: pattern.field,
        value: match.value,
        confidence: match.confidence,
        evidenceText: sentence.slice(0, 400),
        sourceUrl: sourceMeta.url,
        sourceType: sourceMeta.sourceType,
        retrievedAt: sourceMeta.retrievedAt,
      });
      break;
    }
  }

  return facts;
}

function mergeEvidenceBundles(sources) {
  const byField = new Map();
  for (const source of sources) {
    for (const fact of source.facts ?? []) {
      const existing = byField.get(fact.field);
      if (!existing || rankConfidence(fact.confidence) > rankConfidence(existing.confidence)) {
        byField.set(fact.field, fact);
      }
    }
  }
  return [...byField.values()];
}

function rankConfidence(c) {
  if (c === 'high') return 3;
  if (c === 'medium') return 2;
  if (c === 'low') return 1;
  return 0;
}

function buildEvidenceBundle(venueId, sources, sourceStatus) {
  return {
    venueId,
    sourceStatus,
    sources: sources.map((s) => ({
      url: s.url,
      type: s.sourceType,
      pageTitle: s.pageTitle ?? null,
      retrievedAt: s.retrievedAt,
      fetchStatus: s.fetchStatus,
      facts: s.facts ?? [],
    })),
    facts: mergeEvidenceBundles(sources),
    pagesChecked: sources.length,
    cacheHits: sources.filter((s) => s.fetchStatus === 'cached').length,
  };
}

module.exports = {
  extractEvidenceFromText,
  mergeEvidenceBundles,
  buildEvidenceBundle,
  FIELD_PATTERNS,
};
