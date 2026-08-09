const { cleanEvidenceSnippet } = require('./evidence-text-utils');
const { extractPushchairEvidence } = require('./pushchair-evidence');
const { extractEnvironmentEvidence } = require('./environment-evidence');

const FIELD_PATTERNS = [
  {
    field: 'toilets',
    yes: [
      /toilet(s)?\s+(are\s+)?available/i,
      /toilet\s+facilities/i,
      /restroom(s)?\s+available/i,
      /public\s+toilets/i,
      /toilets?\s+(can\s+be\s+)?found/i,
      /toilets?\s+(are\s+)?to\s+be\s+found/i,
      /toilets?\s+(are\s+)?(now\s+)?open/i,
      /toilets?\s+(are\s+)?located/i,
      /toilets?\s+(are\s+)?situated/i,
      /toilets?\s+(are\s+)?provided/i,
    ],
    no: [
      /no\s+toilet/i,
      /no\s+public\s+toilets/i,
      /toilets?\s+(are\s+)?closed/i,
      /toilets?\s+currently\s+closed/i,
      /toilets?\s+unavailable/i,
      /toilets?\s+out\s+of\s+service/i,
      /closed\s+public\s+toilets/i,
    ],
  },
  {
    field: 'babyChanging',
    yes: [
      /baby\s+chang(e|ing)/i,
      /nappy\s+chang(e|ing)/i,
      /baby\s+chang(e|ing)\s+facilit/i,
      /changing\s+table\s+for\s+babies/i,
      /parent\s+and\s+baby\s+facilit/i,
    ],
    no: [/no\s+baby\s+chang/i],
  },
  {
    field: 'parking',
    yes: [
      /parking\s+(is\s+)?available/i,
      /(?:free\s+)?parking\s+(is\s+)?provided/i,
      /on.?site\s+parking/i,
      /free\s+parking/i,
      /(?:large\s+)?free\s+car\s+park/i,
      /car\s+park(?:ing)?\s+(is\s+)?available/i,
      /car\s+park\s+(is\s+)?(?:provided|on site|on-site)/i,
      /visitor\s+car\s+park/i,
      /parking\s+spaces\s+(are\s+)?provided/i,
      /(?:cars|vehicles|minibuses|coaches)\s+(?:are\s+)?welcome\s+to\s+use\s+(?:our\s+)?(?:large\s+)?(?:free\s+)?car\s+park/i,
    ],
    no: [
      /no\s+parking/i,
      /no\s+on.?site\s+parking/i,
      /parking\s+is\s+not\s+available/i,
      /(?:do\s+not|don't|does\s+not|doesn't)\s+(?:have|offer|provide)\s+(?:any\s+)?(?:on.?site\s+)?parking/i,
    ],
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
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 15);
}

/** Parking=yes requires explicit availability language — not address, location, or transport context alone. */
function hasExplicitParkingAvailability(sentence) {
  return (
    /parking\s+(is\s+)?available/i.test(sentence) ||
    /(?:free\s+)?parking\s+(is\s+)?provided/i.test(sentence) ||
    /on.?site\s+parking/i.test(sentence) ||
    /free\s+parking/i.test(sentence) ||
    /(?:large\s+)?free\s+car\s+park/i.test(sentence) ||
    /car\s+park(?:ing)?\s+(is\s+)?available/i.test(sentence) ||
    /car\s+park\s+(is\s+)?(?:provided|on site|on-site)/i.test(sentence) ||
    /visitor\s+car\s+park/i.test(sentence) ||
    /parking\s+spaces\s+(are\s+)?provided/i.test(sentence) ||
    /(?:cars|vehicles|minibuses|coaches)\s+(?:are\s+)?welcome\s+to\s+use\s+(?:our\s+)?(?:large\s+)?(?:free\s+)?car\s+park/i.test(
      sentence,
    )
  );
}

