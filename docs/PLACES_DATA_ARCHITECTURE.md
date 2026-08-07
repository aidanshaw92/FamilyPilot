# Places Data Architecture

**Last updated:** 7 August 2026  
**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Provenance reference:** [DATA_PROVENANCE.md](./DATA_PROVENANCE.md)

---

## Purpose

Replace the monolithic mock venue layer with a **provider-agnostic live-data architecture** while keeping the existing UI and service contracts unchanged. Mock data remains as a **reliable fallback** until live providers are production-ready.

---

## Core principle: two layers of truth

| Layer | Owner | Examples |
|-------|-------|----------|
| **External place record** | Map provider (Google, OSM) | Name, coordinates, hours, phone, website, photos |
| **Family metadata** | FamilyPilot database | Age suitability, terrain, facilities, SEND, accessibility, family notes, Family Match inputs |

External place IDs (`google:ChIJ…`, `osm:node/123`) are **never** used as FamilyPilot route IDs. Canonical IDs (`venue-1`, `fp-osm-…`) are stable across provider changes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI (unchanged) — Venue / Explore / Home hooks              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  venueService (api/index.ts)                                │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  PlacesRepository (client)                                  │
│  • Calls /api/places/*                                      │
│  • Client cache (memory + AsyncStorage)                     │
│  • Falls back to MockPlacesProvider on error                │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
     ┌──────────▼──────────┐       ┌──────────▼──────────┐
     │  /api/places/search │       │  MockPlacesProvider │
     │  /api/places/detail │       │  (client fallback)  │
     └──────────┬──────────┘       └─────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  places-service (server) — cache + fallback                   │
│  PlacesProvider factory: mock | osm (Overpass) | google     │
└───────────────┬─────────────────────────────────────────────┘
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
   mock       Overpass    Google (stub)
```

**API keys:** `GOOGLE_PLACES_API_KEY` and `PLACES_PROVIDER` are **server-only** env vars. The client uses `EXPO_PUBLIC_PLACES_API_URL` (optional) pointing at `/api/places`.

---

## PlacesProvider interface

`familypilot/src/services/providers/places-provider.ts`

```typescript
interface PlacesProvider {
  name: 'mock' | 'google' | 'osm';
  searchNearby(params): Promise<ExternalPlaceRecord[]>;
  getPlace(familypilotId): Promise<ExternalPlaceRecord | null>;
  getPlaceByExternalId(externalId): Promise<ExternalPlaceRecord | null>;
}
```

Implementations:
- `src/services/providers/mock-places-provider.ts` — wraps existing mock venues
- `server/places/overpass-places-provider.ts` — OpenStreetMap via Overpass API
- `server/places/google-places-provider.ts` — stub (requires server key)

---

## Caching

| Layer | TTL | Storage |
|-------|-----|---------|
| Server | 15 min | In-memory Map |
| Client search | 10 min | Memory + AsyncStorage |
| Client detail | 30 min | Memory + AsyncStorage |

Response includes `cached`, `fetchedAt`, `fallbackUsed`, `fallbackReason`.

---

## Fallback strategy

1. Try configured provider (`PLACES_PROVIDER`, default `mock`)
2. On failure → server falls back to `MockPlacesProvider`
3. If `/api/places` unreachable → client uses `MockPlacesProvider` directly
4. Mock data is **never removed** — always available as last resort

---

## Database (Supabase migration 002)

- `place_records` — cached provider facts + provenance JSONB
- `venue_family_metadata` — FamilyPilot editorial fields keyed by `familypilot_place_id`

Runtime DB writes deferred until Supabase service role is wired; schema is ready.

---

## Configuration

| Variable | Where | Purpose |
|----------|-------|---------|
| `PLACES_PROVIDER` | Server | `mock` (default), `osm`, `google` — set to `osm` in `vercel.json` for production |
| `GOOGLE_PLACES_API_KEY` | Server | Google Places (never client) |
| `EXPO_PUBLIC_PLACES_API_URL` | Client | API base, default `/api/places` |

---

## Key files

| File | Role |
|------|------|
| `src/types/places.ts` | External + metadata types, provenance |
| `src/data/family-place-metadata.ts` | FamilyPilot seed metadata |
| `src/services/places/places-repository.ts` | Client orchestration + fallback |
| `src/services/places/merge-place.ts` | Merge external + metadata → Venue |
| `server/places/places-service.ts` | Server cache + fallback |
| `api/places/search.ts` | Vercel search endpoint |
| `api/places/detail.ts` | Vercel detail endpoint |
| `supabase/migrations/002_place_records_and_metadata.sql` | DB schema |

---

## UI impact

**None.** `venueService`, hooks, and screens consume the same `Venue` / `VenueDetail` types. Family Match personalisation runs after merge as before.
