# FamilyPilot — Database Future

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Status:** Schema planning — extend existing Supabase migration; **do not deploy all tables at once**

Current schema: `familypilot/supabase/migrations/001_initial_schema.sql` (14 tables, MVP)

---

## Design principles

1. **Extensible, not premature** — Add tables when a phase is prioritised
2. **Provider-agnostic** — `provider` + `external_id` on external entities
3. **Family-scoped** — RLS on all user data via `family_id`
4. **Explainability storage** — Scores as JSONB with factors + explanation
5. **Verified flags** — Accessibility, SEND, offers require `verified`, `source`, `updated_at`
6. **Venue-centric** — Restaurants are venues with extended attributes, not a separate silo

---

## Current schema (MVP — deployed in migration file)

| Table | Purpose |
|-------|---------|
| `profiles` | Parent account, home area, budget, max drive |
| `family_members` | Parents and children |
| `family_vehicles` | Cars, boot volume |
| `family_equipment` | Pushchairs, seats, luggage |
| `memberships` | National Trust, etc. |
| `interests` | Family interests |
| `venues` | Cached places (all categories) |
| `venue_facilities` | Facility flags |
| `venue_photos` | Images |
| `venue_scores` | Cached personalised scores |
| `trips` | Trip headers |
| `trip_stops` | Timeline stops |
| `packing_lists` / `packing_items` | Packing |
| `saved_items` | Favourites |
| `holiday_searches` / `holiday_offers` | Holiday comparison |

---

## Phase 3 — Restaurant extensions (Post-MVP)

### Option A: Extend `venues` + new `restaurant_features`

```sql
-- restaurant_features (1:1 with venue where category IN restaurant, cafe)
CREATE TABLE restaurant_features (
  venue_id          UUID PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  kids_menu         BOOLEAN,
  high_chairs       BOOLEAN,
  baby_changing     BOOLEAN,
  pushchair_space   BOOLEAN,
  play_area         BOOLEAN,
  outdoor_seating   BOOLEAN,
  accessible_toilet BOOLEAN,
  noise_level       TEXT,           -- 'quiet' | 'moderate' | 'lively' | estimated
  estimated_spend   TEXT,           -- e.g. '£30–£45'
  booking_recommended BOOLEAN,
  dietary_options   JSONB,          -- ['vegetarian', 'gluten_free'] — factual only
  children_offers   JSONB,          -- verified offers only
  verified          BOOLEAN DEFAULT false,
  source            TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Activity → restaurant links
CREATE TABLE venue_nearby_restaurants (
  activity_venue_id   UUID REFERENCES venues(id),
  restaurant_venue_id UUID REFERENCES venues(id),
  drive_minutes       INT,
  sort_rank           INT,
  PRIMARY KEY (activity_venue_id, restaurant_venue_id)
);
```

**Scope label:** Post-MVP

---

## Phase 4 — Accessibility (Post-MVP)

```sql
CREATE TYPE accessibility_feature_type AS ENUM (
  'step_free_access',
  'wheelchair_accessible',
  'accessible_toilet',
  'changing_places',
  'accessible_parking',
  'disabled_parking_bays',
  'lift',
  'accessible_entrance',
  'flat_paths',
  'accessible_seating',
  'carer_facilities',
  'wheelchair_play_equipment'
);

CREATE TABLE accessibility_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  feature_type  accessibility_feature_type NOT NULL,
  verified      BOOLEAN DEFAULT false,
  source        TEXT,
  notes         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (venue_id, feature_type)
);

-- Outdoor terrain (on venues or separate)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS terrain_type TEXT;
  -- 'flat' | 'mostly_flat' | 'mixed' | 'hilly' | 'very_hilly'
ALTER TABLE venues ADD COLUMN IF NOT EXISTS path_surface TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS max_gradient TEXT;
```

### Profile preferences

```sql
CREATE TABLE family_accessibility_preferences (
  family_id     UUID PRIMARY KEY REFERENCES families(id),
  requirements  JSONB NOT NULL,  -- { step_free_required: true, ... }
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

**Scope label:** Post-MVP

---

## Phase 5 — SEND (Post-MVP)

```sql
CREATE TYPE send_feature_type AS ENUM (
  'sensory_friendly_session',
  'autism_friendly_session',
  'reduced_noise_session',
  'quiet_area',
  'sensory_room',
  'low_light_session',
  'visual_schedules',
  'smaller_groups',
  'ear_defenders_available',
  'send_trained_staff',
  'carer_tickets',
  'flexible_entry',
  'queue_assistance'
);

