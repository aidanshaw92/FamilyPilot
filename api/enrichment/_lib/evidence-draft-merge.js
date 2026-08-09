/**
 * Apply deterministic official-source evidence to AI draft JSON.
 * Extracted high-confidence facts are authoritative — the LLM cannot override them with unknown.
 */

const { normaliseDraftJson, emptyTriStateField, extractConfidenceJson } = require('./ai-draft-schema');
const { cleanEvidenceSnippet } = require('./evidence-text-utils');

const PUSHCHAIR_VALUES = new Set(['excellent', 'good', 'mixed', 'difficult']);

/** Legacy cache rows may omit confidence — treat extracted yes/no as high when missing. */
function normalizeAuthoritativeFact(fact) {
  if (!fact) return null;
  if (fact.confidence === 'high' || fact.confidence === 'medium' || fact.confidence === 'low') {
    return fact;
  }

  if (fact.field === 'pushchairSuitability' && PUSHCHAIR_VALUES.has(fact.value)) {
    return { ...fact, confidence: 'high' };
  }

  if (fact.value === 'yes' || fact.value === 'no') {
    return { ...fact, confidence: 'high' };
  }

  return fact;
}

function getAuthoritativeFacts(bundle) {
  const rawFacts = bundle?.facts?.length
    ? bundle.facts
    : (bundle?.sources ?? []).flatMap((source) => source.facts ?? []);
  const seen = new Map();
  for (const raw of rawFacts) {
    const fact = normalizeAuthoritativeFact(raw);
    if (!fact || !isAuthoritativeFact(fact)) continue;
    seen.set(fact.field, fact);
  }
  return [...seen.values()];
}

/** Maps evidence extractor field ids → draft JSON paths */
const EVIDENCE_FIELD_MAP = {
  toilets: { section: 'familyFacilities', key: 'toilets', kind: 'triState' },
  babyChanging: { section: 'familyFacilities', key: 'babyChanging', kind: 'triState' },
  parking: { section: 'familyFacilities', key: 'parking', kind: 'triState' },
  cafe: { section: 'familyFacilities', key: 'cafe', kind: 'triState' },
  playground: { section: 'familyFacilities', key: 'playground', kind: 'triState' },
  wheelchairAccessible: { section: 'accessibility', key: 'wheelchairAccessible', kind: 'triState' },
  accessibleToilet: { section: 'accessibility', key: 'accessibleToilet', kind: 'triState' },
  pushchairSuitability: { section: 'pushchairSuitability', key: null, kind: 'pushchair' },
  sensoryFriendlySessions: { section: 'sendInfo', key: 'sensoryFriendlySessions', kind: 'triState' },
};

function factToTriStateField(fact) {
  const value = fact.value === 'yes' || fact.value === 'no' ? fact.value : 'unknown';
  return {
    value,
    confidence: fact.confidence ?? 'high',
    reason: 'Supported by official source evidence.',
    sourceUrl: fact.sourceUrl ?? null,
    evidence: cleanEvidenceSnippet(fact.evidenceText) ?? fact.evidenceText ?? null,
    sourceType: fact.sourceType ?? null,
    retrievedAt: fact.retrievedAt ?? null,
    evidenceBacked: true,
  };
}

function factToPushchairField(fact) {
  let value = 'unknown';
  if (PUSHCHAIR_VALUES.has(fact.value)) value = fact.value;
  else if (fact.value === 'yes') value = 'good';
  else if (fact.value === 'no') value = 'difficult';
  return {
    value,
    confidence: fact.confidence ?? 'high',
    reason: 'Supported by official source evidence.',
    sourceUrl: fact.sourceUrl ?? null,
    evidence: cleanEvidenceSnippet(fact.evidenceText) ?? fact.evidenceText ?? null,
    sourceType: fact.sourceType ?? null,
    retrievedAt: fact.retrievedAt ?? null,
    evidenceBacked: true,
  };
}

function setDraftField(draft, mapping, fieldValue) {
  if (mapping.kind === 'pushchair') {
    draft.pushchairSuitability = fieldValue;
    return;
  }
  if (mapping.section === 'familyFacilities') {
    draft.familyFacilities[mapping.key] = fieldValue;
    return;
  }
  if (mapping.section === 'accessibility') {
    draft.accessibility[mapping.key] = fieldValue;
    return;
  }
  if (mapping.section === 'sendInfo') {
    draft.sendInfo[mapping.key] = fieldValue;
  }
}

