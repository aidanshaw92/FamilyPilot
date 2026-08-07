# FamilyPilot — Trust, Clarity & Premium Polish Pass

**Date:** 7 August 2026  
**Branch:** `cursor/trust-polish-pass-1ade`  
**Production URL (pre-merge):** https://family-pilot-seven.vercel.app/  
**Screenshots:** [design-review/](./design-review/) (390×844 and 430×932)

---

## Audit findings addressed

| Issue | Resolution |
|-------|------------|
| Prototype/testing language in primary UX | Removed from Profile; beta disclosures moved to `/about` |
| Ambiguous “GO” CTAs | Replaced with context-specific labels (`View details`, `Get directions`, `Directions`, `View option`, `View plan`) |
| Family Match false precision (91%, sub-scores) | Classification-first presentation; numeric score secondary; qualitative suitability rows |
| Missing recommendation limitations | `goodToKnow` on venues; “Good to know” in DecisionCard and FamilyMatchPanel |
| Weak data trust | `DataTrustBadge` component; “Estimated”, “Usually stocks”, “Opening hours from provider” |
| Explore felt like unfinished filter DB | Category chips, Filter sheet; removed “Map coming soon” |
| No distance/budget filters | Travel time + budget filters in FilterSheet (session-only override) |
| Profile felt administrative | Removed % complete; contextual “Make recommendations even better” suggestions |
| Saved felt like settings records | Grouped sections (Want to go / Favourites / Been before); richer rows |
| Need Now trust presentation | Compact store cards with open status and “Usually stocks” |
| Inconsistent recommendation pattern | Signature `DecisionCard` pattern across Home and Explore |
| Onboarding copy unclear | Benefit-led step titles (“Who are we planning for?”, etc.) |
| Venue detail prototype signals | Removed prototype warnings; Eat nearby + weather alternative sections prepared |

---

## Before / after summary

### Family Match

**Before:** Large numeric badge (e.g. **91%**) with unexplained sub-scores (Age 97, Facilities 92).

**After:**

```
Excellent match
91% Family Match

Why it suits your family:
✓ Great for Mia's age
✓ Pushchair friendly
✓ Café and baby changing

Good to know:
⚠ Parking gets busy around lunchtime
```

Classification leads; explanation carries visual weight; numbers are secondary.

### CTAs

| Surface | Before | After |
|---------|--------|-------|
| Recommendation cards | GO | View details |
| Venue detail footer | GO | Get directions |
| Store cards | GO | Directions |
| Holiday offers | (none) | View option |
| Continue planning | View → | View plan |

### Trust & prototype language

**Before:** Profile showed testing notices and completion percentages; venue pages could show prototype disclaimers.

**After:** Beta/data-source copy lives on `/about` (linked from Profile). Primary screens use trust badges and cautious language (“Estimated”, “Usually stocks”).

---

## Files changed

### New files

- `familypilot/app/about.tsx` — Beta & data sources disclosure
- `familypilot/src/components/ui/DataTrustBadge.tsx`
- `familypilot/src/components/venue/EatNearbySection.tsx`
- `familypilot/src/components/venue/WeatherAlternativeSection.tsx`
- `familypilot/src/utils/family-match-classification.ts`
- `familypilot/src/__tests__/family-match-classification.test.ts`
- `docs/TRUST_AND_POLISH_PASS.md`

### Modified files

| Area | Files |
|------|-------|
| Home | `TodayHeroCard.tsx`, `DecisionCard.tsx`, `QuickActionGrid.tsx` |
| Explore | `explore.tsx`, `FilterSheet.tsx`, `filters-store.ts`, `filter-venues.ts` |
| Venue | `app/venue/[id].tsx`, `CommunitySection.tsx` |
| Family Match | `FamilyMatch.tsx`, `FamilyMatchPanel.tsx`, `family-match-label.ts` |
| Saved / stores / holiday | `saved.tsx`, `SavedPlaceRow.tsx`, `StoreCard.tsx`, `OfferCard.tsx`, `VenueCard.tsx` |
| Profile / onboarding | `profile.tsx`, `setup.tsx`, `profile-completion.ts` |
| Data / types | `mock-data.ts`, `types/index.ts`, `personalise-venues.ts` |
| Routing | `_layout.tsx`, `deep-link-routes.ts` |
| Tests / tooling | `remediation.test.ts`, `capture-design-review.mjs` |
| Docs | `PROJECT_STATUS.md`, `DESIGN_AUDIT.md`, `design-review/*.png` |

---

## Screens changed

1. **Home** — Today’s Pick uses signature DecisionCard; Continue planning uses “View plan”
2. **Explore** — Category navigation + Filter sheet (travel time, budget, facilities)
3. **Venue detail** — FamilyMatchPanel, Good to know, Eat nearby, weather alternative, trust badges
4. **Saved** — Grouped lists, classification labels, View details
5. **Need Now** — Compact factual store cards
6. **Holiday** — View option on offers; classification visible
7. **Profile** — Warmth copy, suggestion prompts, About link
8. **Onboarding** — Benefit-led step copy
9. **About** — New beta disclosure screen

---

## Screenshots

Fresh captures at 390×844 and 430×932:

| Screen | Path |
|--------|------|
| Home | `docs/design-review/390x844/07-home.png` |
| Explore | `docs/design-review/390x844/08-explore.png` |
| Venue detail | `docs/design-review/390x844/09-venue-detail.png` |
| Need Now | `docs/design-review/390x844/10-need-now.png` |
| Saved | `docs/design-review/390x844/14-saved.png` |
| Profile | `docs/design-review/390x844/15-profile.png` |

Full pack: 19 screens × 2 viewports in `docs/design-review/`.

---

## Verification results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm test` | ✅ 14/14 pass |
| `npm run build:web` | ✅ 31 static routes including `/about` |
| No “GO” buttons in UX | ✅ Confirmed via grep |
| No prototype language in primary UX | ✅ Confirmed |
| Home length | ✅ Unchanged structure |
| Explore visual load | ✅ Filters behind Filter action |

---

## Issues deliberately deferred

- Full Eat Nearby engine (component + empty state only where no data)
- Weather decision engine (static alternative links only)
- Live maps on Explore
- Real retailer inventory APIs
- SEND/accessibility filtering system
- Complex saved collections beyond three groups
- ScoreFactorBar removal from exports (unused in UI, kept for potential future use)

---

## Remaining known trust limitations

1. **Mock data** — Venues, stores, and holidays still use demo content; prices and hours are estimated.
2. **No live inventory** — Store cards show “Usually stocks” only; never “In stock”.
3. **Opening hours** — Labelled “Opening hours from provider” where shown; not verified in real time.
4. **Community tips** — Limited to demo venues; labelled as community-sourced where shown.
5. **Holiday “View option”** — Opens provider site placeholder; no booking integration.
6. **Production deploy** — Changes require merge to main and Vercel deploy before parents see them on production URL.

---

## Recommendation for parent testing

**Ready for another round of parent testing** after merge and deploy. The build addresses the audit’s trust, clarity, and polish gaps without adding feature sprawl. Testers should focus on whether Family Match explanations feel credible, CTAs are clear, and the app feels like a calm decision assistant rather than a prototype.

---

*Related: [DESIGN_AUDIT.md](./DESIGN_AUDIT.md) · [PROJECT_STATUS.md](./PROJECT_STATUS.md) · [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)*
