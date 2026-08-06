# FamilyPilot — Project Status Summary

**Last updated:** 6 August 2026  
**Branch:** `cursor/familypilot-foundation-1a85`  
**Pull Request:** [#1 — FamilyPilot Phase 1](https://github.com/aidanshaw92/FamilyPilot/pull/1) (draft)

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

FamilyPilot Phase 1 establishes the **foundation** for a premium consumer React Native app — the "operating system for family life." This phase delivered:

- Complete product/design analysis based on UI inspiration mockups
- Full architecture documentation (IA, database, API, folder structure)
- A token-based design system and reusable UI component library
- **10 production-ready screens** wired to a mock API layer
- Supabase database schema (SQL migration, not yet connected)
- Provider interfaces and Family Score algorithm (client-side, not yet deployed as edge function)

**What works today:** The app runs in Expo with mock data — navigation, personalised home screen, venue details, utility screens (packing, car fit, need now, holidays), and tab-based browsing all function without backend credentials.

**What does not work yet:** Real authentication, live maps, external API integrations, AI concierge, push notifications, onboarding, and all "future features" from the product brief.

---

## Product Vision Recap

FamilyPilot is **not** another parenting app, booking app, or AI chatbot. It is the single app parents open when making family decisions — powered by one **family profile** that personalises everything.

**Core philosophy:** The user should almost never need to type. The app proactively recommends based on children’s ages, weather, location, budget, and driving distance.

**Key differentiator:** **Family Score** — an explainable, personalised score (0–100) for parks, hotels, restaurants, trips, and more.

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
| **1** | Design system, docs, navigation, 10 screens, mock API, DB schema | ✅ **Complete** |
| **2** | Concierge, onboarding, animations, filter sheet, search | ⬜ Not started |
| **3** | Supabase auth, profile CRUD, saved sync, forms | ⬜ Not started |
| **4** | Maps, Places API, weather, directions, score edge function | ⬜ Not started |
| **5** | Holiday APIs, inventory, AI concierge, push notifications | ⬜ Not started |
| **Future** | Budget, toys, calendar, memories, milestones, etc. | ⬜ Not started |

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
| Branch | `cursor/familypilot-foundation-1a85` |
| Base | `main` |
| PR | [#1 (draft)](https://github.com/aidanshaw92/FamilyPilot/pull/1) |
| Commit | `feat: FamilyPilot Phase 1 — design system, navigation, and core screens` |
| Files changed | 74 files, ~14,000 lines |

---

*This document should be updated at the end of each phase.*
