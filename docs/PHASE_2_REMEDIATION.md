# FamilyPilot — Phase 2 Remediation

**Date:** 6 August 2026  
**Branch:** `cursor/phase2-remediation-1a85`  
**Scope:** Highest-priority fixes from [DESIGN_AUDIT.md](./DESIGN_AUDIT.md) — no major new features

---

## Summary

Phase 2 remediation moves FamilyPilot from a promising MVP toward a polished user-testing build. The focus was broken functionality, removing prototype signals, simplifying Home, and standardising trust-critical UI patterns.

---

## Changes Completed

### Phase A — Critical production fixes

| Item | Status | Notes |
|------|--------|-------|
| Venue deep linking | ✅ | `generateStaticParams()` exports all 5 venue IDs; static HTML at `dist/venue/venue-{id}.html` |
| Vercel config | ✅ | Removed broken `/venue/:id` → `/venue/[id].html` rewrite; relies on `cleanUrls` + per-id static files |
| Place not found state | ✅ | Invalid venue IDs show designed empty state, not blank page |
| Stack routes | ✅ | `/need-now`, `/holiday`, `/packing`, `/car-fit` verified in static export |
| Remove "Phase 4" | ✅ | Explore is list-first; small disabled "Map (coming soon)" toggle |
| Venue Save footer | ✅ | Wired to `useSavedStore.toggleSaved` |
| Filter active styling | ✅ | Chip uses filled primary background when active |
| Need Now Medicine truncation | ✅ | Chip `minHeight: 44`, `numberOfLines={1}` |
| Back navigation | ✅ | Stack screens fall back to tabs when history empty |

### Phase B — Home simplification

| Item | Status |
|------|--------|
| Single greeting line ("Good afternoon, Aidan") | ✅ |
| One Today's Pick hero | ✅ |
| Four primary quick actions + More row | ✅ |
| One "More ideas" carousel (max 5, deduped) | ✅ |
| Continue planning only when trip exists | ✅ |
| Removed 3 full carousels + Recent places | ✅ |

### Phase C — Design system

| Item | Status |
|------|--------|
| `FamilyMatch` component (compact/card/detail) | ✅ |
| `SectionHeader` reused on Explore/Home | ✅ |
| `SavedPlaceRow`, `StoreCard`, `OfferCard`, `TripStopCard` | ✅ |
| Spacing rhythm tightened (24px sections) | ✅ |

### Phase D — Accessibility & trust

| Item | Status |
|------|--------|
| Tertiary text contrast (`#767688`) | ✅ |
| 44pt touch targets (chips, back, save) | ✅ |
| Reduced motion (FadeInView, SaveButton, Packing) | ✅ |
| Trust labels ("Estimated", "Usually stocks", "Prototype venue data") | ✅ |

### Phase E — Screen improvements

| Screen | Status |
|--------|--------|
| Saved — compact rows, search, sort, undo | ✅ |
| Need Now — StoreCard, Directions, trust copy | ✅ |
| Trips — summary pills, Start trip CTA | ✅ |
| Profile — editable rows, vehicle/equipment sections | ✅ |
| Packing — tappable rows, completion banner | ✅ |
| Holiday — comparison summary, OfferCard | ✅ |
| Car Fit — 2D boot visualisation, share | ✅ |

### Phase F — States

| Screen | Empty/loading/error |
|--------|---------------------|
| Home | ✅ No recs, error retry |
| Explore | ✅ Existing + improved |
| Saved | ✅ Empty, search zero |
| Need Now | ✅ No shops, unavailable |
| Trips | ✅ No plans |
| Holiday | ✅ No offers, unavailable |
| Packing | ✅ No active trip |
| Car Fit | ✅ Unable to calculate |
| Venue | ✅ Not found, load error |

### Phase G — Images

| Item | Status |
|------|--------|
| Category-specific Unsplash URLs per venue | ✅ (existing distinct URLs retained) |
| `VenueImage` with loading/error fallback | ✅ |

---

## Files Modified

