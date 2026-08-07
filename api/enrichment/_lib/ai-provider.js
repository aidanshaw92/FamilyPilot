/**
 * AI venue enrichment provider — server-side only.
 * Uses OpenAI when OPENAI_API_KEY is set; mock provider for tests/local without key.
 */

const { normaliseDraftJson, extractConfidenceJson, parseModelJson } = require('./ai-draft-schema');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = Number(process.env.AI_ENRICHMENT_MAX_TOKENS || 1800);
const RETRY_LIMIT = Number(process.env.AI_ENRICHMENT_RETRY_LIMIT || 2);
const ESTIMATED_COST_PER_1M_INPUT = 0.15;
const ESTIMATED_COST_PER_1M_OUTPUT = 0.6;

const SYSTEM_PROMPT = `You are a FamilyPilot editorial research assistant. Your job is to structure venue information for family outing decisions.

CRITICAL RULES:
- Return ONLY valid JSON matching the requested schema. No markdown, no commentary.
- Do NOT invent factual facilities (toilets, baby changing, parking, accessibility, SEND features, prices, opening hours).
- If evidence is missing in the input, set value to "unknown" and confidence to "unknown".
- Confidence reflects evidence strength in the provided input — NOT your general knowledge about venue types.
- You MAY draft softer editorial content (whyFamiliesLike, goodToKnow) when clearly labelled as suggestions based on category and provided facts — keep these practical and cautious.
- suggestedVisitDuration must be null unless reasonably inferable from category; if provided, treat as estimated.
- Never claim verification or official confirmation.

Schema:
{
  "recommendedAge": { "min": number|null, "max": number|null, "notes": string|null, "confidence": "high|medium|low|unknown" },
  "familyFacilities": {
    "toilets": { "value": "yes|no|unknown", "confidence": "high|medium|low|unknown", "reason": string|null },
    "babyChanging": { "value": "yes|no|unknown", "confidence": "high|medium|low|unknown", "reason": string|null },
    "parking": { "value": "yes|no|unknown", "confidence": "high|medium|low|unknown", "reason": string|null },
    "cafe": { "value": "yes|no|unknown", "confidence": "high|medium|low|unknown", "reason": string|null }
  },
  "pushchairSuitability": { "value": "excellent|good|mixed|difficult|unknown", "confidence": "high|medium|low|unknown", "reason": string|null },
  "terrain": { "value": "flat|mostly_flat|mixed|hilly|very_hilly|unknown", "confidence": "high|medium|low|unknown", "reason": string|null },
  "accessibility": {},
  "sendInfo": {},
  "whyFamiliesLike": string[],
  "goodToKnow": string[],
  "suggestedVisitDuration": number|null,
  "rainyDaySuitability": "yes|no|unknown",
  "overallDraftConfidence": "high|medium|low|unknown"
}`;

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
    existingMetadataSummary: input.existingMetadata
      ? {
          hasPriorEnrichment: true,
          note: 'Existing metadata provided for context only — do not overwrite blindly; prefer unknown when unclear.',
        }
      : null,
  };
  return `Generate a FamilyPilot enrichment DRAFT for this venue. Use only the facts below.\n\n${JSON.stringify(compact)}`;
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
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(45000),
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
      const draftJson = normaliseDraftJson(parsed);
      const tokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return {
        draftJson,
        model: data.model || DEFAULT_MODEL,
        sourceContext: {
          inputSummary: {
            name: input.name,
            category: input.category,
            googlePrimaryType: input.googlePrimaryType,
          },
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

/** Deterministic mock for tests and local dev without API key. */
function generateMockDraft(input) {
  const category = input.category || 'park';
  const draftJson = normaliseDraftJson({
    recommendedAge: {
      min: null,
      max: null,
      notes: category === 'zoo' ? 'Often popular with primary-age children — confirm on site.' : null,
      confidence: 'low',
    },
    familyFacilities: {
      toilets: { value: 'unknown', confidence: 'unknown', reason: null },
      babyChanging: { value: 'unknown', confidence: 'unknown', reason: null },
      parking: { value: 'unknown', confidence: 'unknown', reason: null },
      cafe: { value: 'unknown', confidence: 'unknown', reason: null },
    },
    pushchairSuitability: { value: 'unknown', confidence: 'unknown', reason: null },
    terrain: { value: 'unknown', confidence: 'unknown', reason: null },
    accessibility: {},
    sendInfo: {},
    whyFamiliesLike: input.description
      ? [`${input.name} may appeal to families based on available provider description.`]
      : [`${input.name} is a ${category} — family appeal depends on on-site facilities.`],
    goodToKnow: ['AI draft — human review required before publishing.'],
    suggestedVisitDuration: null,
    rainyDaySuitability: ['museum', 'soft_play', 'activity'].includes(category) ? 'yes' : 'unknown',
    overallDraftConfidence: 'low',
  });

  return {
    draftJson,
    model: 'mock-enrichment-v1',
    sourceContext: { mock: true, category },
    confidenceJson: extractConfidenceJson(draftJson),
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    estimatedCostUsd: 0,
  };
}

async function generateDraft(input) {
  if (process.env.OPENAI_API_KEY) {
    return callOpenAI(input);
  }
  if (process.env.AI_ENRICHMENT_ALLOW_MOCK === 'true') {
    return generateMockDraft(input);
  }
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
  DEFAULT_MODEL,
  ESTIMATED_COST_PER_1M_INPUT,
  ESTIMATED_COST_PER_1M_OUTPUT,
};
