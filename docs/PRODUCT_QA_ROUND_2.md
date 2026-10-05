# Product QA, round 2: "What should our family do today, and will it actually work for us?"

Status: on PR #159 (open, **not merged, not deployed**). Evidence images are in `docs/product-qa/`. Everything below was
checked against the repository, the production database (read-only queries) and a real browser; nothing here made a
live Google, Overpass or Photos request.

The slice boundaries are one coherent change, in the order a parent meets it: **Home deck → navigation clearance →
photography → inventory and taxonomy → Family Fit → venue page → food → accounts and connections → evidence loop.**

---

## 1. Root cause, by issue

| # | Symptom on the iPhone | Root cause | Fix |
| --- | --- | --- | --- |
| A | Cards "disappear and come back"; image, text and overlay moved separately; previous card unrecoverable | The deck rendered three fixed layers (back, next, active) and *recreated* them as the index changed, so the image of an incoming card was a new element that had to load; swipe handlers only advanced | `RecommendationDeck` is one continuous placement: every card is placed from a single value `d = card index − fractional progress`, 1 behind and 3 ahead, keyed by venue id, eager images; image, text and overlay are one layer and move as one; previous is a normal swipe back |
| A′ | Brief flashes of grey on a card that has a photo | Photo mounted lazily when the card became active | Adjacent cards mount eagerly with their image; `verify-deck-images.mjs` samples every animation frame through a full forward and back swipe and fails if any visible card lacks a decoded photo (and was shown to fail on a deliberately mutated build) |
| B | **P0** the floating nav covers "See more" | Fixed deck height plus a header that grows with the greeting, name length and viewport; nothing measured the room left | The header is measured; its mode (full / tight / compact) and the deck's scale (bounded 0.74 to 1) are chosen so the CTA's bottom is always above the nav. `verify-home-fit.mjs`: **36/36** at 12 viewports (360, 390, 393, 430 and shorter and taller variants). Explore clears the nav by 18 px at 360 / 390 / 393 / 430 (`verify-explore-clearance.mjs`) |
| C | "Create account" was optional and asked nothing verifiable | No auth gate existed in the app shell | Mandatory verified-email account: see `ACCOUNTS_AND_CONNECTIONS.md` |
| D | No way to connect families | `planning_connections` existed server-side with no onboarding or planning surface | Optional invite step, recipient landing, "Add another family" picker (same doc) |
| E | Farm and Activity looked empty, London thin | Home/Explore showed only the latest *live* London search: nine Nearby Search pages ranked by popularity, so parks and museums (the most popular things in London) filled 62 of 79 places and **2 of the 8 stored farms and 2 of the 5 soft-play centres** surfaced | London is also served from the stored catalogue (`place_records`) in one database read; one taxonomy registry (`venue-taxonomy.ts`) drives Home and Explore; a category is offered only if at least three venues can fill it |
| F | A place marked "Good fit" while breaching a preference; the same number on every card | Family Fit was one blended score; hard requirements that were *unknown* counted as neutral | New engine (`family-match.ts`): excellent / good / possible / poor; a breach is poor; an unknown hard requirement caps at possible; names a child only when a confirmed fact is about that child |
| G | Venue page buried the decision under repeated "Not confirmed" | Facts were laid out by data source, not by what a parent asks | Hero → Family Fit → Today → Family essentials → Restaurants close by → Getting there → "How we know this" → Create a plan |
| H | Unknown facilities, no way to improve them | 0 visit reports ever submitted; the prompt lived only in the Plans tab | Plans tab shows a dot when a visit check is waiting; questions are chosen unknown-or-disputed first (existing `selectQuestions`); parent reports stay separate with recency |
| I | No way to ask for lunch | Food proximity existed only on the venue page | Filter group "Food nearby" (below) |
| — | "Open now" wrong at the end of the day | `isOpen` was the provider's snapshot, replayed from a 6 hour cache | Open today is computed from the stored weekly schedule and the clock; the snapshot is trusted only if ≤ 90 minutes old (`opening-today.ts`, 17 tests including the stale-snapshot regression) |

## 2. Before and after, as a parent sees it

* **Home.** Before: three recreated layers, a CTA the nav could cover, "Good fit" with no reason. After: a deck that
  moves as one, previous recoverable, "See more" always clear, and a badge that says who it is for: *"Excellent for
  Sloane and Theo"*, with the one line that matters under the name.
* **Photographs.** A real provider photograph with its credit where one exists (96% of the 138 stored venues), otherwise
  a FamilyPilot category illustration that cannot be mistaken for the venue (`PHOTOGRAPHY_ASSETS.md`, section C).
* **Explore and Home chips.** Only categories that can be filled are offered; Farm and Activity now show the stored
  farms and activities; one vocabulary on both screens.
* **Venue page.** The decision first, then the evidence. "Open 24 hours today" / "Closing soon · 5pm" are computed;
  weekly hours expand.
