# FamilyPilot

The operating system for family life — a premium React Native app that helps parents make decisions from one family profile.

## Phase 1 (Current)

- Complete design system with tokens, typography, and component library
- 5-tab navigation: Home, Explore, Trips, Saved, Profile
- Production-ready screens with mock API layer
- Family Score as core USP with explainable recommendations
- Feature screens: Venue Detail, Need Now, Holiday Planner, Packing List, Car Fit Checker
- Supabase schema and provider interfaces for future integration

## Tech Stack

- **React Native** + **Expo** (SDK 57)
- **Expo Router** (file-based navigation)
- **TypeScript** (strict mode)
- **TanStack Query** (data fetching)
- **Zustand** (client state)
- **Supabase** (backend — schema ready)
- **React Hook Form** + **Zod** (forms — Phase 3)

## Getting Started

```bash
cd familypilot
npm install
npm start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

## Project Structure

```
familypilot/
├── app/                    # Expo Router screens
├── src/
│   ├── design-system/      # Tokens, theme
│   ├── components/         # UI library
│   ├── services/           # API + providers
│   ├── stores/             # Zustand
│   ├── hooks/              # TanStack Query hooks
│   └── types/              # TypeScript interfaces
├── supabase/migrations/    # Database schema
└── docs/                   # Architecture & design docs
```

## Documentation

- [Design Analysis](../docs/DESIGN_ANALYSIS.md) — UI inspiration review
- [Architecture](../docs/ARCHITECTURE.md) — Database, API, folder structure
- [Design System](../docs/DESIGN_SYSTEM.md) — Tokens, components, animations

## Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_MAPBOX_TOKEN=
EXPO_PUBLIC_GOOGLE_PLACES_KEY=
```

Without env vars, the app uses mock data (development mode).

## Roadmap

| Phase | Features |
|-------|----------|
| 1 ✅ | Design system, navigation, all core screens |
| 2 | Family Concierge, onboarding flow, animations |
| 3 | Supabase auth, profile CRUD, saved items sync |
| 4 | Mapbox maps, Google Places, Family Score edge function |
| 5 | Holiday aggregator APIs, AI concierge, push notifications |
