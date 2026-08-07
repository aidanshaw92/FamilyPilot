# FamilyPilot — Future Backlog

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Last updated:** 7 August 2026

---

## How to use this document

Every item is labelled:

| Label | Meaning |
|-------|---------|
| **MVP** | In current test build or active polish |
| **Post-MVP** | Planned after parent feedback |
| **Future Vision** | Documented; architecture prepared |
| **Long-term Research** | Exploratory; no schedule |

**Gate before adding anything:** [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md)

Detailed specs: [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) · Phase order: [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md)

---

## Immediate — MVP polish (non-blocking)

These improve the test build but do not block parent sessions.

| Item | Label | Priority | Notes |
|------|-------|----------|-------|
| Profile edit flow | MVP | P2 | Rows are visual only |
| Trips Start trip / Edit | MVP | P2 | Placeholder buttons |
| Save / unsave from venue | MVP | P2 | Footer buttons unwired |
| Explore chips filter list | MVP | P2 | Zustand state exists |
| Need Now chips filter list | MVP | P2 | Visual only today |
| Packing list toggle | MVP | P3 | Display only |
| Home loading skeleton visibility | MVP | P3 | Mock API too fast |
| Pull-to-refresh on data screens | MVP | P3 | |
| Native swipe-to-remove on Saved | MVP | P3 | |
| Grammar: "1 years old" on Profile | MVP | P3 | Copy fix |
| JS bundle code splitting (~2.9MB) | Post-MVP | P3 | Performance |
| Real maps provider for GO / Directions | Future Vision | P4 | |
| Concierge screen (`/concierge`) | Long-term Research | P4 | Route registered; screen missing |

---

## Post-MVP — Phase 3: Eat Nearby & restaurants

**Decision solved:** *Which restaurant should we eat at?*

| Item | Label | Depends on |
|------|-------|------------|
| Restaurant as first-class venue type | Post-MVP | Venue model |
| Restaurant attributes (kids menu, high chairs, baby changing, noise, outdoor seating, play area, parking, dietary options, estimated spend) | Post-MVP | Data sourcing |
| Eat Nearby section on venue detail | Post-MVP | Restaurant data |
| Eat Nearby in activity recommendations ("After your visit") | Post-MVP | Restaurant data + Match |
| Rank by distance + Family Match + facilities | Post-MVP | Family Match v2 |
| Explore restaurant category | Post-MVP | Data |

Spec: [PRODUCT_DIRECTION_V2.md §6–7](./PRODUCT_DIRECTION_V2.md)

---

## Post-MVP — Phase 4: Accessibility

**Decision solved:** *Is this venue accessible for our family?*

| Item | Label | Depends on |
|------|-------|------------|
| Accessibility attributes on venues (step-free, accessible toilets, Changing Places, parking, flat terrain, lift, seating, wheelchair play, surface, gradient) | Post-MVP | Schema + sourcing |
| Profile accessibility preferences | Post-MVP | Profile |
| Family Match accessibility factor | Post-MVP | Scoring |
| Explore accessibility filters | Post-MVP | Filter sheet |
| Venue detail Accessibility section | Post-MVP | UI |
| Required-preference warnings / exclude | Post-MVP | Profile + Match |

**Rule:** Accessibility is part of every venue — not a separate product.

Spec: [PRODUCT_DIRECTION_V2.md §8](./PRODUCT_DIRECTION_V2.md)

---

## Post-MVP — Phase 5: SEND-friendly

**Decision solved:** *Is this activity SEND-friendly for our child?*

| Item | Label | Depends on |
|------|-------|------------|
| SEND factual attributes (quiet sessions, sensory sessions, visual schedules, ear defenders, quiet room, staff training, carer tickets, queue support) | Post-MVP | Schema + sourcing |
| Profile SEND preferences | Post-MVP | Profile |
| Family Match SEND factor | Post-MVP | Scoring |
| Explore SEND category + filters | Post-MVP | UI |
| Venue detail SEND section | Post-MVP | UI |

