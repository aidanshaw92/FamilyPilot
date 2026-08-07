# Live Google Places Quality Pass

**Date:** 7 August 2026  
**Status:** Complete  
**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) · [MVP_SCOPE.md](./MVP_SCOPE.md)

---

## Purpose

Google Places is live in production (`PLACES_PROVIDER=google`). This pass improves **relevance, trust, and confidence** of general Explore results without new features, architecture changes, or UI redesign.

> Google answers: *What places exist?*  
> FamilyPilot answers: *Which are worth considering for this family, and how confident are we?*

---

## Audit baseline (pre-pass)

Six UK locations × top 20 Google results (120 total) were audited with the legacy configuration:

| Setting | Legacy value |
|---------|--------------|
| `includedTypes` | `park`, `museum`, `restaurant`, `cafe`, `zoo` (mixed food + activity) |
| Unknown type mapping | Default → `park` |
| Exclusions | None |
| Chain handling | None |
| Family metadata | Synthesised defaults for unknown venues |
| Family Match | Full personalised scores from category + distance only |

**Typical failures observed:**

- Hotels, supermarkets, cinemas in general Explore
- Restaurants/cafés dominating activity feed
- Unknown types silently mapped to `park` (e.g. Vue Cinema → park, Marks & Spencer → park)
- Chain branches filling multiple top-20 slots
- 100% of live Google venues missing FamilyPilot enrichment
- Inflated Family Match with child-name copy and fabricated facilities

---

## Changes made

### 1. Separate Explore from Eat Nearby

- General Explore API calls use `intent=explore` (default)
- Explore `includedPrimaryTypes` exclude `restaurant` and `cafe`
- Restaurants remain via mock `restaurantService`, Eat Nearby, and future `intent=restaurant` path

### 2. Primary-type-led Google search

**Explore `includedPrimaryTypes`:**  
`park`, `playground`, `museum`, `zoo`, `tourist_attraction`, `amusement_park`, `aquarium`, `national_park`, `botanical_garden`, `planetarium`, `water_park`, `hiking_area`, `marina`, `campground`, `ice_skating_rink`, `bowling_alley`, `performing_arts_theater`, `cultural_center`, `library`, `art_gallery`

**Restaurant `includedPrimaryTypes`:**  
`restaurant`, `cafe`, `coffee_shop`, `bakery`, `meal_takeaway`, `fast_food_restaurant`, `ice_cream_shop`, `meal_delivery`

Uses `includedPrimaryTypes` (not legacy `includedTypes`). Unsupported Google types removed after API validation (`childrens_museum`, `theme_park`, `trampoline_park`).

### 3. Exclusion layer

**Explore exclusions:** hotel, lodging, supermarket, department_store, shopping_mall, gas_station, bar, pub, movie_theater, restaurant, cafe, place_of_worship, and other retail/service types.

**Restaurant exclusions:** hotel (primary), supermarket, bar, pub, movie_theater, etc.

Explicit null mappings for audit failures: `historical_landmark`, `hindu_temple`, `movie_theater`, etc.

### 4. Category mapping

```
Google primaryType → FamilyPilot taxonomy → VenueCategory
```

| Taxonomy | VenueCategory |
|----------|---------------|
| park, playground, attraction | `park` |
| museum | `museum` |
| zoo, farm | `farm` |
| activity | `soft_play` |
| restaurant | `restaurant` |
| cafe | `cafe` |
| shop | `shop` |
| hotel | `hotel` |
| unknown | **`null` (excluded)** |

**Never defaults unknown → `park`.**

### 5. Chain deduplication

