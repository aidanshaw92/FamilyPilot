# FamilyPilot — Data Provenance

**Last updated:** 7 August 2026  
**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)

Every field shown to parents must have a traceable source. This document defines provenance for venue and restaurant data.

---

## Source types

| Source | Meaning | Trust label |
|--------|---------|-------------|
| `google` | Google Places API | Opening hours from provider |
| `osm` | OpenStreetMap via Overpass | OpenStreetMap |
| `mock` | Development mock layer | Development mock |
| `familypilot` | FamilyPilot editorial / curation | FamilyPilot editorial |
| `estimated` | Modelled or inferred | Estimated |
| `community` | Parent-submitted tips (future) | Community observation |

---

## External place fields (provider layer)

| Field | Primary source | Fallback | Notes |
|-------|----------------|----------|-------|
| `name` | Provider | Mock | Never invent names |
| `latitude` / `longitude` | Provider | Mock | Required for distance |
| `category` | Provider tags → mapped | Mock | OSM tag mapping |
| `address` | Provider | — | May be incomplete on OSM |
| `description` | Provider | — | Often absent on OSM |
| `openingHours` | Provider | Estimated | Never claim exact without provider |
| `website` | Provider | — | |
| `phone` | Provider | — | |
| `photos` | Provider / Wikimedia | Placeholder | Mock uses Unsplash |
| `isOpen` | Provider (future) | — | Not computed client-side yet |

Each field carries `FieldProvenance`: `{ source, updatedAt, reliability, label? }`.

---

## FamilyPilot metadata fields (our database)

| Field | Source | Notes |
|-------|--------|-------|
| `bestAges` | familypilot | Editorial |
| `terrain` | familypilot | Editorial |
| `facilities` | familypilot | Confirmed / not confirmed |
| `parkingInfo` | familypilot | May cite provider parking tag later |
| `visitDurationMinutes` | familypilot | Estimated visit length |
| `goodToKnow` / `warnings` | familypilot | Editorial cautions |
| `communityTips` | community | Future moderated |
| `estimatedSpend` | estimated | Never exact pricing |
| `pushchairAccess` | familypilot | Tri-state |
| `babyChanging` | familypilot | Tri-state |
| `accessibilityNotes` | familypilot | Factual only |
| `sendNotes` | familypilot | Factual session info only |
| `familyNotes` | familypilot | Editorial |
| `familyScore` | familypilot | Computed client-side from profile + metadata |
| `enrichmentStatus` | derived | `provider_only` (live Google default), `enriched`, `verified` |

**Provider-only rule (Aug 2026):** Live Google venues without `VenueFamilyMetadata` must remain `provider_only`. Family Match capped at 65 with "Potential match" copy. Never synthesise facilities or age suitability. See [LIVE_GOOGLE_QUALITY_PASS.md](./LIVE_GOOGLE_QUALITY_PASS.md).

---

## Enrichment status

| Status | When | UI |
|--------|------|-----|
| `provider_only` | Provider facts only | "Family suitability not yet reviewed" |
| `enriched` | FamilyPilot metadata present | Normal Family Match |
| `verified` | Core fields with editorial provenance | Normal Family Match |

**Never overwrite** FamilyPilot metadata during provider sync.

---

## Family Match factors

| Factor | Inputs | Source |
|--------|--------|--------|
| ageSuitability | bestAges, facilities | familypilot |
| accessibility | stepFreeAccess, accessibleToilet | familypilot |
| distance | coordinates | provider + computed |
| budgetFit | estimatedSpend, profile | estimated + profile |
| facilitiesMatch | facilities | familypilot |
| weatherFit | weather service | mock (future: live) |

---

## Labels shown in UI

Mapped via `TrustMetadata` and `DataTrustBadge`:
- "Opening hours from provider"
- "Estimated family spend"
- "Facilities last checked X days ago"
- "Venue information" (generic provider)
- "Family suitability not yet reviewed" (provider-only live venues)
- "Live place data · family details still being verified" (venue detail)
- "Development mock layer" (mock only, dev/beta)

---

## Rules

1. Do not claim **guaranteed**, **allergy safe**, or **definitely available** without verified evidence.
2. Unknown facility data → `not_confirmed`, never `false`.
3. Provider sync updates `place_records` only — not `venue_family_metadata`.
4. `fetchedAt` / `updatedAt` must be stored for cache transparency.

See [PLACES_DATA_ARCHITECTURE.md](./PLACES_DATA_ARCHITECTURE.md) for implementation paths.