**Rule:** Never guess. Never make unsupported claims.

Spec: [PRODUCT_DIRECTION_V2.md §9](./PRODUCT_DIRECTION_V2.md)

---

## Post-MVP — Phase 6: Meet Another Family v1

**Decision solved:** *Where should we meet another family?*

| Item | Label | Depends on |
|------|-------|------------|
| Two-location input (postcode / area) — one phone | Post-MVP | Maps provider |
| Travel fairness scoring (not just midpoint) | Post-MVP | Maps |
| Combined Family Match for both families | Post-MVP | Match v2 |
| 2–3 alternative venue recommendations | Post-MVP | Venues |
| Nearby restaurant in meetup plan | Post-MVP | Phase 3 |
| Share plan (text / link) | Post-MVP | Share API |
| No account required to use v1 | Post-MVP | Privacy model |

Privacy: [PRIVACY_MODEL.md](./PRIVACY_MODEL.md)

Spec: [PRODUCT_DIRECTION_V2.md §4](./PRODUCT_DIRECTION_V2.md)

---

## Post-MVP — Phase 7: Plan Your Day

**Decision solved:** *What should we do today?*

| Item | Label | Depends on |
|------|-------|------------|
| Itinerary generation (morning → lunch → optional stop → home) | Post-MVP | Venues + restaurants + weather |
| Swap / remove / add stops | Post-MVP | UI |
| Cost & travel summary | Post-MVP | Mock → sourced economics |
| Save to Trips | Post-MVP | Trips model |
| Share plan | Post-MVP | Share |

**Not the product identity.** Plan Your Day is a feature inside FamilyPilot.

Spec: [PRODUCT_DIRECTION_V2.md §3](./PRODUCT_DIRECTION_V2.md)

---

## Future Vision — Phase 8: Connected Families

**Decision solved:** *Where should we meet friends/grandparents with both family profiles?*

| Item | Label | Depends on |
|------|-------|------------|
| Family connections / invites | Future Vision | Auth |
| Combined profile planning | Future Vision | Connections |
| Collaborative meetups | Future Vision | Phase 6 |
| Permission model for shared preferences | Future Vision | [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) |
| Browser-readable share pages | Future Vision | Web routes |

---

## Future Vision — Platform & data

| Item | Label | Notes |
|------|-------|-------|
| Supabase auth + profile sync | Post-MVP | See [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) |
| Saved / Trips persistence | Post-MVP | |
| Real maps on Explore | Future Vision | Apple Maps pattern |
| Google Places / Foursquare via `IPlacesProvider` | Post-MVP | |
| OpenWeather via `IWeatherProvider` | Post-MVP | |
| Family Score Edge Function + caching | Post-MVP | |
| Onboarding flow (postcode + children ages) | Post-MVP | |
| Progressive filter sheet on Explore | Post-MVP | |
| Search on Explore and Need Now | Post-MVP | |
| Venue detail: photo gallery, wired Save/Directions | Post-MVP | |

---

## Future Vision — Product areas (documented, not scheduled)

| Area | Label | Example decisions |
|------|-------|-------------------|
| Discover expansion (farms, museums, beaches, seasonal events, SEND/accessible places) | Future Vision | What should we do today? |
| Facilities depth on every venue (toilets, microwave, breastfeeding, shade, picnic) | Future Vision | Will this work for us? |
| Weather intelligence (rain, wind, heat, UV, indoor alternatives) | Future Vision | Should we go outside? |
| Holiday planning (hotels, flights, car hire, luggage, Family Match) | Future Vision | Which hotel suits us? |
| Car Fit expansion + car recommendations | Future Vision | Should we hire a car? |
| Packing auto-generation from trip + weather + children | Future Vision | What should we pack? |
| Family Deals (memberships, kids eat free, vouchers) | Future Vision | Where can we save? |
| Birthday planner | Long-term Research | Where should we celebrate? |
| Family DNA™ personalisation | Long-term Research | Deep long-term prefs; transparent, editable |
| Why Families Love It (venue intelligence) | Long-term Research | Factual summaries from evidence; not review feed |

