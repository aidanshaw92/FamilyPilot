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

Post-remediation captures (390×844): `docs/post-remediation-screenshots/`

| File | Screen |
|------|--------|
| 01-home.png | Home |
| 02-explore.png | Explore |
| 03-trips.png | Trips |
| 04-saved.png | Saved |
| 05-profile.png | Profile |
| 05-profile-testing.png | Profile testing notice + feedback |
| 06-venue-detail.png | Venue detail |
| 07-venue-not-found.png | Place not found |
| 08-need-now.png | Need Now |
| 09-holiday.png | Holiday |
| 10-packing.png | Packing |
| 11-car-fit.png | Car Fit |
| 13-home-320px.png | Home at 320px width |
| 14-feedback.png | Feedback screen |

Full QA report: `docs/post-remediation-qa-report.md`

---

## Post-Deployment Review

**Production URL:** https://family-pilot-seven.vercel.app/  
**Deployed commit:** `ec41951225fff7919cefe8898ee61f1d368421b3` (includes remediation + tester readiness + invalid venue rewrite fix)  
**Review date:** 6 August 2026  
**Method:** Automated route checks + Playwright screenshots at 390×844 and 320px + manual screenshot review

### Route verification (production)

| Route | HTTP | In-app state | Status |
|-------|------|--------------|--------|
| `/` | 200 | Home loads | Verified in production |
| `/explore` | 200 | List view | Verified in production |
| `/trips` | 200 | Trip timeline | Verified in production |
| `/saved` | 200 | Saved rows | Verified in production |
| `/profile` | 200 | Family profile | Verified in production |
| `/venue/venue-1` | 200 | Venue detail | Verified in production |
| `/venue/venue-2` | 200 | Venue detail | Verified in production |
| `/venue/invalid` | 200 | Place not found | Verified in production (after rewrite fix) |
| `/need-now` | 200 | Store list | Verified in production |
| `/holiday` | 200 | Offer comparison | Verified in production |
| `/packing` | 200 | Checklist | Verified in production |
| `/car-fit` | 200 | Boot visualisation | Verified in production |
| `/feedback` | 200 | Feedback form | Verified in production |

- No JavaScript console errors captured during screenshot pass
- Browser refresh on nested routes: HTTP 200 (static export)
- No visible "Phase 4" or developer labels

### Item-by-item production verification

| Item | Classification | Notes |
|------|----------------|-------|
| Venue deep linking | **Verified in production** | `/venue/venue-1` cold load works |
| Invalid venue handling | **Verified in production** | Required rewrite fix (`destination: /venue/[id]`) |
| Remove Phase 4 placeholder | **Verified in production** | Explore shows list-first + "Map (coming soon)" |
| Home density reduction | **Verified in production** | Single hero, 4 actions, one carousel; noticeably shorter |
| Family Match consistency | **Verified in production** | Green badges consistent on cards and venue hero |
| Need Now chip truncation | **Verified in production** | Medicine chip readable at 390px |
| Save functionality | **Partially verified** | Heart icon and footer Save toggle work; Saved sync is client-side only |
| Caption contrast | **Verified in production** | Supporting text readable; no obviously faint captions |
| Empty states | **Partially verified** | Components exist; mock data prevents most from appearing in normal use |
| Trust language | **Verified in production** | "Estimated", "Usually stocks", testing notice on Profile |
| Back navigation | **Partially verified** | Back buttons present; full browser-history walkthrough not automated |
| Testing notice + feedback | **Verified in production** | Profile disclaimer + `/feedback` screen |
| Overall polish | **Verified in production** | No release-blocking visual defects at 390px or 320px |

### Revised production scores

Scores compared to pre-remediation audit (6.4 overall). These reflect **production as deployed**, not code intent alone.

| Area | Before | After | Change | Rationale |
|------|--------|-------|--------|-----------|
| First impression | 7.0 | **8.0** | +1.0 | Home is shorter and clearer; greeting + Today's Pick visible quickly |
| UI consistency | 5.5 | **7.5** | +2.0 | FamilyMatch unified; card variants distinct but coherent |
| Navigation | 8.0 | **8.5** | +0.5 | All routes work; venue deep links fixed; back affordances present |
| Visual hierarchy | 7.0 | **8.0** | +1.0 | Home sections have clear purpose; utility screens structured |
| Accessibility | 6.0 | **7.0** | +1.0 | Contrast improved, 44pt targets, reduced motion; not fully audited |
| Trust | 6.0 | **7.5** | +1.5 | Prototype labels, no Phase 4, venue links work, honest store copy |
| Overall polish | 6.0 | **7.5** | +1.5 | Feels like a deliberate testing build, not an internal prototype |

**Revised weighted overall: 7.6 / 10** (up from 6.4)

Not inflated because: mock data still fills most screens, maps/inventory are fake, several CTAs are placeholders, and empty/loading states are rarely seen in normal testing.

### Deep link checklist (completed)

- [x] `/venue/venue-1` loads on cold URL
- [x] `/venue/invalid` shows Place not found
- [x] Stack routes load directly
- [x] 390×844 and 320px — no horizontal overflow observed
- [x] No console errors in automated capture

### Parent testing readiness

| Item | Path / method |
|------|---------------|
| Testing guide | [docs/PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md) |
| Feedback collection | Profile → Send feedback → `/feedback` → GitHub issue (pre-filled) |
| Testing notice | Profile screen (discreet, bottom of scroll) |

### Recommendation

**Ready to send to 5–10 parents** for structured feedback, with these caveats communicated upfront:

- Prototype venue and store data
- Placeholder actions on Trips (Start trip / Edit) and Profile edit rows
- No real maps or live inventory

Core routes and primary interactions (browse, save, venue detail, Need Now directions) work in production. Further development should wait until parent feedback is collected.

---

*Post-deployment review completed 6 August 2026.*