* **Food.** Filters for café on site and food within 5 or 10 minutes' walk; restaurants are not a dominant Home
  category; "Restaurants close by" is a compact card (illustration thumbnail, walk time, open/closed from OSM hours when
  they can be read, only the family facilities OSM tagged yes, otherwise "Family facilities not recorded").
* **Getting started.** Welcome → account → verify → family → invite → Home. The family steps themselves are unchanged
  and stay short.

## 3. Live inventory and amenity coverage (production, read-only, 5 Oct 2026)

155 stored places (136 from Google Places, 142 inside the London box). Verified facts are active rows in
`venue_claims`, each with a source.

**Inventory by category** (what Home/Explore can offer; a chip needs ≥ 3):

| Category | Places | With a photograph | With opening hours |
| --- | ---: | ---: | ---: |
| Park | 59 | 58 | 48 |
| Museum | 42 | 37 | 38 |
| Attraction | 12 | 12 | 10 |
| Farm | 8 | 8 | 7 |
| Activity | 7 | 7 | 6 |
| Soft play | 5 | 5 | 5 |
| Zoo | 5 | 5 | 5 |
| Restaurant (OSM, context only) | 14 | 0 | 0 |
| Cafe (OSM, context only) | 3 | 0 | 0 |

No category in the taxonomy is empty; Beach (0) is correctly not offered. Of the farm concepts, the stored 8 are
farms/city farms/children's farms the earlier search had hidden; nothing was invented. Zoo is shown through "Animals".

**Amenity coverage** (places with a confirmed yes or no, of 155):

| Fact | Places | Share |
| --- | ---: | ---: |
| Accessible toilet | 34 | 22% |
| Playground | 29 | 19% |
| Parking | 25 | 16% |
| Baby changing | 23 | 15% |
| Toilets | 21 | 14% |
| Free parking | 12 | 8% |
| Wheelchair access | 11 | 7% |
| Pushchair suitability | 6 | 4% |
| Café | 5 | 3% |
| Terrain | 1 | 1% |
| Age suitability | 0 | 0% (the age policy forbids inferring it; see `AGE_POLICY.md`) |

**Why unknown.** The enrichment pipeline only publishes a fact that an official page states in words it can quote; most
venue websites do not say whether they have baby changing or a café, and that silence is *unknown*, not *no*. Parent
visit reports, the other source, are **0** so far because the prompt was never surfaced.

**Priorities.** (1) buggy access and baby changing (the two facts that decide the day for the youngest children),
(2) café (drives the food filter), (3) toilets and parking. Nothing needs spend: the existing area-sync and enrichment
queues are the route, and the visit loop below adds the second source.

**Food lookups stored: 8 of 155 places.** The food filter can only be as good as the stored lookups; today it is
honest and thin. See owner decision 4.

## 4. Accounts and connected families

See `docs/ACCOUNTS_AND_CONNECTIONS.md`. In short: Supabase email + password with confirmation, nothing about children
uploaded, 256-bit single-use 7-day invitation links stored as hashes, an unauthenticated preview that returns the
inviter's first name only, a consent screen listing exactly what is shared (first name, area to ~1 km, children's ages,
drive limit, budget, needed facilities), and "Add another family" in Create a plan. **31/31** browser checks.

## 5. Home carousel behaviour

* One placement function for every card; position derives from `index − progress`, so there is no second code path for
  "settled" and "moving".
* Window: 1 card behind, 3 ahead, keyed by venue id, all mounted eagerly with their image (≤ 5 photographs in flight,
  pinned by `photo-request-budget.test.ts`, so the cost controls hold).
* Pan with a spring that cannot overshoot; tapping Save or See more never swipes (`verify-deck-gesture.mjs`, 11/11);
  accessibility actions for next and previous.
* The whole composition scales as one when the viewport is short, never below 0.74.
* The Figma composition is preserved: active 312 × 428, rear cards 237.6 and 223.1 wide inset 32 and 40, reveals of 25
  and 27, at 360 / 393 / 430 (`verify-home-against-figma.mjs`, **89/89**; the verifier was updated to find rear cards in
  the new structure and to check a fitted deck proportionally).

## 6. Photography and fallback strategy

`PHOTOGRAPHY_ASSETS.md`, section C. Real provider photographs with attribution only; one image source in `VenueImage`;
a clearly generic category illustration otherwise; no synthetic photograph can reach a real venue; the fixture and
production image boundary and every zero-spend tripwire are untouched. An optional raster pack is specified there
(filenames, 1200 × 1600, destination, prompts) and nothing is blocked on it.

## 7. Personalised Family Fit, on one real venue (fixture, 10:30 London)

The same park, four different families (`docs/product-qa/family-fit-*.jpg`):

