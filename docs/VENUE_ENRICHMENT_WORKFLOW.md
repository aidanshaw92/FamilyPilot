# Venue Enrichment Workflow

**Date:** 7 August 2026  
**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) · [LIVE_GOOGLE_QUALITY_PASS.md](./LIVE_GOOGLE_QUALITY_PASS.md)

---

## Purpose

Google tells FamilyPilot *what places exist*. Enrichment lets FamilyPilot answer *what it is actually like for a family* — with honest provenance and state transitions from `provider_only` → `enriched` → `verified`.

This is an **internal productivity tool**, not a public CMS.

---

## State model

| State | Meaning |
|-------|---------|
| `provider_only` | Provider facts only — default for live Google venues |
| `enriched` | FamilyPilot family metadata added; not all core fields recently verified |
| `verified` | Core family attributes checked against reliable source within freshness window |

State is stored on `venue_family_metadata.enrichment_status` and derived in app code when absent.

### Verification requirements

All must be set (value may be `unknown` where tri-state):

- Category confirmed
- Age suitability **or** explicit age notes
- Toilets, baby changing, parking
- Pushchair suitability
- Terrain
- Provenance (source type + checked date)
- Last checked within **365 days**

Verified means **data quality**, not high Family Match. Scoring still depends on family profile.

---

## Two-layer model (preserved)

| Layer | Table | Owner |
|-------|-------|-------|
| External facts | `place_records` | Google/OSM sync |
| Family metadata | `venue_family_metadata` | FamilyPilot editorial |

Provider sync **never** overwrites `venue_family_metadata`.

---

## Database

Migration: `familypilot/supabase/migrations/003_venue_enrichment_workflow.sql`

Key columns added:

- `enrichment_status`, `family_facilities` (JSONB tri-state map)
- `pushchair_suitability`, `extended_terrain`, `path_surface`
- `accessibility`, `send_info` (JSONB)
- `why_families_like`, `enrichment_provenance`
- `last_checked`, `checked_by`, `beta_priority`, `category_confirmed`

---

## Internal routes

| Route | Purpose |
|-------|---------|
| `/internal/enrichment` | Queue, stats, beta-area sync |
| `/internal/enrichment/[id]` | Edit form |

**Not linked from consumer navigation.** Direct URL only.

### Protection

- Server env: `ENRICHMENT_ADMIN_TOKEN`
- Client stores token in `sessionStorage` after manual entry
- All write/list endpoints require `Authorization: Bearer <token>`

**Limitations:** Shared secret, not RBAC. Anyone with the token and URL can edit. Suitable for closed beta only. Replace with proper auth before wider team access.

---

## API endpoints

| Endpoint | Method | Auth |
|----------|--------|------|
| `/api/enrichment/config` | GET | Public (no secrets) |
| `/api/enrichment/queue` | GET | Token |
| `/api/enrichment/stats` | GET | Token |
| `/api/enrichment/sync` | POST | Token |
| `/api/enrichment/venue?id=` | GET/PUT | Token |
| `/api/enrichment/export` | GET | Token (CSV) |

Writes use `SUPABASE_SERVICE_ROLE_KEY` server-side only.

Local dev fallback: `.data/enrichment-store.json` when Supabase not configured (not for production).

---

## Provenance

Each save requires `enrichmentProvenance`:

- `sourceType`: official_website, venue_contact, google_provider, family_pilot_editorial, community_report, local_authority, other
- `checkedDate`, optional `sourceReference`, `checkedBy`, `evidenceNotes`

---

## Freshness guidance

| Stability | Examples | Suggested re-check |
|-----------|----------|-------------------|
| Highly changeable | Opening hours, café availability | ~90 days |
| Moderate | Toilets, baby changing, parking | ~180 days |
| Stable | Terrain, step-free access | ~365 days |

Verified status expires to enriched if `last_checked` > 365 days.

---

## Family Match behaviour

| State | Family Match |
|-------|--------------|
| `provider_only` | Potential match, cap 65, no child-name copy |
| `enriched` | Normal scoring; unknown fields excluded from claims |
| `verified` | Normal scoring; trust copy “Family details checked recently” |

---

## Beta region strategy

Default queue centre: **Bushey** (51.643, -0.360, 15 km radius).

Workflow:

1. Open `/internal/enrichment`
2. Enter admin token
3. **Sync Google places** for beta area
4. Filter **Needs review**
5. Edit venue → Save as enriched
6. Complete verification fields → Save as verified

---

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ENRICHMENT_ADMIN_TOKEN` | Server | Internal API auth |
| `SUPABASE_URL` | Server | Metadata persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Writes (never client) |
| `GOOGLE_PLACES_API_KEY` | Server | Sync live venues |

---

## CSV export

Columns: FamilyPilot ID, Google ID, name, category, enrichment status, last checked, source type.

---

## Limitations

- No bulk CSV import
- No role-based admin users
- File store fallback not durable on Vercel serverless
- Search metadata join is best-effort per request
- No automatic scraping or AI-generated facts

---

## Enriching 100 venues (workflow estimate)

Assuming ~3–5 minutes per venue for core fields (more for verified):

1. Sync beta regions (5 min)
2. Enrich core facilities + ages + terrain (~4 min × 100 ≈ 6–7 hours)
3. Verify subset with provenance (~2 extra min × 40 ≈ 2 hours)

One editor can complete **50–100 enriched** venues in a focused beta week; verified subset smaller.

---

## Recommendation

**Ready for real editorial use** once `ENRICHMENT_ADMIN_TOKEN`, Supabase, and migration 003 are configured in production. Start with Bushey beta area, enrich top Explore results first, then expand regions.