### App screens
- `familypilot/app/(tabs)/index.tsx` — simplified Home
- `familypilot/app/(tabs)/explore.tsx` — list-only, no Phase 4
- `familypilot/app/(tabs)/saved.tsx` — compact rows, search/sort
- `familypilot/app/(tabs)/trips.tsx` — summary + CTAs
- `familypilot/app/(tabs)/profile.tsx` — editable rows
- `familypilot/app/venue/[id].tsx` — static params, not found, save footer
- `familypilot/app/need-now.tsx`, `holiday.tsx`, `packing.tsx`, `car-fit.tsx`

### Components
- `src/components/ui/FamilyMatch.tsx`, `family-match-label.ts`, `VenueImage.tsx`
- `src/components/shared/SavedPlaceRow.tsx`, `StoreCard.tsx`, `OfferCard.tsx`, `TripStopCard.tsx`
- `src/components/car-fit/BootVisualisation.tsx`
- Updated: `DecisionCard`, `Chip`, `BackButton`, `SaveButton`, `FadeInView`, `ScreenContainer`, `QuickActionGrid`, `TodayHeroCard`

### Infrastructure
- `vercel.json`, `familypilot/vercel.json`
- `src/utils/venue-routes.ts`, `deep-link-routes.ts`
- `src/data/mock-data.ts` — all venue details, trust copy on stores
- `src/design-system/tokens/colors.ts` — tertiary contrast
- `src/__tests__/remediation.test.ts`, `vitest.config.ts`

### Documentation
- `docs/PHASE_2_REMEDIATION.md` (this file)
- `docs/DESIGN_AUDIT.md` — remediation status appended
- `docs/PROJECT_STATUS.md` — updated

---

## Before / After

| Area | Before | After |
|------|--------|-------|
| `/venue/venue-1` | HTTP 404 on Vercel | Static HTML generated per venue ID |
| Explore | 200px "Map view — Phase 4" | List-first; map marked "coming soon" |
| Home | 3 carousels + recent + 8 actions | 1 hero + 4 actions + 1 carousel |
| Family Match | Pill, circle, panel variants | Single `FamilyMatch` component |
| Venue Save footer | Non-functional | Toggles saved state |
| Need Now | "In stock" claims, truncated Medicine | "Usually stocks", Directions CTA |

---

## Verification Performed

1. ✅ `npm run typecheck`
2. ✅ `npm test` (5 tests — static params, save toggle, Family Match label, route files)
3. ✅ `npm run build:web` — 22 static routes including `/venue/venue-1` through `/venue/venue-5`
4. ✅ Static file HTTP 200 for `venue/venue-1.html`, `need-now.html`
5. ✅ No visible "Phase 4" strings in app UI

### Deep link checklist

After deploy, verify on production:

- [ ] `https://family-pilot-seven.vercel.app/venue/venue-1` — loads venue (cold URL)
- [ ] `https://family-pilot-seven.vercel.app/venue/invalid` — "Place not found"
- [ ] `/need-now`, `/holiday`, `/packing`, `/car-fit` — direct load + refresh
- [ ] Navigate Home → venue → browser back
- [ ] Mobile 390×844 and 320px — no horizontal overflow

Run automated route check locally:

```bash
cd familypilot && npm run test:routes
```

---

## Remaining Limitations

- Map view not implemented (intentionally deferred)
- Mock data always populates most screens — empty states require clearing fixtures
- `concierge` route registered but screen missing (pre-existing)
- JS bundle still ~2.9MB — code splitting not attempted
- Profile edit rows are visual affordances only (no edit flow)
- Trips "Start trip" / "Edit" buttons are placeholders
- Swipe-to-remove on Saved is web row actions only (native swipe deferred)
- Real maps, live inventory, and verified opening hours require backend integrations

---

## Deferred Audit Recommendations

| # | Item | Why deferred |
|---|------|--------------|
| 13 | Increase mock API delay globally | Would slow all demos; skeletons already exist |
| 20 | Code-split JS bundle | Performance pass, not trust blocker |
| — | Full comparison mode on Holiday | Scope — summary strip added instead |
| — | Pull-to-refresh | Requires data layer changes |
| — | Native swipe-to-remove | Platform-specific; undo bar added for web |

---

## Screenshots

Pre-remediation baseline: `docs/audit-screenshots/01-home.png` through `10-car-fit.png`

Post-remediation captures should be taken after Vercel redeploy from this branch.

---

*Remediation completed 6 August 2026.*