| Family | Badge on Home | Venue page headline | Why |
| --- | --- | --- | --- |
| Sloane (7) and Theo (2, in a buggy, naps at 12:45); must-have baby changing | **Excellent for Sloane and Theo** | Excellent for Sloane and Theo today | "Suits Sloane and Theo (recommended for ages 1–8)", "Good buggy access for Theo's buggy", "Baby changing confirmed, which you said you need", "Leave by 12:40 to be home in time for Theo's nap" |
| Ada (13 months, carrier); must-have toilets, parking | **Excellent for Ada** | Excellent for Ada today | "Good for Ada's age", "Toilets confirmed, which you said you need", "Parking confirmed, which you said you need" |
| A child whose name was not entered | **Excellent fit** (no name is invented) | Excellent for your family today | The same confirmed facts, said without names |
| Jonah (14) | **Poor fit** | Probably not for your family today | "None of your children are in its recommended age range", "Recommended up to age 8, so Jonah is older than that" (shown first) |

The same park at 16:40 reads **Possible** for the first family because it is "Closing soon · 5pm": the verdict is about
*today*. A venue where the family needs buggy access and it is unconfirmed is capped at **Possible** with "Buggy access
still to be checked for Theo's buggy". 18 unit tests pin these rules, including that a breach is never "good" and an
unknown hard requirement is never a tick.

Audit of Family Fit itself: it was a single blended number, equally weighted unknowns as neutral, and the same wording for
every family. It still orders the lists (the score is unchanged and ranks), but the words, colour and star now come from
the verdict; the badge no longer shows a number.

## 8. Renders

All in `docs/product-qa/` (fixture data, fixed 10:30 London clock; real device sizes at 2x):

* Home: `sloane-theo-home-360 / 390 / 393 / 430`, `solo-toddler-home-393`, `no-names-home-393`, `teen-home-393`, `home-after-onboarding-390`
* Explore: `explore-360 / 390 / 393 / 430`, `explore-filter-sheet-393` (with the Food nearby group), `explore-food-5min-393`
* Venue page: `sloane-theo-venue-top-393`, `-match-360 / 393 / 430`, `-essentials-393`, `-food-393`, `-evidence-393`
* Family Fit for four families on one venue: `family-fit-sloane-theo-393`, `-solo-toddler-393`, `-no-names-393`, `-teen-393`
* Getting started: `welcome-390`, `account-create-390`, `account-check-email-390`, `invite-step-390`, `invite-link-created-390`, `invite-recipient-landing-390`, `invite-connected-390`, `plan-add-another-family-390`
* Fallback artwork: `category-art.jpg`

## 9. Complete mobile journey evidence

`verify-account-journey.mjs` (31/31): Welcome → Get started → validation → Check your email → verify → family →
invite → Home → recipient → accept → single use → Add another family. `verify-create-plan-journey.mjs` (128/128) covers
Home → venue → Create a plan → generating → plan → travel & parking → who's coming. `verify-onboarding-flow.mjs` covers
every family shape. **Not done and not claimed:** VoiceOver and TalkBack passes, and OS larger-text settings, are
**manual device QA required**. Axe-style automated checks are not a substitute.

## 10. Regression and CI

Unit: **2,214 tests passing** (140 files), `tsc --noEmit` clean. Browser: home-fit 36/36, home-against-figma 89/89,
deck-gesture 11/11, deck-images 2/2, plan-screens 56/56, place-credits 13/13, create-plan 128/128, onboarding all
checks, dynamic-content 43/43, explore-clearance all, account-journey 31/31, greeting 15/15. Zero-spend: every verifier
runs against the fixture; the live-provider request tripwires are unchanged and the new food overlay reads one
database table and calls no provider. Verifiers I changed, and why: they asserted the *old* implementation (three deck
layers, a numeric "★ n.n Family Fit", an "Outdoor" chip that is now inventory-gated, the old step-free wording); each was
updated to assert the behaviour, not the structure.

## 11. Owner decisions that remain

1. **Photo scope on Vercel Preview** (spend). Previews show the illustration instead of photographs until it is on, with
   a daily cap. Your call.
2. **Supabase Auth settings** (Confirm email on, Site URL, redirect allow-list): needed before accounts work in any
   deployed build. No migration is required.
3. **"Partner" means a connected person, not a shared household.** A single shared family profile across two accounts
   is a bigger model; say if you want it.
4. **Food coverage.** 8 of 155 places have a stored food lookup. Options: let it grow as venue pages are opened (free,
   slow), or a bounded one-off backfill of ~150 anchors from OpenStreetMap at one request every ~10 seconds (free, about
   25 minutes, polite to public infrastructure). I have not run it.
5. **Discovery for farm concepts.** The 8 stored farms are all there is until area-sync is told to look for city farms,
   children's farms, farm parks and petting farms. That is extra Places requests (about 10 per focus group per run),
   so it needs a budget line.
6. **No-photo artwork.** The vector category illustrations ship; the optional raster pack is yours to commission.
7. **Manual device QA** (VoiceOver, TalkBack, larger text) before merge.
