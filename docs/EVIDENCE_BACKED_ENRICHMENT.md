# Evidence-Backed AI Venue Enrichment

**Last updated:** 8 August 2026  
**Status:** Internal editorial workflow (human review required)

---

## Purpose

Give AI **trustworthy official-source evidence** before drafting family metadata. AI saves editorial time but **must not guess** or weaken the trust model.

The pipeline answers:

> **What evidence supports this family-specific claim?**

If it cannot answer that question, **the field stays unknown**.

---

## Flow

```text
Google place (provider_only)
        ↓
Google Place details (on-demand — website, description)
        ↓
Official source discovery (provider website preferred)
        ↓
Safe server-side fetch (max 5 pages, SSRF-protected)
        ↓
Keyword evidence extraction → venue_source_evidence
        ↓
AI structured draft (evidence + provider facts)
        ↓
Human review (/internal/enrichment/[id])
        ↓
Approve → enriched (NOT verified)
        ↓
Separate verification rules → verified
```

---

## Source priority

1. Official venue website (Google `websiteUri` / place record)
2. Official local authority / council website *(future — not auto-guessed)*
3. Linked accessibility / visitor / FAQ / family pages (same domain, max depth 1)
4. Google provider facts (description only — not authoritative for facilities)
5. Other clearly authoritative public sources *(manual only in this phase)*

**Not used:** blogs, review sites, forums, Reddit, social posts, generic search crawling.

---

## Evidence rules

| Confidence | Meaning |
|------------|---------|
| `high` | Official source explicitly states the fact |
| `medium` | Official evidence strongly implies (use sparingly) |
| `low` | Indirect clue only — usually stays `unknown` in trusted metadata |
| `unknown` | No supporting evidence |

**No hallucination:** absence of evidence → `unknown`, never a positive claim.

---

## Storage separation

| Layer | Table / location | Trust |
|-------|------------------|-------|
| Provider facts | `place_records` | Provider-sourced |
| Source evidence | `venue_source_evidence` | Research only — not consumer metadata |
| AI drafts | `venue_enrichment_drafts` | Untrusted until approved |
| Trusted metadata | `venue_family_metadata` | Human-approved enriched / verified |

Draft records include `evidence_status`:

- `evidence_backed` — official sources fetched
- `provider_only` — no official website; provider facts only
- `legacy_no_sources` — pre-evidence drafts (still reviewable)

---

## Fetch security (SSRF)

Server-side fetcher (`api/enrichment/_lib/source-fetcher.js`):

- Blocks localhost, private IPs, link-local, metadata hosts
- DNS resolution check before fetch
- Re-validates hostname after redirects (max 3)
- Timeout (default 10s), max response size (512 KB)
- HTML only; rejects binary
- No user-provided arbitrary URLs without validation

Env vars: `SOURCE_FETCH_TIMEOUT_MS`, `SOURCE_FETCH_MAX_BYTES`, `SOURCE_MAX_PAGES`.

---

## Caching

Evidence pages cached **14 days** by default (`SOURCE_EVIDENCE_CACHE_DAYS`).

Cache key: `familypilot_place_id` + `source_url`. Does not refetch on every draft generation.

---

## AI behaviour

- Model: `gpt-4o-mini` (or mock when `AI_ENRICHMENT_ALLOW_MOCK=true`)
- Input: compact provider facts + structured evidence bundle (< ~10k chars source text)
- Output: per-field `value`, `confidence`, `reason`, `sourceUrl`, `evidence`, `sourceType`, `retrievedAt`
- Editorial fields (`whyFamiliesLike`, `goodToKnow`, visit duration) labelled as suggestions — never facility facts

---

## Review UX

`/internal/enrichment/[id]` shows:

- Evidence status badge (evidence-backed / provider-only / legacy)
- **Sources checked** panel
- Per-field proposed value, confidence, evidence snippet, source link
- Approve / reject — approval retains field evidence in `enrichmentProvenance.sourceReference`

---

## Batch generation (504 fix)

**Option A — client-controlled batch:**

```text
Generate drafts (10)
  → client selects provider_only venues from queue
  → calls generate-draft per venue (concurrency 2)
  → progress UI: 3/10 complete, ✓/✗ per venue
  → each successful draft persisted immediately
```

Server `generate-batch` remains for compatibility but internal UI uses client batch to avoid Vercel 30s timeout.

---

## Cost controls

Tracked per draft:

- Source fetch count / cache hits
- AI input/output tokens
- Estimated USD cost

Target: < 10k useful source characters per venue; max 5 pages.

**Estimated cost per 100 venues (evidence + AI):** ~$0.50–$2.00 depending on cache hit rate and page count.

**Estimated human review per 100 venues:** ~30–90 minutes (20–60 seconds per draft with evidence vs several minutes without).

---

## Consumer safety

Unchanged:

- `provider_only` and `ai_draft` → capped Family Match, no trusted facilities
- Evidence collection does not change consumer recommendation confidence
- Approval → `enriched` only; verification is separate

---

## Limitations

- No generic web search — requires provider website or manual URL
- Keyword extraction misses nuanced phrasing
- Some council/operator sites block automated fetch
- Opening hours / pricing freshness not optimised per-field yet
- Regeneration of enriched/verified venues requires explicit `regenerate` flag

---

## Key files

| Component | Path |
|-----------|------|
| Migration | `familypilot/supabase/migrations/006_venue_source_evidence.sql` |
| Evidence pipeline | `api/enrichment/_lib/evidence-pipeline.js` |
| Source fetch + SSRF | `api/enrichment/_lib/source-fetcher.js`, `source-fetch-security.js` |
| Evidence extraction | `api/enrichment/_lib/evidence-extractor.js` |
| AI provider | `api/enrichment/_lib/ai-provider.js` |
| Draft lifecycle | `api/enrichment/_lib/draft-store.js` |
| Client batch | `familypilot/src/services/enrichment/enrichment-api-client.ts` |
| Review UI | `familypilot/app/internal/enrichment/[id].tsx` |
| Tests | `familypilot/src/__tests__/evidence-enrichment.test.ts` |

---

## Readiness to scale

**Ready for controlled internal beta enrichment** with human review at current volume (10–50 venues/day).

Before scaling to hundreds:

- Monitor fetch failure rates and blocked sites
- Tune keyword patterns from editor feedback
- Consider council-domain allowlist for Hertfordshire beta
- Keep client batch concurrency at 2–3 to respect OpenAI and fetch limits