CREATE TABLE send_features (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  feature_type     send_feature_type NOT NULL,
  schedule_details TEXT,            -- e.g. 'Sundays 9–10am'
  verified         BOOLEAN DEFAULT false,
  source           TEXT,
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE family_send_preferences (
  family_id     UUID PRIMARY KEY REFERENCES families(id),
  preferences   JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

**Scope label:** Post-MVP

---

## Phase 6–7 — Plans & meetups (Post-MVP)

```sql
CREATE TABLE meetup_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id  UUID REFERENCES profiles(id),
  family_a_area       TEXT NOT NULL,     -- postcode/general area — not full address in share
  family_b_area       TEXT NOT NULL,
  family_a_ages       JSONB,
  family_b_ages       JSONB,
  selected_venue_id   UUID REFERENCES venues(id),
  restaurant_venue_id UUID REFERENCES venues(id),
  planned_date        DATE,
  share_token         TEXT UNIQUE,
  combined_score      JSONB,             -- breakdown
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE day_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID REFERENCES families(id),
  title               TEXT,
  planned_date        DATE,
  stops               JSONB NOT NULL,    -- ordered stops with times
  total_cost_estimate TEXT,
  total_drive_minutes INT,
  total_duration_minutes INT,
  weather_summary     TEXT,
  status              TEXT DEFAULT 'draft',  -- draft | saved | completed
  share_token         TEXT UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

**Scope label:** Post-MVP (Phase 6–7)

---

## Phase 8 — Connected families (Future Vision)

```sql
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE family_connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_a_id UUID NOT NULL REFERENCES families(id),
  family_b_id UUID NOT NULL REFERENCES families(id),
  status      connection_status DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (family_a_id, family_b_id)
);

-- Shared planning permissions
CREATE TABLE connection_permissions (
  connection_id UUID REFERENCES family_connections(id),
  can_view_preferences BOOLEAN DEFAULT false,
  can_plan_together    BOOLEAN DEFAULT false
);
```

**Scope label:** Future Vision

---

## Cross-cutting extensions

### Profile — dining preferences (Phase 3+)

```sql
CREATE TABLE family_dining_preferences (
  family_id   UUID PRIMARY KEY REFERENCES families(id),
  dietary     JSONB,   -- vegetarian, halal, allergies as *preferences* not safety claims
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### Family DNA™ (Long-term Research)

```sql
-- Behavioural patterns — opt-in, transparent, editable
CREATE TABLE family_insights (
  family_id   UUID PRIMARY KEY REFERENCES families(id),
  patterns    JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### Deals (Long-term Research)

```sql
CREATE TABLE verified_offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID REFERENCES venues(id),
  offer_type  TEXT,
  description TEXT,
  valid_from  DATE,
  valid_to    DATE,
  verified    BOOLEAN DEFAULT false,
  source      TEXT
);
```

---

## Venue model evolution

`venues.category` should support:

`park | playground | soft_play | farm | museum | walk | beach | attraction | restaurant | cafe | hotel | shop | event`

Single table keeps Family Match and Explore unified.

---

## RLS summary

| Data | Access |
|------|--------|
| `venues`, public attributes | Read: authenticated + anon (cached) |
| `venue_scores`, plans, prefs | Read/write: owning family only |
| `meetup_plans` share_token | Read: token holder (public link) — **no home addresses** |
| `family_connections` | Read: participating families only |

Detail: [PRIVACY_MODEL.md](./PRIVACY_MODEL.md)

---

## Migration strategy

1. **Do not** apply all migrations before phase is prioritised
2. Each phase gets its own migration file (`002_restaurants.sql`, etc.)
3. Mock layer in app prototypes new shapes before DB deploy
4. Backfill scripts for verified accessibility/SEND data — manual curation initially

---

## App layer alignment

| Layer | File |
|-------|------|
| Types | `src/types/index.ts`, `src/types/places.ts` |
| Mock | `src/data/mock-data.ts` (retained as fallback) |
| Services | `src/services/places/places-repository.ts` |
| Providers | `src/services/providers/places-provider.ts`, `server/places/*` |
| Scoring | `src/services/scoring/family-score.ts` |
| Provenance | [DATA_PROVENANCE.md](./DATA_PROVENANCE.md) |

---

*Build extensible models. Implement when prioritised. See [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).*
