# FamilyPilot — Feature Roadmap

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Last updated:** 7 August 2026

---

## Scope labels

| Label | Meaning |
|-------|---------|
| **MVP** | Built or in active testing today |
| **Post-MVP** | Next priorities after parent feedback |
| **Future Vision** | Documented; architecture prepared |
| **Long-term Research** | Exploratory; no schedule |

---

## Phase overview

| Phase | Name | Scope | Status |
|-------|------|-------|--------|
| **1** | Core platform | MVP | ✅ Shipped (testing build) |
| **2** | Feedback & polish | MVP | ✅ Remediation complete; 🔄 parent testing |
| **3** | Eat Nearby & restaurants | Post-MVP | ⬜ Planned |
| **4** | Accessibility | Post-MVP | ⬜ Planned |
| **5** | SEND-friendly | Post-MVP | ⬜ Planned |
| **6** | Meet Another Family v1 | Post-MVP | ⬜ Planned |
| **7** | Plan Your Day | Post-MVP | ⬜ Planned |
| **8** | Connected Families | Future Vision | ⬜ Planned |

---

## Phase 1 — Core platform (MVP) ✅

| Feature | Label | Status |
|---------|-------|--------|
| Tab navigation (Home, Explore, Trips, Saved, Profile) | MVP | ✅ |
| Family profile (mock) | MVP | ✅ |
| Family Match / Family Score | MVP | ✅ |
| Home — Today's Pick, Quick Actions, More Ideas | MVP | ✅ |
| Explore — list, filters | MVP | ✅ partial |
| Venue detail + deep links | MVP | ✅ |
| Saved places | MVP | ✅ |
| Need Something Now | MVP | ✅ |
| Trips timeline | MVP | ✅ |
| Car Fit checker | MVP | ✅ prototype |
| Packing list | MVP | ✅ prototype |
| Holiday comparison | MVP | ✅ prototype |
| Web deployment (Vercel) | MVP | ✅ |

---

## Phase 2 — Feedback & polish (MVP) 🔄

| Feature | Label | Status |
|---------|-------|--------|
| Production route fixes | MVP | ✅ |
| Home simplification | MVP | ✅ |
| Unified Family Match component | MVP | ✅ |
| Trust labels & testing notice | MVP | ✅ |
| Feedback collection | MVP | ✅ |
| Parent testing guide | MVP | ✅ |
| **Structured parent feedback (5–10 testers)** | MVP | 🔄 In progress |
| Performance / bundle size | Post-MVP | ⬜ |
| Real maps on Explore | Future Vision | ⬜ |
| Supabase auth + sync | Post-MVP | ⬜ |

---

## Phase 3 — Eat Nearby & restaurants (Post-MVP)

| Feature | Label | Depends on |
|---------|-------|------------|
| Restaurant as first-class venue type | Post-MVP | Venue model |
| Restaurant attributes (kids menu, high chairs, etc.) | Post-MVP | Data sourcing |
| **Eat Nearby** on venue detail | Post-MVP | Restaurant data |
| Eat Nearby in recommendations | Post-MVP | Restaurant data |
| Rank by distance + Family Match + facilities | Post-MVP | Family Match v2 |
| Estimated family spend | Post-MVP | Mock → sourced |
| Dietary options (factual only) | Post-MVP | Profile prefs |

**Why first after feedback:** Improves almost every activity recommendation.

Spec: [PRODUCT_DIRECTION_V2.md §6–7](./PRODUCT_DIRECTION_V2.md)

---

## Phase 4 — Accessibility (Post-MVP)

| Feature | Label | Depends on |
|---------|-------|------------|
| Accessibility attributes on venues | Post-MVP | Schema |
| Terrain / surface / gradient | Post-MVP | Outdoor venues |
| Profile accessibility preferences | Post-MVP | Profile |
| Family Match accessibility factor | Post-MVP | Scoring |
| Explore accessibility filters | Post-MVP | Filter sheet |
| Venue detail Accessibility section | Post-MVP | UI |
| Required-preference warnings / exclude | Post-MVP | Profile + Match |

---

## Phase 5 — SEND-friendly (Post-MVP)

| Feature | Label | Depends on |
|---------|-------|------------|
| SEND factual attributes | Post-MVP | Schema |
| Session schedules (sourced) | Post-MVP | Data |
| Profile SEND preferences | Post-MVP | Profile |
| Family Match SEND factor | Post-MVP | Scoring |
| Explore SEND category + filters | Post-MVP | UI |
| Venue detail SEND section | Post-MVP | UI |

**Rule:** Never claim diagnosis suitability without evidence.

---

## Phase 6 — Meet Another Family v1 (Post-MVP)

| Feature | Label | Depends on |
|---------|-------|------------|
| Two-location input (postcode/area) | Post-MVP | Maps provider |
| Travel fairness scoring | Post-MVP | Maps |
| Combined Family Match | Post-MVP | Match v2 |
| Alternative venues (2–3) | Post-MVP | Venues |
| Share plan (text / link) | Post-MVP | Share API |
| Browser-readable share page | Future Vision | Web route |
| **Connected accounts** | Future Vision | Phase 8 |

Privacy: [PRIVACY_MODEL.md](./PRIVACY_MODEL.md)

---

## Phase 7 — Plan Your Day (Post-MVP)

| Feature | Label | Depends on |
|---------|-------|------------|
| Itinerary generation | Post-MVP | Venues + restaurants + weather |
| Activity → lunch → optional stop → home | Post-MVP | Eat Nearby |
| Swap / remove / add stops | Post-MVP | UI |
| Cost & travel summary | Post-MVP | Mock economics |
| Save to Trips | Post-MVP | Trips model |
| Share plan | Post-MVP | Share |

**Not:** Route optimisation v1 · **Not:** the product identity

---

## Phase 8 — Connected Families (Future Vision)

| Feature | Label | Depends on |
|---------|-------|------------|
| Family connections / invites | Future Vision | Auth |
| Combined profile planning | Future Vision | Connections |
| Collaborative meetups | Future Vision | Phase 6 |
| Permission model for shared prefs | Future Vision | Privacy |

---

## Long-term Research (no phase assigned)

| Feature | Label |
|---------|-------|
| Family DNA™ personalisation | Long-term Research |
| Birthday planner | Long-term Research |
| Family Deals / membership savings | Long-term Research |
| Weather intelligence (UV, heat, wind) | Long-term Research |
| Pushchair / product recommendations | Long-term Research |
| Live inventory (Need Now) | Long-term Research |
| Car recommendation engine | Long-term Research |
| AI Concierge (invisible) | Long-term Research |
| Crowd prediction | Long-term Research |
| 3D boot visualisation | Long-term Research |

---

## Dependency graph

```
Profile + Venues (MVP)
    ├── Phase 3: Restaurants → Eat Nearby
    ├── Phase 4: Accessibility
    ├── Phase 5: SEND
    ├── Phase 6: Meet Another Family
    └── Phase 7: Plan Your Day (needs 3 + 4/5 optional)

Phase 8: Connected Families (needs Auth + Phase 6)
```

---

## What we are NOT building (any phase)

- Social feeds
- Forum / comments
- Forced booking flows
- Directory-only browse without Family Match
- Chatbot primary interface
- Home screen button proliferation

---

*Implement only the current phase. Document the rest. See [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md) for deferred items.*
