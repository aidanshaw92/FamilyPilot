# Phase 2 — Design Audit

**Branch:** `cursor/familypilot-polish-1a85`  
**Date:** 6 August 2026

This audit documents every screen change in the Premium Consumer App Polish phase, why it improved, and where further polish remains.

---

## Global Improvements

| Change | Why | Vision alignment |
|--------|-----|------------------|
| **Decision Cards™** replace generic venue cards on Home, Explore, Saved | Every card now answers "should we go?" with match %, reasons, and GO CTA | Proactive recommendations, not browsing |
| **Family Match™ panel** with animated factor bars | Score understandable in 2 seconds; explainable not opaque | Trust through transparency |
| **PressableScale + FadeInView** across interactive elements | Tactile, native-feeling micro-interactions | Apple-quality feel |
| **Skeleton, EmptyState, ErrorState** components | Loading and failure feel intentional, not broken | Production-ready polish |
| **SaveButton** with haptic + spring animation | Saving feels satisfying and instant | Micro-interactions |
| **Filter sheet** on Explore | Primary filters visible; advanced hidden | Reduced cognitive load |

---

## Home

### What changed
- **Today's Pick** hero Decision Card with weather context
- **Continue Planning** card linking to active trip
- Softer section copy: "What shall we do?" instead of long question
- **Recent places** section for return visits
- Staggered fade-in on all sections
- Skeleton loader while recommendations fetch
- Error state with retry

### Why it improved
Parents see one clear recommendation immediately — no scanning eight buttons first. Continue Planning reduces taps to resume a trip. Recent places support habitual use.

### Further polish
- Personalise Today's Pick from weather + nap times (future)
- Animate weather pill on condition change

---

## Explore

### What changed
- Primary filters: Popular, Nearby, Indoor, Outdoor, Free, Today
- **More** button opens filter sheet for advanced options
- Filters **actually filter** venues now
- FlatList with `removeClippedSubviews` for performance
- Animated map collapse/expand
- Empty state when no results
- Decision Cards in list

### Why it improved
Six visible filters instead of overwhelming chips. Filter sheet scales to dozens of options without clutter. List performance improved for long results.

### Further polish
- Real Mapbox map with bottom sheet (Phase 4)
- Crossfade between map and list modes

---

## Venue Detail

### What changed
- Parallax hero image on scroll
- Floating **Family Match™** circle on hero
- **FamilyMatchPanel** with 6 animated factor bars + bullet reasons
- Photo gallery thumbnails (tap to change hero)
- Warnings section (e.g. busy times)
- **Community section** with tips + placeholder slots for photos/closures/updates
- Animated heart save button in header
- Skeleton loading state
- Sticky footer: Save + **GO** (action-oriented)
- Visit duration + spend in hero meta

### Why it improved
Feels like an Airbnb listing — photography leads, trust signals prominent, community-ready layout. Parents understand *why* before committing.

### Further polish
- Full-screen photo viewer
- Wire GO to native maps (Phase 4)
- Live community feed

---

## Trips

### What changed
- Fade-in on trip cards
- Active stop highlighted on timeline
- Empty state for no trips

### Why it improved
Timeline reads clearer; empty state guides next action.

### Further polish
- Tap stop to open venue
- Drag-to-reorder stops

---

## Saved

### What changed
- Decision Cards instead of generic cards
- Empty state with heart icon guidance
- Fade-in per section

### Why it improved
Saved places use same decision language as recommendations — consistent mental model.

### Further polish
- Sync with SaveButton store (currently mock API + local store)

---

## Profile

### What changed
- "Your family" heading with helpful subtitle
- Skeleton loading
- Completion hint: "add your car to unlock Car Fit"
- Fade-in on sections

### Why it improved
Profile feels like a hub, not a settings dump. Completion ring nudges without blocking.

### Further polish
- Edit flows with React Hook Form (Phase 3)

---

## Need Now / Holiday / Packing / Car Fit

### What changed
- Retained existing layouts (already functional)
- Inherit global design tokens and back button consistency

### Why it improved
Consistent navigation chrome; no regression.

### Further polish
- Apply Decision Card pattern to holiday offers
- Animated checkmarks on packing list
- Car fit capacity bar animation (partially done in Phase 1)

---

## New Components Created

| Component | Purpose |
|-----------|---------|
| `DecisionCard` | Decision-focused venue card with GO CTA |
| `FamilyMatchPanel` | Match % + factor bars + reasons |
| `ScoreFactorBar` | Animated single factor bar |
| `SaveButton` | Animated heart with haptics |
| `PressableScale` | Reanimated scale on press |
| `FadeInView` | Staggered entrance animation |
| `Skeleton` / `SkeletonCard` / `SkeletonDecisionCard` | Loading placeholders |
| `EmptyState` | Zero-data states |
| `ErrorState` | Failure + retry |
| `FilterSheet` | Explore advanced filters modal |
| `PhotoGallery` | Venue photo thumbnails |
| `CommunitySection` | Tips + future community slots |
| `TodayHeroCard` | Home hero recommendation |
| `ContinuePlanningCard` | Active trip shortcut |

---

## Architecture Preserved

- No rewrites to navigation, services, or database schema
- Mock API layer unchanged in structure
- Provider interfaces untouched
- All Phase 1 screens retain functionality

---

## Remaining Polish (Post-Phase 2)

1. Dark mode semantic tokens (readiness only — not implemented)
2. Concierge modal screen (still missing)
3. Save footer button on venue — wire to SaveButton store
4. Holiday/packing/car-fit — full Decision Card treatment
5. E2E tests and visual regression
6. Reduce Motion accessibility flag on animations

---

## Would Apple Feature This?

**Closer than Phase 1**, but not yet:
- ✅ Cohesive design language
- ✅ Explainable recommendations (Family Match™)
- ✅ Premium photography and spacing
- ✅ Native-feeling motion
- ⚠️ Needs real map and live data
- ⚠️ Needs onboarding moment
- ⚠️ Needs Concierge as hero feature

Phase 2 moved the app from " polished prototype" to " credible App Store candidate with mock data."
