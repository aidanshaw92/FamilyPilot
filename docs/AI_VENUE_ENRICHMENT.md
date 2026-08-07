# AI-Assisted Venue Enrichment

**Last updated:** 7 August 2026  
**Status:** Internal editorial workflow (human review required)

---

## Purpose

Reduce manual venue enrichment time from several minutes to **20–60 seconds of human review** by generating structured **AI drafts** that editors approve, edit, or reject before any data affects FamilyPilot recommendations.

AI helps research and structure information. AI **must not invent family facts**.

---

## Workflow

```text
Google Place (provider_only)
        ↓
Generate AI draft (stored separately)
        ↓
Human review in /internal/enrichment
        ↓
Approve / Edit & approve / Reject
        ↓
enriched (trusted metadata)
        ↓
Optional manual verification → verified
```

---

## Enrichment states

| Status | Meaning |
|--------|---------|
| `provider_only` | Google/provider facts only |
| `ai_draft` | AI proposed metadata; **not trusted**; consumer behaves as `provider_only` |
| `enriched` | Human-reviewed family metadata |
| `verified` | Core fields checked against sources per verification rules |

AI drafts **never** auto-become `enriched` or `verified`.

---

## Architecture

| Layer | Location |
|-------|----------|
| Draft storage | `venue_enrichment_drafts` table (Supabase) or `.data/enrichment-drafts.json` (file fallback) |
| Status marker | `venue_family_metadata.enrichment_status = 'ai_draft'` (no family fields until approval) |
| AI provider | `api/enrichment/_lib/ai-provider.js` (OpenAI; mock when `AI_ENRICHMENT_ALLOW_MOCK=true`) |
| Schema validation | `api/enrichment/_lib/ai-draft-schema.js` |
| Draft lifecycle | `api/enrichment/_lib/draft-store.js` |
| API actions | `generate-draft`, `generate-batch`, `draft`, `approve-draft`, `reject-draft` |
| TypeScript types | `familypilot/src/types/ai-enrichment.ts` |
| Draft → save mapper | `familypilot/server/enrichment/ai-draft-mapper.ts` |

### Provider interface

```ts
interface VenueEnrichmentAIProvider {
  generateDraft(input: VenueEnrichmentInput): Promise<VenueEnrichmentDraftResult>;
}
```

Implementation is decoupled via `ai-provider.js`; swap models via `OPENAI_MODEL` env var.

---

## Draft schema

Structured JSON with per-field confidence (`high` | `medium` | `low` | `unknown`):

- `recommendedAge` (min/max/notes)
- `familyFacilities` (toilets, babyChanging, parking, cafe)
- `pushchairSuitability`, `terrain`
- `accessibility`, `sendInfo` (empty unless evidence in input)
- Editorial: `whyFamiliesLike`, `goodToKnow`, `suggestedVisitDuration`, `rainyDaySuitability`
- `overallDraftConfidence`

Unknown remains unknown — no guessing toilets from venue type.

---

## Confidence rules

Confidence = strength of **evidence in the input**, not Family Match.

- **High:** explicit statement in provider/official source
- **Medium:** strong indirect evidence in input
- **Low:** cautious inference from category + limited facts (editorial only)
- **Unknown:** no usable evidence

---

## API (admin auth required)

All generation endpoints require `X-Enrichment-Token`.

| Action | Method | Description |
|--------|--------|-------------|
| `generate-draft` | POST | `{ id, regenerate? }` — one venue |
| `generate-batch` | POST | `{ batchSize?, betaLat?, betaLng?, betaRadiusKm? }` — default 10, max 25 |
| `draft` | GET | Pending draft for venue |
| `approve-draft` | POST | `{ id, payload?, reviewedBy? }` → `enriched` |
| `reject-draft` | POST | Discard draft → `provider_only` |

`config` returns `aiConfigured: true` when `OPENAI_API_KEY` or mock mode is set.

---

## Cost controls

- Compact structured prompts (name, category, address, types, description only)
- Max batch: **25** venues (default **10**)
- `AI_ENRICHMENT_MAX_TOKENS` (default 1800)
- Retry limit: 2
- Token usage + estimated USD returned per batch
- No automatic scheduled generation (architecture-ready only)

**Estimated cost (gpt-4o-mini):** ~$0.02–0.06 per venue → **~$2–6 per 100 venues** (varies by input size).

**Estimated editor time:** ~30–45 s review × 100 venues ≈ **50–75 minutes** vs several hours fully manual.

---

## Provenance on approval

Approved metadata records:

```json
{
  "origin": "ai_assisted",
  "model": "gpt-4o-mini",
  "humanReviewed": true,
  "approvedBy": "enrichment-editor",
  "approvedAt": "2026-08-07T…",
  "sourceContext": { … }
}
```

Stored in `enrichmentProvenance.sourceReference` with `sourceType: ai_assisted`.

---

## Consumer behaviour

**Unchanged UI.** `ai_draft` venues behave exactly like `provider_only`:

- Potential match
- Family Match capped at 65
- No child-specific claims
- Draft JSON never merged into consumer views

---

## Security

- Model API keys server-side only (`OPENAI_API_KEY`)
- No public generation endpoints
- Malformed AI JSON rejected before storage
- Enriched/verified metadata never overwritten by generation (regenerate requires explicit flag)

---

## Failure handling

- AI timeout / rate limit: retry then fail single venue; batch continues
- Malformed JSON: rejected, no partial metadata
- Supabase failure: surfaces error; no half-approved state
- Batch reports per-venue success/failure + aggregate cost

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI credentials |
| `OPENAI_MODEL` | Model id (default `gpt-4o-mini`) |
| `AI_ENRICHMENT_ALLOW_MOCK=true` | Local/test mock provider |
| `AI_ENRICHMENT_MAX_TOKENS` | Output token cap |
| `ENRICHMENT_ADMIN_TOKEN` | Internal API auth |

---

## Future automation (not enabled)

Prepared pattern for nightly: find high-priority `provider_only` in beta radius → generate up to 25 drafts → await human review.

---

## Related docs

- [VENUE_ENRICHMENT_WORKFLOW.md](./VENUE_ENRICHMENT_WORKFLOW.md)
- [DATA_PROVENANCE.md](./DATA_PROVENANCE.md)
- [FAMILY_MATCH.md](./FAMILY_MATCH.md)