function isExplicitParkingStatement(sentence) {
  const lower = sentence.toLowerCase();

  if (!hasExplicitParkingAvailability(sentence)) {
    return false;
  }

  if (/parking\s+(information|charges|fees|rates|policy|restrictions|advice|tips|updates)/i.test(sentence)) {
    if (!/available|provided|free|welcome to use|on site|on-site/i.test(lower)) {
      return false;
    }
  }

  if (/pay\s+and\s+display|parking\s+meters|parking\s+charge/i.test(sentence)) {
    if (!/free\s+parking|parking\s+(is\s+)?available|no charge/i.test(lower)) {
      return false;
    }
  }

  if (/surrounding streets|nearby streets|local streets|off.?site|street parking|near the venue/i.test(sentence)) {
    if (!/on site|on-site|our car park|venue car park|site parking|welcome to use our/i.test(lower)) {
      return false;
    }
  }

  if (
    /\bparking\s+(?:is\s+)?(?:located|can\s+be\s+found)\b/i.test(sentence) &&
    !/\bon.?site\b|\bvisitor\s+car\s+park\b|\bparking\s+(?:is\s+)?available\b|\bparking\s+(?:is\s+)?provided\b/i.test(
      lower,
    )
  ) {
    return false;
  }

  if (
    /\blocated\s+on\s+[A-Za-z0-9\s]+(?:way|road|street|lane|avenue|drive)\b/i.test(sentence) &&
    !hasExplicitParkingAvailability(sentence)
  ) {
    return false;
  }

  return true;
}

/** Closure/unavailability must win over bare "public toilets" substring matches. */
function hasToiletNegation(sentence) {
  return (
    /\bclosed\s+public\s+toilets\b/i.test(sentence) ||
    /\bpublic\s+toilets\s+(?:are\s+)?closed\b/i.test(sentence) ||
    /\bnow\s+closed\s+public\s+toilets\b/i.test(sentence) ||
    /\btoilets?\s+(?:are\s+)?closed\b/i.test(sentence) ||
    /\btoilets?\s+currently\s+closed\b/i.test(sentence) ||
    /\btoilets?\s+unavailable\b/i.test(sentence) ||
    /\btoilets?\s+out\s+of\s+service\b/i.test(sentence) ||
    /\bno\s+public\s+toilets\b/i.test(sentence)
  );
}

/** Generic cloakroom/changing-room wording is not baby changing. */
function isExplicitBabyChangingStatement(sentence) {
  return (
    /baby\s+chang(e|ing)/i.test(sentence) ||
    /nappy\s+chang(e|ing)/i.test(sentence) ||
    /baby\s+chang(e|ing)\s+facilit/i.test(sentence) ||
    /changing\s+table\s+for\s+babies/i.test(sentence) ||
    /parent\s+and\s+baby\s+facilit/i.test(sentence)
  );
}

/** Explicit negation must win over substring matches like "on-site parking" in "do not have on-site parking". */
function hasParkingNegation(sentence) {
  return (
    /\b(?:do\s+not|don't|does\s+not|doesn't)\s+(?:have|offer|provide)\b[^.!?]{0,40}\b(?:any\s+)?(?:on.?site\s+)?parking\b/i.test(
      sentence,
    ) ||
    /\bno\s+on.?site\s+parking\b/i.test(sentence) ||
    /\bparking\s+is\s+not\s+available\b/i.test(sentence) ||
    /\b(?:without|lack\s+of)\s+on.?site\s+parking\b/i.test(sentence)
  );
}

function hasLimitedParking(sentence) {
  return /\blimited\s+(?:on.?site\s+)?parking\b|\bparking\s+(?:is\s+)?limited\b/i.test(sentence);
}

const EVIDENCE_ANCHORS = {
  toilets: /\b(?:public\s+)?toilets?|restrooms?\b/i,
  babyChanging: /\b(?:baby|nappy)\s+chang(?:e|ing)|changing\s+table\s+for\s+babies|parent\s+and\s+baby\s+facilit/i,
  parking: /\bparking|car\s+park\b/i,
  cafe: /\bcaf[eé]|coffee\s+shop|refreshments?\b/i,
  wheelchairAccessible: /\bwheelchair|step.?free|accessible\s+to\s+all\b/i,
  accessibleToilet: /\baccessible\s+toilet|disabled\s+toilet|changing\s+places\b/i,
  playground: /\bplayground|play\s+area\b/i,
  sensoryFriendlySessions: /\bsensory\s+friendly|quiet\s+session|relaxed\s+performance\b/i,
};

function extractEvidenceWindow(sentence, fieldId) {
  const anchor = EVIDENCE_ANCHORS[fieldId];
  const match = anchor?.exec(sentence);
  if (!match) return sentence;
  const start = Math.max(0, match.index - 80);
  const end = Math.min(sentence.length, match.index + match[0].length + 320);
  return sentence.slice(start, end).trim();
}

