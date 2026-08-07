# FamilyPilot — Family Match™

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Status:** MVP implemented (basic factors) · V2 factors planned

---

## Purpose

**Family Match is the intelligence layer that powers FamilyPilot** — the explainable suitability score behind every recommendation.

It answers: *"How well does this place, restaurant, hotel, car, product, or plan fit **this** family, **right now**?"*

Family Match is not merely a UI badge. It combines **family context**, **situational context**, and **learned context (Family DNA)** to produce scores parents can trust.

**Never simply display a percentage. Always explain why.**

---

## Context layers

Family Match combines three input layers:

### Family context

Children's ages · Interests · Family preferences · Accessibility requirements · SEND preferences · Dietary preferences · Equipment · Vehicle · Budget

### Situational context

Weather · Travel time · Time available · Opening times · Cost · Parking · Terrain · Facilities · Restaurant availability · Current plan

### Learned context (Family DNA)

Previous choices · Saved places · Places rejected · Favourite categories · Typical travel distance · Typical spend · Preferred environments

Family DNA inferences must be transparent and editable — see [PRIVACY_MODEL.md](./PRIVACY_MODEL.md).

---

## What Family Match evaluates

Family Match can eventually score:

Activities · Parks · Attractions · Restaurants · Cafés · Hotels · Holidays · Cars · Products · Family meetups · Day plans · Travel options

---

## Brand language

| Term | Use when |
|------|----------|
| **Family Match** | Cards, lists, quick decisions — compact % + short reasons |
| **Family Score** | Venue detail breakdown — factor bars, detailed panel |
| **Combined Family Match** | Meet Another Family — fairness + multi-family suitability |

All variants share: shape language, colour meaning (green = strong fit), typography, and reason format.

---

## Live Google enrichment states (Aug 2026)

| `enrichmentStatus` | Family Match | Trust copy |
|--------------------|--------------|------------|
| `provider_only` | Potential match, cap 65 | Family suitability not yet reviewed |
| `enriched` | Normal scoring with known fields | FamilyPilot family details available |
| `verified` | Normal scoring (not auto-excellent) | Family details checked recently |

See [VENUE_ENRICHMENT_WORKFLOW.md](./VENUE_ENRICHMENT_WORKFLOW.md) for internal editorial workflow.

---

## Example (target experience)

```
98% Family Match

Perfect because:
✓ Ideal for ages 3 and 0
✓ Flat paths
✓ Pushchair friendly
✓ Café
✓ Baby changing
✓ Restaurant nearby
✓ Only 16 minutes away
```

Also rendered as **"Why we recommended this"** on cards and hero surfaces.

---

## UI variants (implemented)

| Variant | Surface | Component |
|---------|---------|-----------|
| **compact** | Saved rows, small badges | `FamilyMatch` variant="compact" |
| **card** | Decision cards, list pills | `FamilyMatch` variant="card" |
| **detail** | Venue hero circle | `FamilyMatch` variant="detail" |
| **panel** | Venue detail breakdown | `FamilyMatchPanel` |

**Rule:** Do not create unrelated badge styles. Extend `FamilyMatch` / `FamilyMatchPanel`.

---

## Scoring inputs

### MVP (implemented / mock)

| Factor | Weight (conceptual) | Source |
|--------|---------------------|--------|
| Age suitability | High | Profile children ages |
| Distance | High | Mock drive minutes |
| Budget fit | Medium | Profile budget tier |
| Weather fit | Medium | Mock weather |
| Facilities match | Medium | Venue facilities |
| Accessibility | Low (implicit) | Partial via terrain |
| Popularity | Low | Mock |

### Post-MVP (planned)

| Factor | Phase | Notes |
|--------|-------|-------|
| Accessibility match | 4 | Hard filter if required |
| SEND suitability | 5 | Session + attribute match |
| Restaurant proximity | 3 | For activity venues |
| Pushchair friendliness | 3–4 | Explicit attribute |
| Parking | 3 | Facility flag |
| Family interests | Future Vision | Profile interests |
| Previous behaviour | Long-term Research | Saves, visits |
| Travel fairness | 6 | Meet Another Family |

---

## Combined Family Match (Meet Another Family — Phase 6)

```
Combined Family Match — 96%

Breakdown:
  • Family A suitability: 98%
  • Family B suitability: 94%
  • Travel fairness: 97%
  • Facilities: 95%
```

**Travel fairness:** Penalise large imbalance in drive times (not geographic midpoint alone).

---

## Algorithm principles

1. **Explainability first** — Every score produces `explanation: string[]` reasons parents understand
2. **Required constraints** — Accessibility/SEND *required* prefs → exclude or warn, not silent low score
3. **Honest uncertainty** — Missing data lowers confidence; say what's unknown
4. **No black box** — Factor breakdown visible on detail screens
5. **Same profile everywhere** — One family profile feeds all scores

### Current implementation

- Client-side: `src/services/scoring/family-score.ts`
- Mock data: pre-computed scores in `mock-data.ts`
- Future: Supabase Edge Function caching `venue_scores` JSONB

---

## Factor bar labels (detail panel)

| Key | Display label |
|-----|---------------|
| ageSuitability | Age fit |
| facilitiesMatch | Facilities |
| accessibility | Access |
| distance | Distance |
| budgetFit | Budget |
| weatherFit | Weather |
| sendSuitability | SEND fit *(planned)* |
| travelFairness | Travel fairness *(meetups)* |

---

## Data structure (TypeScript)

```typescript
interface FamilyScore {
  score: number;                    // 0–100
  factors: FamilyScoreFactors;
  explanation: string[];            // Parent-facing reasons
  confidence?: 'high' | 'medium' | 'low';  // planned
}

interface FamilyScoreFactors {
  ageSuitability: number;
  accessibility: number;
  distance: number;
  weatherFit: number;
  budgetFit: number;
  facilitiesMatch: number;
  popularity: number;
  // Planned:
  sendSuitability?: number;
  restaurantProximity?: number;
  travelFairness?: number;
}
```

---

## Display rules

| Context | Max reasons shown | Score format |
|---------|-------------------|--------------|
| Decision card | 2–3 | `94% Family Match` pill |
| Hero / Today's Pick | 3 | Card variant |
| Venue detail | All + factor bars | Panel |
| Restaurant (Eat Nearby) | 3 | Same card language |
| Meetup result | Combined + breakdown | Detail variant |

---

## Trust rules

- Label estimated costs: *"Estimated family cost"*
- Do not imply live crowd, stock, or hours unless sourced
- If accessibility/SEND data missing: *"Accessibility information not yet verified"*
- **Never inflate scores to please partners or affiliates**
- Commercial relationships must never secretly determine Family Match
- Sponsored options shown separately with clear labels — never disguised as personalisation

See [MASTER_PRODUCT_VISION.md § The FamilyPilot Promise](./MASTER_PRODUCT_VISION.md).

---

## Testing

- Unit tests: label consistency (`family-match-label.ts`)
- Visual: all variants use same green (`secondary.500`) and "Family Match" wording
- Regression: changing one variant must not fork styling

---

## Related documents

- [PRODUCT_DIRECTION_V2.md §10](./PRODUCT_DIRECTION_V2.md) — V2 scoring spec
- [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) — `venue_scores` storage
- Design tokens: `src/design-system/tokens/colors.ts`

---

*Family Match is the product. Protect its explainability.*
