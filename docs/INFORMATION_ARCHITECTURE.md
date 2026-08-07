# FamilyPilot — Information Architecture

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Status:** Current structure + planned extensions (not all built)

---

## IA principle

Navigation reflects **decisions**, not feature lists.

Primary tabs = ongoing family contexts.  
Stack screens = specific decision flows.  
Modals = focused tasks.

**Do not add tabs for every future feature.**

---

## Current navigation (MVP — built)

```
FamilyPilot
├── Home                    (tabs) — proactive recommendations
├── Explore                 (tabs) — discover places
├── Trips                   (tabs) — planned days
├── Saved                   (tabs) — saved places
├── Profile                 (tabs) — family profile hub
│
├── Venue Detail            (stack) — /venue/[id]
├── Need Something Now      (stack) — /need-now
├── Plan Holiday            (stack) — /holiday
├── Packing List            (stack) — /packing
├── Car Fit Checker         (stack) — /car-fit
├── Send Feedback           (stack) — /feedback
└── Family Concierge        (modal) — /concierge [not built]
```

Deep links (web): `/`, `/explore`, `/trips`, `/saved`, `/profile`, `/venue/:id`, `/need-now`, `/holiday`, `/packing`, `/car-fit`, `/feedback`

---

## Planned navigation extensions (Post-MVP / Future)

```
├── Plan Your Day           (stack) — from Plan Something
├── Meet Another Family     (stack) — from Plan Something
├── Shared Plan View        (web) — /share/plan/:token [Future Vision]
├── Shared Meetup View      (web) — /share/meetup/:token [Future Vision]
└── Restaurant Detail       (stack) — /restaurant/[id] or unified /venue/[id]
```

**No new primary tabs** for restaurants, meetups, or accessibility.

---

## Home screen IA (fixed — do not overload)

| Section | Purpose | Scope |
|---------|---------|-------|
| Greeting + weather | Context | MVP ✅ |
| Today's Pick | One hero decision | MVP ✅ |
| Quick Actions (×4) | Primary intents | MVP ✅ |
| More Ideas | One carousel | MVP ✅ |
| Continue Planning | Active trip only | MVP ✅ |

### Quick Actions

| Action | Destination | Scope |
|--------|-------------|-------|
| Go Outside | Explore (outdoor) | MVP ✅ |
| Indoor Ideas | Explore (indoor) | MVP ✅ |
| Need Something Now | /need-now | MVP ✅ |
| Plan Something | Sub-menu | MVP ✅ partial |

### Plan Something sub-menu (planned structure)

| Item | Destination | Scope |
|------|-------------|-------|
| Plan Your Day | /plan-day | Post-MVP Phase 7 |
| Meet Another Family | /meet-family | Post-MVP Phase 6 |
| Plan a Trip | /trips | MVP ✅ |

---

## Explore IA

### Current (MVP)

- Primary filter chips (Popular, Nearby, Indoor, Outdoor, …)
- More → filter sheet
- List view (map: coming soon)

### Planned categories (Post-MVP)

Parks · Playgrounds · Attractions · Restaurants · Cafés · Soft play · Farms · Museums · Walks · Beaches · **SEND-friendly** · **Accessible**

### Filter sheet (progressive disclosure — Post-MVP)

**Always visible chips:** Category, Distance, Indoor/Outdoor  
**Sheet sections:** Ages · Cost · Facilities · Accessibility · SEND · Parking · Free

**Rule:** Never show all filters at once.

---

## Venue detail IA

### Current sections (MVP)

- Hero + Family Match
- Family Match panel (detailed)
- Photos · Facilities · Details · Description · Community

### Planned sections (Post-MVP)

| Section | When shown | Phase |
|---------|------------|-------|
| **Accessibility** | Data exists | 4 |
| **SEND information** | Data exists | 5 |
| **Eat nearby** | Restaurants linked | 3 |
| **Meet here** | Always (CTA) | 6 |
| **Why we recommended this** | Unified explainability block | 2+ |

---

## Profile IA

### Current (MVP)

- Family summary · Children · Preferences · Vehicle · Equipment · Memberships
- Testing notice · Send feedback

### Planned (Post-MVP — progressive)

- Accessibility preferences (ask when relevant)
- SEND preferences
- Dining / dietary preferences
- Meetup defaults
- Connected families (Future Vision)

---

## User journey maps

### Journey A — What should we do?

```
Home (Today's Pick or Explore)
  → Venue detail
  → Eat nearby [Phase 3]
  → Save / GO / Add to trip
  → Optional: Plan Your Day [Phase 7]
```

### Journey B — Meet another family

```
Home → Plan Something → Meet Another Family [Phase 6]
  → Enter two areas + ages
  → Combined Match results
  → Share (no account required)
```

### Journey C — Urgent need

```
Home → Need Something Now
  → Filter → Store → Directions
```

### Journey D — Trip preparation

```
Home → Plan Something → Plan a Trip / Packing / Car Fit / Holiday
```

---

## Content hierarchy rules

1. **Family Match + why** before raw attributes
2. **Decision CTAs** (GO, Save, Directions) before secondary info
3. **Trust labels** on estimated/mock data
4. **Accessibility/SEND** only when data exists — never empty placeholder sections
5. **Restaurants** appear in context (after activity), not as orphan lists on Home

---

## Technical routing notes

- Expo Router file-based routing
- Static export for web (Vercel)
- `generateStaticParams` for known venue IDs
- Rewrite fallback for unknown venue IDs → client "Place not found"

See [ARCHITECTURE.md](./ARCHITECTURE.md) for implementation detail.

---

*Extend IA for future features without new primary tabs. See [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md).*