function rankConfidence(c) {
  if (c === 'high') return 3;
  if (c === 'medium') return 2;
  if (c === 'low') return 1;
  return 0;
}

function isAuthoritativeFact(fact) {
  const normalized = normalizeAuthoritativeFact(fact);
  if (!normalized || (normalized.confidence !== 'high' && normalized.confidence !== 'medium')) {
    return false;
  }
  if (normalized.field === 'pushchairSuitability') {
    return PUSHCHAIR_VALUES.has(normalized.value);
  }
  return normalized.value === 'yes' || normalized.value === 'no';
}

function buildEmptyDraftShell() {
  return normaliseDraftJson({
    recommendedAge: { min: null, max: null, notes: null, confidence: 'unknown' },
    familyFacilities: {},
    pushchairSuitability: {},
    terrain: {},
    accessibility: {},
    sendInfo: {},
    whyFamiliesLike: [],
    goodToKnow: [],
    suggestedVisitDuration: null,
    rainyDaySuitability: 'unknown',
    overallDraftConfidence: 'unknown',
  });
}

/** Build a draft shell pre-filled from deterministic evidence facts. */
function buildDraftFromEvidence(bundle) {
  const draft = buildEmptyDraftShell();
  const facts = getAuthoritativeFacts(bundle);
  if (!facts.length) return draft;

  for (const fact of facts) {
    const mapping = EVIDENCE_FIELD_MAP[fact.field];
    if (!mapping) continue;
    const fieldValue =
      mapping.kind === 'pushchair' ? factToPushchairField(fact) : factToTriStateField(fact);
    setDraftField(draft, mapping, fieldValue);
  }

  if (facts.length > 0) {
    draft.overallDraftConfidence =
      facts.length >= 3 ? 'medium' : rankConfidence(facts[0]?.confidence) >= 3 ? 'medium' : 'low';
  }

  return draft;
}

/**
 * Merge deterministic evidence into an AI-generated draft.
 * Authoritative extracted facts win over AI unknown or contradictory values.
 * AI-invented facility claims without official evidence are cleared to unknown.
 */
function mergeEvidenceIntoDraft(draftJson, bundle) {
  const draft = normaliseDraftJson(draftJson);
  const authoritativeFacts = getAuthoritativeFacts(bundle);
  const authoritativeFields = new Set(authoritativeFacts.map((f) => f.field));

  let applied = 0;

  for (const fact of authoritativeFacts) {
    const mapping = EVIDENCE_FIELD_MAP[fact.field];
    if (!mapping) continue;

    const evidenceField =
      mapping.kind === 'pushchair' ? factToPushchairField(fact) : factToTriStateField(fact);

    // Authoritative official-source facts always win over AI output.
    setDraftField(draft, mapping, evidenceField);
    applied += 1;
  }

  for (const [fieldId, mapping] of Object.entries(EVIDENCE_FIELD_MAP)) {
    if (authoritativeFields.has(fieldId)) continue;

    if (mapping.kind === 'pushchair') {
      const current = draft.pushchairSuitability;
      if (current?.value !== 'unknown' && !current?.evidenceBacked) {
        draft.pushchairSuitability = {
          value: 'unknown',
          confidence: 'unknown',
          reason: 'No explicit official evidence found.',
          sourceUrl: null,
          evidence: null,
          sourceType: null,
          retrievedAt: null,
        };
      }
      continue;
    }

    let current;
    if (mapping.section === 'familyFacilities') {
      current = draft.familyFacilities[mapping.key];
    } else if (mapping.section === 'accessibility') {
      current = draft.accessibility[mapping.key];
    } else if (mapping.section === 'sendInfo') {
      current = draft.sendInfo[mapping.key];
    }

    if (current?.value !== 'unknown' && !current?.evidenceBacked) {
      setDraftField(draft, mapping, emptyTriStateField());
    }
  }

  if (applied > 0 && draft.overallDraftConfidence === 'unknown') {
    draft.overallDraftConfidence = applied >= 3 ? 'medium' : 'low';
  }

  return draft;
}

module.exports = {
  buildDraftFromEvidence,
  mergeEvidenceIntoDraft,
  factToTriStateField,
  EVIDENCE_FIELD_MAP,
  isAuthoritativeFact,
  normalizeAuthoritativeFact,
  getAuthoritativeFacts,
};
