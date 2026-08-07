# FamilyPilot — MVP Scope

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Last updated:** 7 August 2026  
**Production:** https://family-pilot-seven.vercel.app/

---

## Purpose

This document defines **what is in scope today** — the build parents can test now — and what is explicitly **out of scope** until parent feedback is collected.

For phased delivery after MVP, see [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).  
For detailed future feature specs, see [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md) and [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md).

---

## Scope labels (used across all docs)

| Label | Meaning |
|-------|---------|
| **MVP** | Built or in active parent testing today |
| **Post-MVP** | Next priorities after structured parent feedback |
| **Future Vision** | Documented; architecture prepared; not scheduled |
| **Long-term Research** | Exploratory; no delivery commitment |

---

## Current focus

**Collect structured feedback from 5–10 parents before building V2 features.**

Do not implement Post-MVP or Future Vision features unless explicitly prioritised after testing. See [PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md).

---

## MVP — Shipped ✅

### Platform & deployment

| Item | Label | Notes |
|------|-------|-------|
| Expo React Native app (iOS, Android, Web) | MVP | Single codebase |
| Vercel web deployment | MVP | Production URL above |
| Venue deep links (`/venue/[id]`) | MVP | Static export + rewrite |
| Mock API layer (TanStack Query) | MVP | No backend credentials required |
| Design system (tokens, components) | MVP | See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |

### Navigation & core screens

| Screen | Label | Status |
|--------|-------|--------|
| Home | MVP | ✅ Simplified post-remediation |
| Explore | MVP | ✅ List-first; filters partial |
| Trips | MVP | ✅ Timeline display |
| Saved | MVP | ✅ Grouped list |
| Profile | MVP | ✅ Mock family + testing notice |
| Venue detail | MVP | ✅ Family Match + facilities + Eat Nearby |
| Restaurant detail | Post-MVP | ✅ `/restaurant/[id]` mock beta |
| Need Something Now | MVP | ✅ Store cards |
| Car Fit | MVP | ✅ Prototype |
| Packing list | MVP | ✅ Prototype |
| Holiday comparison | MVP | ✅ Prototype |
| Feedback | MVP | ✅ GitHub issue pre-fill |

### Home (MVP contract)

Per [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) — **do not add more primary buttons**.

| Section | Label | Status |
|---------|-------|--------|
| Greeting + weather pill | MVP | ✅ |
| Today's Pick (one hero recommendation) | MVP | ✅ |
| Quick Actions (4): Go Outside, Indoor Ideas, Need Something Now, Plan Something | MVP | ✅ |
| More Ideas row | MVP | ✅ |
| One recommendation carousel | MVP | ✅ |
| Plan Something sub-menu | MVP | ✅ Routes only; full features Post-MVP |

### Family Match (MVP)

| Item | Label | Status |
|------|-------|--------|
| Explainable score on cards | MVP | ✅ |
| Unified `FamilyMatch` component | MVP | ✅ compact / card / detail |
| Weighted factor algorithm (client) | MVP | ✅ Not wired to live recalc |
| "Why we recommended this" copy | MVP | ✅ On venue detail |

### Phase 2 remediation (MVP polish)

| Item | Label | Status |
|------|-------|--------|
| Production routing fixes | MVP | ✅ |
| Place not found (invalid venue ID) | MVP | ✅ |
| Trust labels ("Testing build") | MVP | ✅ |
| Reduced motion support | MVP | ✅ |
| Filter chip visual states | MVP | ✅ |
| Back navigation consistency | MVP | ✅ |
| Parent testing guide | MVP | ✅ |

---

## MVP — Partial / prototype ⚠️

These screens exist and are testable but use mock data, placeholder actions, or incomplete wiring.

| Item | Label | Gap |
|------|-------|-----|
| Explore filter chips | MVP | ✅ Places + Restaurants |
| Need Now filter chips | MVP | Visual only |
| Save / Directions on venue | MVP | Buttons present; handlers not wired |
| Trips create / edit | MVP | Placeholder buttons |
| Profile edit | MVP | Display only |
| Packing list toggle | MVP | Display only |
| Family Score live calculation | MVP | Mock scores in data |
| Concierge route | MVP | Registered; screen missing |
| Map on Explore | Future Vision | Removed placeholder; list-first |

---

## MVP — Explicitly NOT included ❌

These are **not** part of the current test build. Do not implement without prioritisation.

| Feature | Label | See |
|---------|-------|-----|
| Live restaurant / Places API | Post-MVP | [EAT_NEARBY.md](./EAT_NEARBY.md) |
| Accessibility filters & venue depth | Post-MVP | Phase 4 |
| SEND-friendly attributes & filters | Post-MVP | Phase 5 |
| Meet Another Family | Post-MVP | Phase 6 |
| Plan Your Day itinerary builder | Post-MVP | Phase 7 |
| Connected Families | Future Vision | Phase 8 |
| Supabase auth & sync | Post-MVP | [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) |
| Real maps (Mapbox / Google) | Future Vision | |
| Live venue / Places API | Post-MVP | |
| Live weather API | Post-MVP | |
| Live inventory (Need Now) | Long-term Research | |
| AI Concierge chat UI | Long-term Research | Invisible AI only, if ever |
| Booking flows | — | **Never** — not a booking app |
| Social feeds / forums | — | **Never** |

---

## Success criteria for exiting MVP

MVP testing is complete when:

1. **5–10 parents** have completed structured sessions ([PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md))
2. Feedback is **categorised** (decision confidence, clarity of Family Match, Home hierarchy, missing decisions)
3. **One prioritised Post-MVP slice** is chosen based on evidence — not assumption
4. No release-blockers remain on production (routes, core flows, accessibility basics)

---

## Architecture readiness (MVP)

The codebase is structured so Post-MVP features fit without rewrites:

- Provider interfaces for places, weather, maps (`IPlacesProvider`, etc.)
- Extensible venue model (see [DATABASE_FUTURE.md](./DATABASE_FUTURE.md))
- Tab + stack navigation with room for Plan Something flows
- Family profile shape supports future preferences (accessibility, SEND, dining)

**Rule:** Document and plan future features; implement only when prioritised.

---

## Related documents

| Document | Purpose |
|----------|---------|
| [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) | Product constitution |
| [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) | Build / no-build gates |
| [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md) | Phases 1–8 |
| [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md) | Prioritised backlog with labels |
| [PHASE_2_REMEDIATION.md](./PHASE_2_REMEDIATION.md) | What shipped in remediation |
| [PROJECT_STATUS.md](./PROJECT_STATUS.md) | Technical status & file inventory |
