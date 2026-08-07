# Eat Nearby — Family-Friendly Restaurants

**Last updated:** 7 August 2026  
**Status:** MVP beta (mock data)  
**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)

---

## Product purpose

Eat Nearby extends FamilyPilot's activity recommendations into a **complete family outing decision**:

> "Where shall we go, and where can we eat afterwards?"

Parents opening a park, farm, or museum should see up to **three ranked, family-friendly restaurants nearby** — not a directory, not a booking app. FamilyPilot surfaces the **few options most likely to work for that specific family**.

**North star:** Maximum confidence, not maximum information.

---

## User flow

1. **Home** — Today's Pick may show a subtle dining hint when a strong match exists near the recommended activity.
2. **Venue detail** — Eligible activity venues show **After your visit** with up to 3 compact restaurant cards.
3. **Restaurant detail** (`/restaurant/[id]`) — Dining-optimised detail with Family Match, tri-state facilities, estimated spend, and activity context.
4. **Explore → Restaurants** — Browse family-friendly restaurants with restaurant-specific cards and filters.
5. **Saved** — Filter **Places** vs **Restaurants**; restaurants link to `/restaurant/[id]`.
6. **Directions / Save** — Same patterns as venue detail; no booking or delivery.

---

## Restaurant data model

Restaurants extend the shared venue model via `RestaurantDetail` with tri-state `restaurantFeatures` (`confirmed` | `not_available` | `not_confirmed`). Unknown data is never treated as false.

Key fields: kidsMenu, highChairs, babyChanging, pushchairSpace, stepFreeAccess, accessibleToilet, outdoorSeating, playArea, activityPacks, parking, noiseLevel, bookingRecommended, estimatedFamilySpend, dietaryOptions, trust metadata.

---

## Family Match integration

Restaurants use `calculateRestaurantFamilyScore` — the same intelligence layer as venues. Presentation is human-first (Excellent / Great / Good match) with secondary Family Match percentage.

---

## Ranking approach

`getRestaurantsNearVenue(activityVenue, profile)`:

1. Nearby candidates (max 20 min from activity)
2. Family Match per restaurant with activity context
3. Composite rank: 50% suitability, 25% distance, 12% budget, 13% facilities
4. Top 3 returned

---

## Activity-to-restaurant relationship

Mock proximity map: `RESTAURANT_PROXIMITY` in `src/data/mock-restaurants.ts`. UI uses service layer only — no hardcoded IDs in components.

---

## Trust rules

- Estimated spend, provider/estimated opening hours, last-checked facilities
- Never claim guaranteed availability or allergy-safe without evidence

---

## Filters (Explore → Restaurants)

Travel time, budget, family facilities, and dietary options. Facility filters match `confirmed` only.

---

## Trips / Add to plan

Deferred — mock trips are read-only. Integration point: `TripStop.type === 'meal'` with restaurant id when trip editing ships.

---

## Limitations

Mock data only; no live hours, booking, or delivery. See [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md) for live-data next steps.

---

## Key files

| Area | Path |
|------|------|
| Types | `familypilot/src/types/index.ts` |
| Mock data | `familypilot/src/data/mock-restaurants.ts` |
| Scoring | `familypilot/src/services/scoring/restaurant-score.ts` |
| Service | `familypilot/src/services/eat-nearby/index.ts` |
| Tests | `familypilot/src/__tests__/eat-nearby.test.ts` |