function matchField(sentence, patterns, fieldId) {
  if (fieldId === 'parking' && hasParkingNegation(sentence)) {
    return { value: 'no', confidence: 'high' };
  }
  if (fieldId === 'parking' && hasLimitedParking(sentence)) {
    return null;
  }
  if (fieldId === 'toilets' && hasToiletNegation(sentence)) {
    return { value: 'no', confidence: 'high' };
  }
  for (const re of patterns.no) {
    if (re.test(sentence)) return { value: 'no', confidence: 'high' };
  }
  for (const re of patterns.yes) {
    if (!re.test(sentence)) continue;
    if (fieldId === 'parking' && hasParkingNegation(sentence)) continue;
    if (fieldId === 'parking' && !isExplicitParkingStatement(sentence)) continue;
    if (fieldId === 'toilets' && hasToiletNegation(sentence)) continue;
    if (fieldId === 'babyChanging' && !isExplicitBabyChangingStatement(sentence)) continue;
    return { value: 'yes', confidence: 'high' };
  }
  return null;
}

function extractEvidenceFromText(text, sourceMeta) {
  const sentences = splitSentences(text);
  const facts = [];

  for (const pattern of FIELD_PATTERNS) {
    for (const sentence of sentences) {
      const match = matchField(sentence, pattern, pattern.field);
      if (!match) continue;
      facts.push({
        field: pattern.field,
        value: match.value,
        confidence: match.confidence,
        evidenceText: cleanEvidenceSnippet(extractEvidenceWindow(sentence, pattern.field)),
        sourceUrl: sourceMeta.url,
        sourceType: sourceMeta.sourceType,
        retrievedAt: sourceMeta.retrievedAt,
      });
      break;
    }
  }

  const pushchairFact = extractPushchairEvidence(text, sourceMeta);
  if (pushchairFact) {
    facts.push(pushchairFact);
  }

  const environmentFact = extractEnvironmentEvidence(text, sourceMeta);
  if (environmentFact) {
    facts.push(environmentFact);
  }

  return facts;
}

function mergeEvidenceBundles(sources) {
  const byField = new Map();
  for (const source of sources) {
    for (const fact of source.facts ?? []) {
      const existing = byField.get(fact.field);
      if (!existing || rankPushchairOrConfidence(fact, existing) > 0) {
        byField.set(fact.field, fact);
      }
    }
  }
  return [...byField.values()];
}

const PUSHCHAIR_RANK = { excellent: 4, good: 3, mixed: 2, difficult: 1, unknown: 0 };
const ENVIRONMENT_RANK = { mixed: 3, indoor: 2, outdoor: 2, unknown: 0 };

function rankPushchairOrConfidence(fact, existing) {
  if (fact.field === 'pushchairSuitability') {
    const factRank = PUSHCHAIR_RANK[fact.value] ?? 0;
    const existingRank = PUSHCHAIR_RANK[existing.value] ?? 0;
    if (factRank !== existingRank) return factRank - existingRank;
  }
  if (fact.field === 'environment') {
    const factRank = ENVIRONMENT_RANK[fact.value] ?? 0;
    const existingRank = ENVIRONMENT_RANK[existing.value] ?? 0;
    if (factRank !== existingRank) return factRank - existingRank;
  }
  return rankConfidence(fact.confidence) - rankConfidence(existing.confidence);
}

function rankConfidence(c) {
  if (c === 'high') return 3;
  if (c === 'medium') return 2;
  if (c === 'low') return 1;
  return 0;
}

function buildEvidenceBundle(venueId, sources, sourceStatus, diagnostics = null) {
  return {
    venueId,
    sourceStatus,
    sources: sources.map((s) => ({
      url: s.url,
      type: s.sourceType,
      sourceType: s.sourceType,
      pageTitle: s.pageTitle ?? null,
      retrievedAt: s.retrievedAt,
      fetchStatus: s.fetchStatus,
      error: s.error ?? null,
      facts: s.facts ?? [],
    })),
    facts: mergeEvidenceBundles(sources),
    pagesChecked: sources.length,
    cacheHits: sources.filter((s) => s.fetchStatus === 'cached').length,
    diagnostics: diagnostics ?? {
      linksDiscovered: [],
      linksSelected: [],
      pagesFetched: [],
      pagesFailed: [],
      evidenceByPage: [],
    },
  };
}

module.exports = {
  extractEvidenceFromText,
  mergeEvidenceBundles,
  buildEvidenceBundle,
  isExplicitParkingStatement,
  hasExplicitParkingAvailability,
  hasParkingNegation,
  hasLimitedParking,
  extractEvidenceWindow,
  hasToiletNegation,
  isExplicitBabyChangingStatement,
  FIELD_PATTERNS,
  cleanEvidenceSnippet,
};
