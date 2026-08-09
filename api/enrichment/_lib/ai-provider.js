/**
 * AI venue enrichment provider — evidence-backed drafts, server-side only.
 */

const { normaliseDraftJson, extractConfidenceJson, parseModelJson } = require('./ai-draft-schema');
const { buildDraftFromEvidence, mergeEvidenceIntoDraft } = require('./evidence-draft-merge');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = Number(process.env.AI_ENRICHMENT_MAX_TOKENS || 1800);
const RETRY_LIMIT = Number(process.env.AI_ENRICHMENT_RETRY_LIMIT || 2);
const AI_TIMEOUT_MS = Number(process.env.AI_ENRICHMENT_TIMEOUT_MS || 25000);
const ESTIMATED_COST_PER_1M_INPUT = 0.15;
const ESTIMATED_COST_PER_1M_OUTPUT = 0.6;

const SYSTEM_PROMPT = `You are a FamilyPilot editorial research assistant structuring venue information for family outing decisions.

CRITICAL RULES:
- Return ONLY valid JSON matching the requested schema. No markdown.
- Use the structured evidence bundle FIRST. Prefer explicit official-source evidence over general knowledge.
- If no evidence supports a factual facility claim, set value to "unknown" and confidence to "unknown".
- NEVER invent toilets, baby changing, parking, accessibility, SEND features, prices, or opening hours.
- For each factual field include sourceUrl, evidence (short quote/paraphrase), sourceType, retrievedAt when evidence exists; null when unknown.
- Editorial fields (whyFamiliesLike, goodToKnow, suggestedVisitDuration) may use category + evidence but must stay cautious. Mark low confidence when estimated.
- Distinguish FACT (from evidence) from EDITORIAL (suggestions). Do not convert editorial into facility facts.
- Never claim verified status.

Field schema includes: value, confidence, reason, sourceUrl, evidence, sourceType, retrievedAt`;

function compactEvidenceBundle(bundle) {
  if (!bundle) return null;
  return {
    sourceStatus: bundle.sourceStatus,
    pagesChecked: bundle.pagesChecked,
    facts: (bundle.facts ?? []).slice(0, 40).map((f) => ({
      field: f.field,
      value: f.value,
      confidence: f.confidence,
      evidenceText: f.evidenceText?.slice(0, 300),
      sourceUrl: f.sourceUrl,
      sourceType: f.sourceType,
    })),
    sources: (bundle.sources ?? []).slice(0, 5).map((s) => ({
      url: s.url,
      type: s.sourceType,
      pageTitle: s.pageTitle,
      fetchStatus: s.fetchStatus,
      factCount: (s.facts ?? []).length,
    })),
  };
}

function buildUserPrompt(input) {
  const compact = {
    name: input.name,
    category: input.category,
    address: input.address ?? null,
    description: input.description ?? null,
    website: input.website ?? null,
    phone: input.phone ?? null,
    openingHours: input.openingHours ?? null,
    googlePrimaryType: input.googlePrimaryType ?? null,
    googleTypes: (input.googleTypes ?? []).slice(0, 12),
    evidence: compactEvidenceBundle(input.evidenceBundle),
    existingMetadataSummary: input.existingMetadata
      ? { hasPriorEnrichment: true, note: 'Context only — do not overwrite blindly.' }
      : null,
  };
  return `Generate a FamilyPilot enrichment DRAFT using ONLY the provider facts and evidence below.\n\n${JSON.stringify(compact)}`;
}

function estimateCost(tokenUsage) {
  const prompt = tokenUsage.promptTokens ?? 0;
  const completion = tokenUsage.completionTokens ?? 0;
  return (
    (prompt / 1_000_000) * ESTIMATED_COST_PER_1M_INPUT +
    (completion / 1_000_000) * ESTIMATED_COST_PER_1M_OUTPUT
  );
}

async function callOpenAI(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.15,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });

      if (response.status === 429) {
        lastError = new Error('AI rate limit exceeded');
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI error ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = parseModelJson(content);
      let draftJson = normaliseDraftJson(parsed);
      draftJson = mergeEvidenceIntoDraft(draftJson, input.evidenceBundle);
      const tokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return {
        draftJson,
        model: data.model || DEFAULT_MODEL,
        sourceContext: {
          inputSummary: { name: input.name, category: input.category },
          evidenceStatus: input.evidenceBundle?.sourceStatus ?? 'no_official_source',
        },
        confidenceJson: extractConfidenceJson(draftJson),
        tokenUsage,
        estimatedCostUsd: estimateCost(tokenUsage),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('AI request failed');
      if (attempt < RETRY_LIMIT) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('AI generation failed');
}

function generateMockDraft(input) {
  const bundle = input.evidenceBundle;
  const evidenceDraft = buildDraftFromEvidence(bundle);

  const draftJson = mergeEvidenceIntoDraft(
    normaliseDraftJson({
      recommendedAge: evidenceDraft.recommendedAge,
      familyFacilities: {
        toilets: evidenceDraft.familyFacilities.toilets,
        babyChanging: evidenceDraft.familyFacilities.babyChanging,
        parking: evidenceDraft.familyFacilities.parking,
        cafe: evidenceDraft.familyFacilities.cafe,
      },
      pushchairSuitability: evidenceDraft.pushchairSuitability,
      terrain: { value: 'unknown', confidence: 'unknown', reason: null, sourceUrl: null, evidence: null },
      environment: evidenceDraft.environment,
      energyLevel: { value: 'unknown', confidence: 'unknown', reason: null, sourceUrl: null, evidence: null },
      accessibility: evidenceDraft.accessibility ?? {},
      sendInfo: evidenceDraft.sendInfo ?? {},
      whyFamiliesLike: input.description ? [`${input.name} — ${input.description.slice(0, 120)}`] : [],
      goodToKnow:
        bundle?.sourceStatus === 'no_official_source'
          ? ['No official evidence found — provider information only.']
          : ['AI draft from official sources — human review required.'],
      suggestedVisitDuration: null,
      rainyDaySuitability: 'unknown',
      overallDraftConfidence: evidenceDraft.overallDraftConfidence,
    }),
    bundle,
  );

  return {
    draftJson,
    model: 'mock-enrichment-v2',
    sourceContext: { mock: true, evidenceStatus: bundle?.sourceStatus },
    confidenceJson: extractConfidenceJson(draftJson),
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    estimatedCostUsd: 0,
  };
}

async function generateDraft(input) {
  if (process.env.OPENAI_API_KEY) return callOpenAI(input);
  if (process.env.AI_ENRICHMENT_ALLOW_MOCK === 'true') return generateMockDraft(input);
  throw new Error(
    'AI enrichment not configured. Set OPENAI_API_KEY or AI_ENRICHMENT_ALLOW_MOCK=true for local testing.',
  );
}

function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.AI_ENRICHMENT_ALLOW_MOCK === 'true');
}

module.exports = {
  generateDraft,
  generateMockDraft,
  isAiConfigured,
  buildUserPrompt,
  compactEvidenceBundle,
  DEFAULT_MODEL,
  AI_TIMEOUT_MS,
  mergeEvidenceIntoDraft,
  buildDraftFromEvidence,
};
