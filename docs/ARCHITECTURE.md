# FamilyPilot — Technical Architecture

## Information Architecture

```
FamilyPilot
├── Home (proactive recommendations)
├── Explore (map + list + filters)
├── Trips (planned & past)
├── Saved (places, restaurants, hotels, searches)
├── Profile (family profile hub)
│
├── Venue Detail (stack)
├── Need Something Now (stack)
├── Plan Holiday (stack flow)
├── Packing List (stack)
├── Car Fit Checker (stack)
├── Trip Planner (stack)
└── Family Concierge (modal)
```

### Navigation Model

- **Tab navigator** (5 tabs): Home, Explore, Trips, Saved, Profile
- **Stack navigator** (root): tabs + all feature screens
- **Modal navigator**: Concierge, filters sheet, quick actions

Deep links: `familypilot://venue/{id}`, `familypilot://trip/{id}`

---

## User Journey (Core Loop)

```
Install → Onboarding (family profile) → Home (personalised)
    ↓
Quick action OR recommendation card
    ↓
Venue / Product / Holiday detail (Family Score + Why)
    ↓
Save / Directions / Book / Add to Trip
    ↓
Trip planner assembles day → Push notification reminders (future)
```

**Cold start journey:** Minimal profile (postcode + children ages) → immediate recommendations. Profile completion nudged via progress ring, never blocking.

---

## Database Architecture (Supabase / PostgreSQL)

### Core Tables

```sql
-- Users & families
profiles          (id, user_id, first_name, home_location, budget_tier, max_drive_minutes)
families          (id, profile_id, name)
family_members    (id, family_id, name, role, date_of_birth, school, nursery)
family_vehicles   (id, family_id, make, model, boot_volume_litres, boot_dimensions)
family_equipment  (id, family_id, type, name, dimensions, weight_kg)
memberships       (id, family_id, provider, membership_number)
interests         (id, family_id, category, value)

-- Venues & places (provider-agnostic)
venues            (id, external_id, provider, name, lat, lng, category, ...)
venue_facilities  (id, venue_id, facility_type, available, notes)
venue_photos      (id, venue_id, url, sort_order)
venue_scores      (id, venue_id, family_id, score, factors JSONB, explanation)

-- Trips & planning
trips             (id, family_id, title, start_date, end_date, status)
trip_stops        (id, trip_id, venue_id, sort_order, start_time, notes)
packing_lists     (id, trip_id, family_id)
packing_items     (id, packing_list_id, category, name, quantity, packed)

-- Saved & history
saved_items       (id, family_id, item_type, item_id, created_at)
search_history    (id, family_id, query_type, params JSONB)

-- Holidays (aggregated from providers)
holiday_searches  (id, family_id, destination, dates, travellers)
holiday_offers    (id, search_id, provider, price, score, factors JSONB)
```

### Row Level Security

All tables scoped by `family_id` → `profile.user_id = auth.uid()`.

### Provider Abstraction

External data stored with `provider` + `external_id` columns. Never couple business logic to a single API.

---

## API Architecture

```
┌─────────────────────────────────────────────────┐
│                   React Native App               │
├─────────────────────────────────────────────────┤
│  Screens → Hooks (TanStack Query) → Services    │
├─────────────────────────────────────────────────┤
│              Provider Interfaces                 │
│  IPlacesProvider  IWeatherProvider  IMapsProvider│
│  IHolidayProvider IInventoryProvider IAIProvider │
├─────────────────────────────────────────────────┤
│              Implementations                     │
│  GooglePlaces     OpenWeather     Mapbox         │
│  Mock (dev)       Mock            Google Maps    │
└─────────────────────────────────────────────────┘
                          │
                    Supabase (auth, profile, saved, scores cache)
```

### Service Layer Pattern

```typescript
// Every feature calls an interface, never a concrete API
interface IPlacesProvider {
  searchNearby(params: PlaceSearchParams): Promise<Venue[]>;
  getVenue(id: string): Promise<VenueDetail>;
}

// Family Score computed server-side (Edge Function) or client-side from cached factors
interface IFamilyScoreService {
  calculate(venue: Venue, profile: FamilyProfile): FamilyScore;
}
```

### TanStack Query Keys

```
['family', 'profile']
['venues', 'nearby', filters]
['venues', id]
['recommendations', 'home']
['trips', familyId]
['saved', familyId]
['holidays', searchId]
['inventory', 'nearby', productType]
```

---

## Folder Structure

```
familypilot/
├── app/                          # Expo Router (file-based routing)
│   ├── _layout.tsx               # Root: providers, fonts, splash
│   ├── (tabs)/                   # Bottom tab screens
│   │   ├── index.tsx             # Home
│   │   ├── explore.tsx
│   │   ├── trips.tsx
│   │   ├── saved.tsx
│   │   └── profile.tsx
│   ├── venue/[id].tsx
│   ├── need-now.tsx
│   ├── holiday/
│   ├── packing/[tripId].tsx
│   ├── car-fit.tsx
│   └── concierge.tsx
│
├── src/
│   ├── design-system/
│   │   ├── tokens/               # colours, spacing, typography, shadows
│   │   ├── theme/                # ThemeProvider, useTheme
│   │   └── animations/           # Reanimated presets
│   │
│   ├── components/
│   │   ├── ui/                   # Button, Card, Badge, Text, Input, Sheet
│   │   ├── home/                 # QuickActionGrid, RecommendationCarousel
│   │   ├── explore/              # MapView, FilterBar, VenueListItem
│   │   ├── venue/                # HeroGallery, FacilityGrid, WhyRecommend
│   │   └── shared/               # FamilyScoreBadge, DriveTime, SafeArea
│   │
│   ├── features/                 # Feature-specific logic
│   │   ├── home/
│   │   ├── explore/
│   │   ├── venue/
│   │   ├── holidays/
│   │   ├── packing/
│   │   └── car-fit/
│   │
│   ├── services/
│   │   ├── api/                  # HTTP client, interceptors
│   │   ├── providers/            # IPlacesProvider implementations
│   │   ├── supabase/             # Supabase client + typed queries
│   │   └── scoring/              # Family Score algorithm
│   │
│   ├── stores/                   # Zustand stores
│   │   ├── family-store.ts
│   │   └── filters-store.ts
│   │
│   ├── hooks/                    # useFamilyProfile, useRecommendations
│   ├── types/                    # Strict TypeScript interfaces
│   ├── utils/                    # formatters, date helpers
│   └── data/                     # Mock data (dev only, API-driven in prod)
│
├── supabase/
│   └── migrations/001_initial_schema.sql
│
└── docs/
```

---

## Family Score Algorithm

```
score = weighted sum of:
  age_suitability    × 0.25
  accessibility      × 0.15  (pushchair, terrain, toilets)
  distance           × 0.15
  weather_fit        × 0.10
  budget_fit         × 0.10
  facilities_match   × 0.15
  popularity         × 0.10

Each factor: 0–100, normalised.
Explanation: top 3 factors with human-readable strings from profile data.
```

Stored as `factors: { age: 95, distance: 88, ... }` and `explanation: string[]`.

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Design system, navigation, Home, Explore, Venue, Profile, mock data | Current |
| **2** | Need Now, Car Fit, Packing, Trip Planner screens | Next |
| **3** | Supabase auth, profile CRUD, saved items | Planned |
| **4** | Real map provider, places API, Family Score edge function | Planned |
| **5** | Holiday aggregator, Concierge AI, push notifications | Planned |

---

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_MAPBOX_TOKEN=
EXPO_PUBLIC_GOOGLE_PLACES_KEY=
```

All providers check for env vars and fall back to mock data in development.
