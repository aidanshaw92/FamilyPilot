# FamilyPilot — Project Status Summary

**Last updated:** 7 August 2026  
**Production URL:** https://family-pilot-seven.vercel.app/  
**Current focus:** Parent user testing (Phase 2 remediation deployed)  
**Product constitution:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) — read before any code change  
**MVP scope:** [MVP_SCOPE.md](./MVP_SCOPE.md)  
**Future backlog:** [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md)  
**Feature specs (planned):** [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md)  
**Remediation & QA:** [PHASE_2_REMEDIATION.md](./PHASE_2_REMEDIATION.md)  
**Tester guide:** [PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Vision Recap](#product-vision-recap)
3. [Design Inspiration Analysis](#design-inspiration-analysis)
4. [Architectural Decisions](#architectural-decisions)
5. [Tech Stack](#tech-stack)
6. [Documentation Created](#documentation-created)
7. [Files & Folder Structure](#files--folder-structure)
8. [Design System](#design-system)
9. [Features Implemented](#features-implemented)
10. [Features Not Yet Implemented](#features-not-yet-implemented)
11. [Database & API Layer](#database--api-layer)
12. [Dependencies Installed vs Unused](#dependencies-installed-vs-unused)
13. [Phase Roadmap](#phase-roadmap)
14. [How to Run](#how-to-run)
15. [Environment Variables](#environment-variables)
16. [Known Gaps & Technical Debt](#known-gaps--technical-debt)

---

## Executive Summary

FamilyPilot is a **personalised family decision engine** — one family profile that helps parents make better everyday decisions (where to go, what to eat, what to pack, whether something fits, and more).

**Phase 1** established the foundation: design system, 10+ screens, mock API, Supabase schema.  
**Phase 2 remediation** (August 2026) fixed production routing, simplified Home, unified Family Match, and prepared the app for parent testing. Production score: **7.6 / 10** (see [PHASE_2_REMEDIATION.md](./PHASE_2_REMEDIATION.md)).

**What works today:** Navigation, personalised Home, Explore, venue detail with deep links, Saved, Need Now, Trips, utility screens (packing, car fit, holidays), feedback collection, and mock-data-driven Family Match — all on web and Expo without backend credentials.

**What does not work yet:** Real auth, live maps, external APIs, AI concierge, and all **Post-MVP** features (Plan Your Day, Meet Another Family, Eat Nearby, accessibility/SEND depth, connected families). See [MVP_SCOPE.md](./MVP_SCOPE.md) and [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md).

**Current priority:** Collect structured feedback from 5–10 parents before building Post-MVP features. Every future decision is governed by [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) and [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md).

---

## Product Vision Recap

> **The app that helps families make better everyday decisions.**

FamilyPilot is **not** a day planner, booking site, AI chatbot, parenting content app, or generic directory. It is a **personalised family decision engine** powered by one family profile and explainable **Family Match** scores.

**Core philosophy:** Reduce research; provide confident, explainable recommendations. The user stays in control — generated plans and scores are starting points, not prescriptions.

**Positioning rule:** Features like "Plan Your Day" strengthen the vision; they do not replace it. See [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) and [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) §1–2.

**Key differentiator:** **Family Match** — an explainable score (0–100) with visible reasoning for venues, restaurants, trips, meetups, and more.

---

## Design Inspiration Analysis

Based on the 10-screen UI inspiration mockups, documented in [`docs/DESIGN_ANALYSIS.md`](./DESIGN_ANALYSIS.md).

### What works well in the inspiration

| Strength | Why it matters |
|----------|----------------|
| Family Score badge on every card | Instant trust; reduces need to read reviews |
| Card-based layout on off-white background | Premium, scannable, Apple/Airbnb feel |
| Contextual metadata (drive time, facilities) | Surfaces decision-relevant data early |
| Quick-action home grid | Maps to parent intents; supports "no typing" philosophy |
| Horizontal recommendation carousels | Keeps home alive without overwhelming |
| Utility features as peers (car fit, packing, trips) | Positions app as "family OS", not a directory |
| Hero photography on venue screens | Elevates everyday places to destinations |

### What was improved in the redesign

| Inspiration weakness | FamilyPilot improvement |
|---------------------|-------------------------|
| 8 equal home buttons | 4 primary + 4 secondary actions |
| Filter chip overload on Explore | Category chips now; filter sheet planned Phase 2 |
| Generic holiday provider cards | "We recommend Jet2" banner with explainable reasons |
| Car fit checker lacks hierarchy | Capacity bar + FITS/DOESN'T FIT status first |
| No personalised "Why" on venues | "Perfect for your family because…" block added |
| Splash screen feature list | Deferred; onboard-through-use approach planned |
| "Favourites" tab label | Renamed to **Saved** (broader scope) |
| Map pins without context | Map placeholder; real pins planned Phase 4 |

### Premium apps referenced

Airbnb (listing quality) · Apple Maps (bottom sheet pattern) · Headspace (soft palette) · Uber (Need Now urgency) · TripIt (timeline) · Citymapper (quick actions) · Pinterest (carousels)

---

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Mobile framework** | Expo SDK 57 + React Native 0.86 | Fast iteration, OTA updates, App Store path |
| **Navigation** | Expo Router (file-based) | `(tabs)` for main nav, stack for features, modal for concierge |
| **Styling** | TypeScript design tokens + StyleSheet | Type-safe, reliable; NativeWind installed but not configured |
| **State — server** | TanStack Query | Caching, loading states, easy swap from mock → real API |
| **State — client** | Zustand | Lightweight stores for profile and filters |
| **Backend** | Supabase (PostgreSQL + Auth) | Schema written; client stub checks for env vars |
| **External APIs** | Provider interface pattern | Never hardcode; swap Google ↔ Mapbox without touching UI |
| **Family Score** | Client algorithm now; edge function later | Same weighted factor model; results stored as JSONB |
| **Data in Phase 1** | Mock service layer | Screens are production-ready; services return realistic UK family data |
| **Typography** | Inter via `@expo-google-fonts/inter` | Premium cross-platform feel; falls back to system UI |
| **Strict TypeScript** | `strict: true`, no `any` | Enforced across all new source files |
| **Forms (planned)** | React Hook Form + Zod | Dependencies installed; not yet used in screens |

---

## Tech Stack

### Implemented & in use

| Layer | Technology |
|-------|------------|
| Framework | React Native 0.86, React 19, Expo ~57 |
| Language | TypeScript 6 (strict) |
| Routing | Expo Router ~57 |
| Data fetching | TanStack Query v5 |
| Client state | Zustand v5 |
| Images | expo-image |
| Gradients | expo-linear-gradient |
| Haptics | expo-haptics |
| Icons | @expo/vector-icons (Ionicons) |
| Fonts | Inter (4 weights) |
| Gestures | react-native-gesture-handler |
| Animation library | react-native-reanimated (installed, minimal usage) |

### Installed but not yet integrated

| Technology | Status |
|------------|--------|
| NativeWind + Tailwind CSS | Installed; no `tailwind.config.js` or component usage |
| Supabase JS client | Client stub only; falls back when env vars missing |
| React Hook Form + Zod + @hookform/resolvers | Installed; no forms built yet |
| expo-blur | Installed; unused |
| react-native-svg | Installed; unused |
| expo-symbols | In legacy template files only |

---

## Documentation Created

| File | Purpose |
|------|---------|
| [`docs/DESIGN_ANALYSIS.md`](./DESIGN_ANALYSIS.md) | UI inspiration review — what works, what doesn't, improvements |
| [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) | IA, user journey, database schema overview, API architecture, folder structure, phase plan |
| [`docs/DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | Colour palette, typography, spacing, components, animations, accessibility |
| [`docs/PROJECT_STATUS.md`](./PROJECT_STATUS.md) | This document |
| [`familypilot/README.md`](../familypilot/README.md) | Setup instructions, project structure, roadmap |
| [`README.md`](../README.md) | Repo root pointer |

---

## Files & Folder Structure

### Repository layout

```
/workspace
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DESIGN_ANALYSIS.md
│   ├── DESIGN_SYSTEM.md
│   └── PROJECT_STATUS.md
└── familypilot/                    # Expo app root
    ├── app/                        # Expo Router screens
    ├── src/                        # Application source
    ├── supabase/migrations/        # Database schema
    ├── assets/                     # Fonts, icons, splash
    ├── components/                 # Legacy Expo template (unused)
    ├── constants/                  # Legacy Expo template (unused)
    └── package.json
```

### Screens (`familypilot/app/`)

| File | Route | Status |
|------|-------|--------|
| `_layout.tsx` | Root stack | ✅ QueryClient, fonts, gesture handler |
| `(tabs)/_layout.tsx` | Tab navigator | ✅ 5 tabs configured |
| `(tabs)/index.tsx` | `/` Home | ✅ Full implementation |
| `(tabs)/explore.tsx` | `/explore` | ✅ Filters + list; map placeholder |
| `(tabs)/trips.tsx` | `/trips` | ✅ Timeline view |
| `(tabs)/saved.tsx` | `/saved` | ✅ Grouped saved items |
| `(tabs)/profile.tsx` | `/profile` | ✅ Family profile + completion ring |
| `venue/[id].tsx` | `/venue/:id` | ✅ Airbnb-style detail |
| `need-now.tsx` | `/need-now` | ✅ Emergency assistant |
| `holiday.tsx` | `/holiday` | ✅ Provider comparison |
| `packing.tsx` | `/packing` | ✅ Checklist |
| `car-fit.tsx` | `/car-fit` | ✅ Boot capacity checker |
| `+not-found.tsx` | 404 | ✅ Expo default |
| `+html.tsx` | Web HTML | ✅ Expo default |

**Not created:** `concierge.tsx` (registered in root layout but file missing — will 404)

**Removed:** `modal.tsx`, `(tabs)/two.tsx` (Expo template defaults)

### Design system (`familypilot/src/design-system/tokens/`)

| File | Exports |
|------|---------|
| `colors.ts` | Primary purple, secondary green, accent blue, semantic colours |
| `typography.ts` | 8 text variants, Inter font family names |
| `spacing.ts` | 4px-base scale, `screenPadding: 20` |
| `radius.ts` | sm → full pill |
| `shadows.ts` | card, cardHover, bottomSheet |
| `index.ts` | Re-exports all tokens |

### UI components (`familypilot/src/components/`)

| Component | Path | Purpose |
|-----------|------|---------|
| `Text` | `ui/Text.tsx` | Typed typography variants |
| `Button` | `ui/Button.tsx` | primary/secondary/ghost/outline + haptics |
| `Card` | `ui/Card.tsx` | White surface with shadow |
| `FamilyScoreBadge` | `ui/FamilyScoreBadge.tsx` | Green circular score (USP) |
| `Chip` | `ui/Chip.tsx` | Selectable filter pill |
| `SectionHeader` | `ui/SectionHeader.tsx` | Title + optional "See all" |
| `BackButton` | `ui/BackButton.tsx` | Accessible back navigation |
| `QuickActionButton` | `home/QuickActionButton.tsx` | Home grid item |
| `QuickActionGrid` | `home/QuickActionGrid.tsx` | 4+4 action layout |
| `RecommendationCarousel` | `home/RecommendationCarousel.tsx` | Horizontal venue scroll |
| `VenueCard` | `shared/VenueCard.tsx` | Carousel + list variants |
| `ScreenContainer` | `shared/ScreenContainer.tsx` | Safe area + header |
| `FacilityGrid` | `venue/FacilityGrid.tsx` | Icon grid for venue facilities |
| `WhyRecommend` | `venue/WhyRecommend.tsx` | Explainable recommendation block |

**Not yet built:** SearchBar, BottomSheet, Avatar/AvatarGroup, Skeleton, ProgressRing (inline in Profile only), TripTimeline (inline in Trips), Input, Modal, FilterSheet

### Services & data (`familypilot/src/`)

| File | Purpose |
|------|---------|
| `types/index.ts` | All TypeScript interfaces (Venue, FamilyProfile, Trip, etc.) |
| `data/mock-data.ts` | Realistic mock data (Aidan, Sloane, Ozzie; Bushey, UK) |
| `services/api/index.ts` | Mock service layer (family, weather, venues, trips, etc.) |
| `services/providers/interfaces.ts` | Provider contracts (places, weather, maps, holidays, inventory, AI) |
| `services/scoring/family-score.ts` | Weighted Family Score algorithm |
| `services/supabase/client.ts` | Supabase client stub |
| `hooks/use-queries.ts` | TanStack Query hooks for all services |
| `stores/family-store.ts` | Zustand — family profile |
| `stores/filters-store.ts` | Zustand — explore filter chips |

### Database (`familypilot/supabase/migrations/`)

| File | Contents |
|------|----------|
| `001_initial_schema.sql` | 14 tables, RLS policies, indexes |

---

## Design System

Full spec in [`docs/DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

### Colour palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#8B6FC0` | Buttons, active tab, links |
| Secondary | `#5CB88A` | Family Score, success |
| Accent | `#6BB8E8` | Info, categories |
| Warning | `#E8A54B` | Need Now, alerts |
| Error | `#D4756A` | Errors, closed |
| Background | `#F8F7F5` | Screen background |
| Surface | `#FFFFFF` | Cards |

### Typography

Inter — 8 variants: `display`, `heading1–3`, `body`, `bodySmall`, `caption`, `label`

### Spacing & radius

4px base grid. Screen padding 20px. Card radius 16px. Score badge fully round.

### Animation guidelines (documented, not implemented)

- Screen enter: fade + slide up 300ms
- Card press: scale 0.97 spring
- Bottom sheet: spring 350ms
- Haptics: light on press, success on save

### Accessibility guidelines (documented, partially applied)

- WCAG AA contrast targets defined
- `accessibilityLabel` on interactive components
- 44pt minimum touch targets on buttons
- Family Score announced as "X out of 100"

---

## Features Implemented

### Navigation ✅

- [x] Bottom tab bar: Home, Explore, Trips, Saved, Profile
- [x] Stack navigation for feature screens
- [x] Back navigation on all stack screens
- [x] Route registration for concierge modal (screen not built)

### Home screen ✅

- [x] Dynamic time-based greeting ("Good morning, Aidan")
- [x] Weather pill (temperature + condition icon)
- [x] "What would you like to do today?" section
- [x] 8 quick actions (4 primary + 4 secondary) with coloured icons
- [x] 3 recommendation carousels (Recommended, Weekend ideas, Rainy day ideas)
- [x] Venue cards with Family Score, drive time, one-line reason

### Explore screen ✅ (partial)

- [x] Filter chips (All, Parks, Cafés, Playgrounds, Indoor, Free)
- [x] Chip toggle state via Zustand
- [x] Nearby venue list with Family Score cards
- [ ] **Map view** — placeholder only ("connect Mapbox in Phase 4")
- [ ] Filter chips do not yet filter the list
- [ ] Bottom sheet over map (Apple Maps pattern)

### Venue detail screen ✅

- [x] Full-bleed hero image with gradient overlay
- [x] Family Score badge on hero
- [x] Drive time + address
- [x] "Perfect for your family" explainable block
- [x] Facilities icon grid
- [x] Detail rows (ages, terrain, hours, parking, spend)
- [x] Sticky footer: Save + Directions buttons (non-functional)
- [ ] Photo gallery swipe
- [ ] Save/Directions actions wired up

### Trips screen ✅

- [x] Trip card with vertical timeline
- [x] Stop thumbnails, times, subtitles
- [ ] Create/edit trips
- [ ] Auto-estimate driving, cost, weather, parking

### Saved screen ✅

- [x] Items grouped by type (Places, Restaurants)
- [ ] Save/unsave from venue screen
- [ ] Hotels, Shops categories (no mock data yet)

### Profile screen ✅

- [x] Family avatar cluster
- [x] Profile completion progress bar (72%)
- [x] Children list with ages
- [x] Preferences (location, max drive, budget)
- [ ] Edit profile
- [ ] Vehicle, equipment, memberships sections
- [ ] Onboarding for incomplete profiles

### Need Something Now ✅

- [x] Quick filters (Formula, Wipes, Nappies, Calpol, Medicine)
- [x] Nearest stores with drive time, open/closed, stock notes
- [ ] Filters do not yet filter results
- [ ] Search bar
- [ ] Real inventory API

### Holiday planner ✅

- [x] Search summary header (Tenerife, Aug 2026)
- [x] "We recommend Jet2" banner with reasons
- [x] Provider cards with price, score, highlights
- [ ] Multi-step flow (Where, When, Family, Results)
- [ ] Real provider API aggregation
- [ ] Booking flow

### Packing list ✅

- [x] Categorised checklist (Essentials, Baby, Kids, Toiletries)
- [x] Packed/unpacked visual state
- [x] Progress summary
- [ ] Toggle packed state (display only)
- [ ] Auto-generate from trip + weather + children

### Car fit checker ✅

- [x] Vehicle name + boot capacity
- [x] FITS / DOESN'T FIT status
- [x] Capacity bar (used vs total litres)
- [x] Equipment list with individual fit status
- [x] Boot photo
- [ ] 3D boot visualisation (future)
- [ ] Add/edit equipment
- [ ] Roof box recommendation logic

### Family Score ✅ (algorithm only)

- [x] Weighted factor model (7 factors)
- [x] Explainable string generation with child names
- [x] Mock scores on all venue/card data
- [ ] Server-side edge function
- [ ] Score caching in Supabase `venue_scores` table
- [ ] Weather-aware recalculation

### Mock API layer ✅

- [x] All screens fed via TanStack Query + mock services
- [x] Simulated network delay (100–400ms)
- [x] Typed responses throughout

---

## Features Not Yet Implemented

### Phase 2 — UX & Concierge

- [ ] **Family Concierge** modal screen (`/concierge`) — "We've got three hours free"
- [ ] **Onboarding flow** — minimal profile setup (postcode + children ages)
- [ ] **Reanimated animations** — screen enter, card press, carousel stagger
- [ ] **Filter sheet** on Explore — detailed filters (age, distance, cost, facilities)
- [ ] **Search bar** on Explore and Need Now
- [ ] **Empty states** with illustrations
- [ ] **Splash / intro screen** (redesigned — emotional hero, not feature list)
- [ ] NativeWind integration (installed but unconfigured)

### Phase 3 — Backend & Auth

- [ ] Supabase authentication (sign up, sign in, session)
- [ ] Profile CRUD wired to Supabase
- [ ] Family members, vehicles, equipment management
- [ ] Saved items sync (save/unsave)
- [ ] Trip CRUD
- [ ] Packing list persistence
- [ ] React Hook Form + Zod validation on all forms

### Phase 4 — External APIs

- [ ] **Mapbox or Google Maps** — real map on Explore
- [ ] **Google Places / Foursquare** — real venue data via `IPlacesProvider`
- [ ] **OpenWeather** — live weather via `IWeatherProvider`
- [ ] **Directions** — open native maps from venue screen
- [ ] Family Score **Supabase Edge Function**
- [ ] Provider implementations replacing mock services

### Phase 5 — Advanced Features

- [ ] **Holiday aggregator** — Jet2, TUI, Loveholidays, EasyJet, Booking.com APIs
- [ ] **Inventory API** — real stock data for Need Now
- [ ] **AI Concierge** — invisible AI via `IAIProvider` (not ChatGPT-style)
- [ ] **Push notifications** — trip reminders, passport expiry
- [ ] **Nap time awareness** in recommendations

### Future features (from product brief — not started)

- [ ] Family budget tracker
- [ ] Toy recommendations
- [ ] Birthday planning
- [ ] Calendar integration
- [ ] Memories / photo journal
- [ ] School holidays calendar
- [ ] Travel documents vault
- [ ] Car seat reminders
- [ ] Outgrown clothing reminders
- [ ] Passport expiry alerts
- [ ] Community updates
- [ ] Baby milestones
- [ ] Holiday countdown
- [ ] Crowd prediction for parks
- [ ] 3D boot visualisation

---

## Product Direction V2 — Planned (NOT implemented)

Full specifications: **[PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md)**

These features are on the roadmap **after parent user testing**. None are built yet.

| Feature | Status | Priority (post-feedback) |
|---------|--------|--------------------------|
| **Eat Nearby** — restaurants ranked after activities | ⬜ Planned | 1 |
| **Family-friendly restaurants** — first-class category + attributes | ⬜ Planned | 1 |
| **Accessibility** — venue fields, profile preferences, filters | ⬜ Planned | 2 |
| **SEND-friendly** — factual venue attributes, filters | ⬜ Planned | 3 |
| **Meet Another Family** — one-phone two-location mode | ⬜ Planned | 4 |
| **Plan Your Day** — itinerary builder with swap/save/share | ⬜ Planned | 5 |
| **Connected Families** — invite other profiles | ⬜ Planned | 6 (future) |
| **Combined Family Match** — for meetups | ⬜ Planned | With Meetups |
| **Shareable meetup/day plans** — no account required to read | ⬜ Planned | With Meetups / Plan Your Day |
| **Explore** — expanded categories + accessibility/SEND filters | ⬜ Planned | With §2–3 |
| **Venue detail** — Accessibility, SEND, Eat nearby, Meet here sections | ⬜ Planned | With §2–3 |
| **Profile** — progressive accessibility/SEND/dining preferences | ⬜ Planned | With §2–3 |

### V2 data model (planned, not migrated)

- `accessibility_features`, `send_features`, `restaurant_features`
- `meetup_plans`, `day_plans`
- `family_connections` (future architecture only)

See [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) §11 for schema sketches and privacy rules.

---

## Database & API Layer

### Supabase schema (written, not deployed)

**14 tables** in `001_initial_schema.sql`:

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (name, location, budget, max drive) |
| `family_members` | Parents and children |
| `family_vehicles` | Cars with boot dimensions |
| `family_equipment` | Pushchairs, car seats, suitcases |
| `memberships` | National Trust, Blue Light, etc. |
| `interests` | Family interests |
| `venues` | Cached external venue data |
| `venue_facilities` | Facility flags per venue |
| `venue_photos` | Photo URLs |
| `venue_scores` | Cached personalised scores |
| `trips` | Planned/past trips |
| `trip_stops` | Timeline stops |
| `packing_lists` | Packing list headers |
| `packing_items` | Checklist items |
| `saved_items` | Favourited places/searches |
| `holiday_searches` | Holiday search params |
| `holiday_offers` | Aggregated offers |

**RLS:** All user data scoped to `auth.uid()`. Venues publicly readable.

### Provider interfaces (defined, no implementations)

| Interface | Purpose | Implementation |
|-----------|---------|----------------|
| `IPlacesProvider` | Venue search + detail | Mock only |
| `IWeatherProvider` | Current weather | Mock only |
| `IMapsProvider` | Drive time + directions | Not implemented |
| `IHolidayProvider` | Holiday search | Mock only |
| `IInventoryProvider` | Nearby stock | Mock only |
| `IAIProvider` | Concierge recommendations | Not implemented |

### TanStack Query keys (defined)

```
['family', 'profile']
['weather', 'current']
['venues', 'nearby']
['venues', id]
['recommendations', 'home']
['trips']
['saved']
['inventory', 'nearby']
['car-fit']
['packing']
['holidays']
```

---

## Dependencies Installed vs Unused

| Package | Installed | Used in code |
|---------|-----------|--------------|
| `@tanstack/react-query` | ✅ | ✅ Root layout, all hooks |
| `zustand` | ✅ | ✅ family-store, filters-store |
| `@supabase/supabase-js` | ✅ | ⚠️ Client stub only |
| `@expo-google-fonts/inter` | ✅ | ✅ Root layout |
| `@expo/vector-icons` | ✅ | ✅ Throughout |
| `expo-image` | ✅ | ✅ Venue cards, heroes |
| `expo-linear-gradient` | ✅ | ✅ Venue hero |
| `expo-haptics` | ✅ | ✅ Button, chips, cards |
| `react-native-gesture-handler` | ✅ | ✅ Root layout |
| `react-native-reanimated` | ✅ | ⚠️ Imported in root; no animations |
| `react-hook-form` | ✅ | ❌ Not used |
| `zod` | ✅ | ❌ Not used |
| `@hookform/resolvers` | ✅ | ❌ Not used |
| `nativewind` | ✅ | ❌ Not configured |
| `tailwindcss` | ✅ | ❌ Not configured |
| `expo-blur` | ✅ | ❌ Not used |
| `react-native-svg` | ✅ | ❌ Not used |

---

## Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Design system, docs, navigation, screens, mock API, DB schema | ✅ Complete |
| **2 remediation** | Production fixes, Home simplification, Family Match, parent testing prep | ✅ Complete |
| **Testing** | 5–10 parent feedback sessions via [PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md) | 🔄 **Current** |
| **V2 — Priority 1** | Restaurants + Eat Nearby | ⬜ After feedback |
| **V2 — Priority 2** | Accessibility fields + filters | ⬜ After feedback |
| **V2 — Priority 3** | SEND-friendly data + filters | ⬜ After feedback |
| **V2 — Priority 4** | Meet Another Family (one-phone) | ⬜ After feedback |
| **V2 — Priority 5** | Plan Your Day | ⬜ After feedback |
| **3** | Supabase auth, profile CRUD, saved sync, forms | ⬜ Not started |
| **4** | Maps, Places API, weather, directions, score edge function | ⬜ Not started |
| **5** | Holiday APIs, inventory, AI concierge, push notifications | ⬜ Not started |
| **V2 — Priority 6** | Connected Families | ⬜ Future |
| **Future** | Budget, toys, calendar, memories, milestones, etc. | ⬜ Not started |

Roadmap detail and dependencies: [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) §13–14.

---

## How to Run

```bash
cd familypilot
npm install
npm start
```

- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go on device

**No environment variables required** for Phase 1 — all data is mocked.

TypeScript check:

```bash
cd familypilot && npx tsc --noEmit
```

---

## Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_MAPBOX_TOKEN=
EXPO_PUBLIC_GOOGLE_PLACES_KEY=
```

When unset, the app silently uses mock data.

---

## Known Gaps & Technical Debt

1. **`concierge.tsx` missing** — registered in `app/_layout.tsx` but file does not exist; navigating to `/concierge` will 404.
2. **Legacy Expo template files** remain in `familypilot/components/` and `familypilot/constants/` — unused, should be removed.
3. **NativeWind installed but not configured** — no `tailwind.config.js`, `babel.config.js`, or `global.css`.
4. **Explore filters don't filter** — Zustand state toggles but list is not filtered.
5. **Need Now filters don't filter** — chips are visual only.
6. **Packing list items not toggleable** — display-only packed state.
7. **Save/Directions buttons** on venue screen have no handlers.
8. **Family Score algorithm** exists but mock data uses hardcoded scores; algorithm not wired to live calculation.
9. **No tests** — no unit, integration, or E2E tests.
10. **No CI/CD** — no GitHub Actions, EAS Build config, or App Store pipeline.
11. **No error/loading states** — most screens assume data loads successfully.
12. **No dark mode** — design system is light-mode only (legacy `useColorScheme` from template unused).
13. **Web support** — Expo web configured but not tested or optimised.

---

## Git & PR Status

| Item | Detail |
|------|--------|
| Production branch | `main` |
| Production URL | https://family-pilot-seven.vercel.app/ |
| Deployed app commit | `ec41951` (remediation + tester readiness + venue rewrite) |
| Docs commit | `9df27ec` (post-deployment QA + screenshots) |
| Open PRs | None required for documentation-only updates |

---

## Documentation index

### Product constitution (read first)

| Document | Purpose |
|----------|---------|
| [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) | **Canonical product vision — the constitution** |
| [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) | Build / no-build gates for every change |
| [MVP_SCOPE.md](./MVP_SCOPE.md) | What is in scope for parent testing today |
| [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md) | Prioritised backlog with scope labels |
| [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md) | Phases 1–8 delivery plan |
| [VISION_2030.md](./VISION_2030.md) | Long-term north star |
| [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) | Detailed feature specifications (planned) |
| [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) | Navigation & screen hierarchy |
| [FAMILY_MATCH.md](./FAMILY_MATCH.md) | Scoring model & explainability |
| [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) | Extensible schema for future features |
| [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) | Privacy rules for location & sensitive prefs |

### Engineering & QA

| Document | Purpose |
|----------|---------|
| [PHASE_2_REMEDIATION.md](./PHASE_2_REMEDIATION.md) | Remediation changelog + production QA |
| [PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md) | Tester instructions |
| [DESIGN_AUDIT.md](./DESIGN_AUDIT.md) | Pre-remediation design audit |
| [BACKLOG.md](./BACKLOG.md) | Quick reference — see FUTURE_BACKLOG for full list |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture |

---

*This document should be updated at the end of each phase.*