- Normalises brand names (strip branch suffixes, comma/dash locations)
- Keeps nearest branch per chain in general Explore
- Restaurant intent skips chain dedupe (one McDonald's allowed in restaurant search)

### 6. Ranking

- Google API: `rankPreference: POPULARITY`, `maxResultCount: 20` (API limit)
- FamilyPilot re-ranks by: category relevance (40%), distance (35%), enrichment bonus, base quality (25%)
- **Not** distance-only final ordering

### 7. Enrichment status

```ts
enrichmentStatus: 'provider_only' | 'enriched' | 'verified'
```

| Status | Meaning |
|--------|---------|
| `provider_only` | Google/provider facts only — default for all live Google results |
| `enriched` | FamilyPilot family metadata present |
| `verified` | Core family fields with FamilyPilot editorial provenance |

Live Google results are **never** auto-marked enriched or verified.

### 8. Family Match confidence (provider-only)

- Score capped at **65** (`PROVIDER_ONLY_FAMILY_MATCH_CAP`)
- Classification: **Potential match** (never Excellent/Great)
- Copy: *Based on location and category only. Family suitability has not yet been reviewed.*
- No child-name explanations; `trust.source: estimated`
- Enriched/verified scoring unchanged

### 9. No synthetic metadata

Removed fabrication of `facilities`, `bestAges`, `terrain`, generic descriptions for provider-only venues. Missing = unknown = "Not yet reviewed" in UI.

### 10. UI trust copy

- List/detail: *Family suitability not yet reviewed*
- Venue detail banner: *Live place data · family details still being verified*
- No internal `provider_only` label shown to users

### 11. Provenance preserved

`provider`, `externalId`, `fetchedAt`, `enrichmentStatus`, `googlePrimaryType`, `fallbackUsed` flow through API → repository → merge layer.

### 12. Field mask unchanged

No bulk addition of photos, ratings, priceLevel, etc. Documented for future pass after filtering is stable.

---

## Before/after results (6 audit locations)

Live audit run: 7 August 2026 (`scripts/audit-google-quality.mjs`).  
Full JSON: [audit-google-quality-results.json](./audit-google-quality-results.json)

| Location | Legacy irrelevant / 20 | New irrelevant / 20 | Reduction |
|----------|--------------------------|---------------------|-----------|
| Bushey | 14 | 0 / 15 | **100%** |
| Edinburgh | 9 | 0 / 17 | **100%** |
| Manchester | 8 | 0 / 18 | **100%** |
| Bristol | 9 | 0 / 14 | **100%** |
| Cardiff | 11 | 0 / 16 | **100%** |
| Central London | 3 | 0 / 17 | **100%** |

**Excluded legacy examples:** Asda supermarkets, Vue Cinema, Leonardo/Premier Inn hotels, Marks & Spencer, buffet restaurants misclassified as parks.

**New result examples:** Cassiobury-style parks, museums, tourist attractions, trampoline parks — all `enrichmentStatus: provider_only`.

Target was ≥80% irrelevant reduction; achieved **100%** across all six locations without artificial filtering beyond type/exclusion rules.

---

## Key files

| Area | Path |
|------|------|
| Quality layer (TS) | `familypilot/server/places/places-quality.ts` |
| Quality layer (API JS) | `api/places/lib/places-quality.js` |
| Google search | `api/places/lib/google-places.js`, `familypilot/server/places/google-places-provider.ts` |
| Mapper | `familypilot/server/places/google-places-mapper.ts` |
| API route | `api/places/search.js` (`?intent=explore\|restaurant`) |
| Enrichment | `familypilot/src/utils/places-enrichment.ts` |
| Merge | `familypilot/src/services/places/merge-place.ts` |
| Scoring | `familypilot/src/services/scoring/family-score.ts` |
| Tests | `familypilot/src/__tests__/google-places-quality.test.ts` |

---

## Remaining Google data limitations

- No photos, ratings, price level, or opening hours in search field mask (cost control)
- `maxResultCount` capped at 20 per request — cannot fetch 40+ candidates without multi-request strategy
- Some valid family venues use Google types not in `includedPrimaryTypes` (e.g. `city_park`, `art_museum` mapped when returned)
- Performing arts venues map to attraction/park — family suitability still unknown
- Eat Nearby restaurants still use mock data (unchanged this pass)

---

## Cost implications

- Same number of Nearby Search requests per Explore load
- `includedPrimaryTypes` may reduce irrelevant detail fetches indirectly
- No additional field mask fields — **no cost increase** from this pass

---

## Recommended next step

1. **Beta with caveats:** Google-powered Explore is suitable for beta testers who understand live place names may lack family editorial. Provider-only trust copy sets expectations.
2. **Editorial enrichment:** Prioritise FamilyPilot metadata for top returned Google venues in beta regions.
3. **Future field pass:** Add `rating`, `userRatingCount`, `regularOpeningHours` to detail fetch only (not search bulk).
4. **Restaurant Google path:** Wire `intent=restaurant` to Eat Nearby when ready — separate from this pass.

---

## Test coverage

72 tests passing, including:

- Hotel/supermarket/bar exclusion
- Unknown → null mapping
- Temple, cinema, bowling alley, art museum, historical landmark cases
- Restaurant search path
- Chain deduplication
- Provider-only enrichment + Family Match cap
- Missing metadata stays unknown
- Enriched/verified scoring unchanged

```bash
cd familypilot && npm test && npm run typecheck
```