---

---

## Long-term Research — Why Families Love It

**Decision solved:** *What do families consistently say about this venue — without reading hundreds of reviews?*

| Item | Label | Notes |
|------|-------|-------|
| Factual pattern summaries from trusted reviews and feedback | Long-term Research | Not a generic review feed |
| "Things to know" warnings (busy times, mud, queues) | Long-term Research | Evidence-based only |
| Verification, recency, and confidence mechanisms | Long-term Research | Community data not auto-trusted |
| Separate venue-provided vs community observations | Long-term Research | Trust rules |

**Rules:** Do not fabricate summaries. Only summarise sufficient underlying evidence. Do not present subjective opinion as objective fact.

Authority: [MASTER_PRODUCT_VISION.md § Why Families Love It](./MASTER_PRODUCT_VISION.md)

---

## Long-term Research

| Item | Label | Notes |
|------|-------|-------|
| Live inventory for Need Now | Long-term Research | Formula, nappies, medicine stock |
| AI Concierge (invisible, not chat UI) | Long-term Research | Embedded in scores, not ChatGPT-style |
| Push notifications (trip reminders, passport expiry) | Long-term Research | |
| Crowd prediction for parks | Long-term Research | |
| 3D boot visualisation (Car Fit) | Long-term Research | |
| Pushchair / product purchase recommendations | Long-term Research | |
| Nap time awareness in recommendations | Long-term Research | |
| Calendar / school holidays integration | Long-term Research | |
| Memories / photo journal | Long-term Research | Out of core vision unless reframed |
| Community updates / forums | — | **Never** — not a social network |

---

## Explicitly out of scope (do not build)

Even if requested, reject or defer:

- Repositioning FamilyPilot as a day planner only
- Booking flows (restaurants, hotels, attractions)
- Social networking feeds or parenting forums
- Requiring FamilyPilot download to read a shared plan (v1 share must work in browser)
- Exposing private home addresses in shares
- Claiming SEND suitability or accessibility without sourced data
- Claiming allergy safety without verification
- Overloading Home with new primary buttons
- Building all Post-MVP features before parent testing completes
- Generic directory listings without Family Match and explainability
- Secretly manipulating Family Match for affiliate commission
- Disguising sponsored content as personalisation

---

## Supporting engineering work (when features ship)

| Work | Label | Triggers |
|------|-------|----------|
| Extended venue schema (`accessibility_features`, `send_features`, `restaurant_features`) | Post-MVP | Phases 3–5 |
| `meetup_plans`, `day_plans` tables | Post-MVP | Phases 6–7 |
| Combined Family Match algorithm | Post-MVP | Phase 6 |
| Shareable plan pages (web-readable) | Future Vision | Phases 6–7 |
| Profile progressive preferences UI | Post-MVP | Phases 3–5 |
| Explore category expansion | Post-MVP | Phase 3+ |
| Venue detail new sections (Accessibility, SEND, Eat nearby, Meet here) | Post-MVP | Phases 3–6 |
| React Hook Form + Zod on forms | Post-MVP | Auth / profile edit |
| E2E tests for core flows | Post-MVP | Before scale |
| CI/CD (GitHub Actions, EAS) | Post-MVP | Before App Store |

Schema detail: [DATABASE_FUTURE.md](./DATABASE_FUTURE.md)

---

## Prioritisation rule

After MVP testing, choose **one Post-MVP slice** based on:

1. Which **family decision** parents struggled with most
2. Whether Family Match explainability was trusted
3. Whether the gap is data, UX, or missing feature area
4. [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) final gate

Default roadmap order (if feedback is inconclusive): Phase 3 → 4 → 5 → 6 → 7 → 8 per [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).
