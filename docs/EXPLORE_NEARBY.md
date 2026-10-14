# Explore: Nearby, Search all, categories, filters and the map

Status: draft, **not merged and not deployed**. Branch `feat/explore-nearby`. Design: Figma page 10 (https://www.figma.com/design/LNpbdnuAWcfWf9spvB7jBz?node-id=372-2).
Related: `docs/CATALOGUE_BOTTLENECKS.md`, `docs/CATALOGUE_CORRECTIONS.md`, `docs/CATALOGUE_EXPANSION_PLAN.md` (PR #202), and the optional-lunch change (PR #201, a separate branch).

## The question the screen answers

*Where can I take my children today, nearby or elsewhere in London, that genuinely suits their ages, interests and practical needs?*

Explore is where a parent browses and searches. Home still picks. The plan still decides when to leave.

## What the parent sees, top to bottom

One scrolling page (no pinned header eating a small phone):

1. **Explore** heading.
2. **Nearby | Search all.** Nearby is the default.
3. **Where row** with *Change*: "Near NW1 / Your home area".
4. **Search bar.** Try "soft play".
5. **Five groups**, in this order: Parks & playgrounds, Museums & galleries, Farms & animals, Soft play & trampolines, Attractions & activities. A group is offered only when the places loaded can fill it. No Swimming, no Classes.
6. **Quick filters:** the distance chip, Indoor, Outdoor, Open now, More.
7. **Active chips** with × and *Clear all*, only when something is on.
8. **Count line** (for example "Soft play: 2 places within 5 miles · ranked by Family Fit") with **List | Map**.
9. **Results.**

`More` opens the existing filter sheet: How far, Age guidance (an honest note, not a filter), Budget (only when enough places carry a price), More filters (facilities) and Food nearby.

## Nearby, and where it measures from

Nearby measures **straight-line miles** from one point. It never calls that a route or a journey time; the "about N min drive" beside it is the existing, labelled estimate.

| Point | When | Kept? |
|---|---|---|
| Home area | Default. | It is already in the family profile. |
| Current location | Only after the parent taps it, never on load. | On the phone only, in memory, for the session. Not in local or session storage, not in any request. |
| Postcode or area | The parent types a full postcode (NW5 1TL), its first half (NW5), or one of 13 built-in towns. | The postcode goes to postcodes.io (free) once, when submitted. Nothing is stored. |

Distance: 5 miles by default, with 2 and 10 as alternatives. Search all has no limit.

If location is refused, unavailable or times out, Explore says what happened and keeps using the home area or the postcode. A town name that is not built in is **not** sent to a geocoder (the shared location endpoint would fall back to billable Google Geocoding); the sheet says what can be looked up instead.

When Nearby has little to show it says so plainly: the places on record within 5 miles, the nearest one, and one tap each for "Within 10 miles instead" and "Search all of London". It states that this is the places on record, not every place there is.

## Categories, soft play and trampoline parks

`src/utils/venue-classification.ts` maps each place to one of the five groups from its stored category, its name, and what its own evidence says. Where the stored category is wrong or too coarse, a **reviewed map in code** (real place ids, each with its reason) overrides it. No stored row is changed, because the discovery upsert rewrites category on the next live search.

Soft play and trampoline parks are separate things. Searching "soft play" lists places whose evidence shows soft play, with the source named on the card ("its FAQ mentions soft play areas for toddlers and kids"). Trampoline-only parks sit under their own heading, "Also: trampoline parks". Searching "trampoline" does not return a soft play centre that says it has no trampolines.

## Age: no standalone filter, on purpose

0 of 149 places carry a recorded age range, so a "Suitable for my children" filter would either hide nothing or invent limits. Every card says which of three things its age line is:

- a **recorded limit** for this place,
- **typical for that kind of place**, with no limit recorded,
- or **not recorded**.

Only a *confirmed* hard conflict (a recorded limit that rules a child out, a must-have the planner has confirmed is missing) hides a place. Unknown is never treated as incompatible.

## Three kinds of "no"

1. **Fails** a filter (an outdoor filter on a museum): not a result.
2. **Confirmed conflict** (Parking, and the place's own page says there is none): hidden by default, **counted**, shown on request with the reason.
3. **Not checked** (nothing recorded either way): never a result and never a conflict. Listed apart, marked "not checked", with a count.

Indoor and Outdoor can be combined. They come from the kind of place, so cards say "Usually indoor" and not "Indoor".

When filters leave nothing, the screen says so, shows what each active chip is costing in places ("Take off Outdoor · 1 place"), and takes one off per tap without losing the others.

## Map

On-device map using the existing basemap and pin helpers. It draws the Nearby ring and where you are looking from as an approximate area (never an exact dot), numbers the pins as the list is numbered, and uses the same results. Switching List and Map keeps the count, the filters and the search.

## Data, privacy and cost

- No new endpoint, no migration, no data change, no new dependency.
- **No new Google request.** Explore only filters, ranks and draws places already loaded and cached. In the browser journeys the run asserts zero requests to Google on open, on every filter, on search, on widening and on the map.
- No live search in a new area in this version. Coverage beyond what is loaded is the catalogue expansion plan's job.
- The only external call is postcodes.io for a typed postcode.
- Precise coordinates never leave the phone.

## Where the code is

| Area | Files |
|---|---|
| Classification and search | `src/utils/venue-classification.ts`, `venue-taxonomy.ts`, `explore-search.ts` |
| Distance, coverage, results | `src/utils/explore-geo.ts`, `explore-results.ts`, `explore-evidence.ts`, `explore-list.ts` |
| Location (no paid calls) | `src/services/explore/area-lookup.ts`, `device-location.ts`, `explore-map.ts` |
| Screen and parts | `app/(tabs)/explore.tsx`, `src/components/explore/*` |
| Fixture | `scripts/fixtures/explore-places.mjs`, `scripts/serve-places-fixture.mjs` (`FIXTURE_EXPLORE=1`) |

## How it was tested, and what that does and does not prove

**Unit tests (Vitest, whole suite):** 228 files, 3,758 tests pass. New: classification (10), search (10), geo (17), results (19), map (6), list (4), and the updated taxonomy, navigation, placeholder and wording tests. Both TypeScript projects typecheck.

**Browser journeys (Playwright against a fixture, desktop Chromium emulating a phone viewport).** `scripts/verify-explore-journeys.mjs`, 71 checks:

1. Soft play within 5 miles is genuine soft play, not trampoline parks.
2. Indoor museum, ages shown as typical and not as a limit.
3. Farm with confirmed parking and baby changing: none does, it says so, and one tap relaxes it.
4. Playground nearby, then the map.
5. A named attraction across London.
6. Location denied, then a postcode. Also: location granted, and where it is not kept.
7. Restrictive filters, an honest explanation, relaxing. Also: a thin area.
8. Open a venue and create a plan.

Journeys 9 and 10 (add an optional lunch, save and reopen; plans saved before it keep their lunch choices) belong to the lunch change (PR #201). They were run against a **local, unpushed merge** of this branch and the lunch branch: the merge was clean, `verify-optional-lunch` passed in full (including a day saved before lunch was optional keeping its lunch), the Explore journeys above passed again on the merged build, and the merged unit suite passed (3,776 tests, the three that read a built bundle run against that bundle). Nothing from that merge was pushed.

**Accessibility audit** (`audit-accessibility.mjs`, axe plus target size, names, reading order, 320 to 430 wide): clean on Explore, the where sheet, Search all, the map, an empty result and the filter sheet. It first found three real faults in this work, now fixed: the List and Map control was 36 high (now 44), the search field's wrapper was an unnamed tab stop, and the numbered map pins read out of top-to-bottom order. The pins are now the one reviewed exception to the order check, because they follow the numbered list below (and each place is also a full card in the List).

**The CI capture job, replayed locally** against this branch's build with the CI fixture: Home against the locked frame, element-by-element diff, deck gesture, plan screens against the approved design, the phase-2 journey audit, onboarding, Meet halfway at larger text, provider attribution (13 checks) and the photo-evidence report all exit 0. Plus create-a-plan journey (157 checks), release journeys, navigation clearance, product coherence, dynamic content (43), Explore clearance and the admission card.

The older browser verifiers that touch Explore were updated for the new screen, not loosened: where they asserted a count or a label that the design replaced, the new assertion states the new behaviour. Two measurement fixes are worth naming: the Explore clearance check no longer counts the navigation's own labels as page content, and it now scrolls to the end of the list before reading the "not checked" count, because that count is listed after the matches.

**What this does not prove.** These are simulated runs. Headless Chromium cannot show a real iOS location permission prompt, the real Safari toolbar, real Dynamic Type, or real touch feel. Location denial and grant were simulated by injecting the browser's geolocation answer. **A pass on a real iPhone is still required** before anyone relies on it, and a real-device check of the location prompt in particular.

## iPhone review route

Open the Preview (the branch's Vercel preview). It reads the stored catalogue only. Google is off outside production by design (`places-budget.js`: the master switch defaults to production only, and the usage ledger shows no preview call since 3 October), so nothing in this route can cost anything.

1. **Nearby and Search all.** Open Explore. Expect "Near <your area>, Your home area" and a count such as "N places within 5 miles". Tap **Search all**: the count rises to every place loaded. Tap **Nearby** again.
2. **Soft play search.** In Search all, type `soft play`. Expect four places whose own pages mention soft play, each saying where that comes from and that the age line is typical, not a limit. Expect a separate heading "Also: trampoline parks" with two more. Then type `trampoline`: Flip Out Canary Wharf must not be listed, because its page says it has none.
3. **Combined filters.** Tap **Parks & playgrounds**, then **More** and choose Playground and Toilets. The count falls and a line at the end says how many places are "not checked". Then choose **Soft play & trampolines** with **Outdoor**: expect "Nothing matches all of these" and one-tap "Take off" buttons.
4. **List and Map.** Tap **Map**. Expect a dashed ring, numbered pins and "Your area" as a circle, never a dot. Tap a pin, then **List**: same results, same filters.
5. **Current location.** **Change**, then **My current location**. Allow: "Near you". Then **Change** again and try Don't Allow (reset under Settings, Safari, Location): it says location is off and keeps using your home area. Try a postcode in **Another area**.
6. **Venue to Create a plan.** Open any card, **View family details**, **Create a plan**, then build the plan and read the timeline.

Counts depend on the day: stored places leave Explore 30 days after they were last fetched (see `docs/FRESHNESS_DISCOVERABILITY.md` in the catalogue docs pull request).

## Known limits

- **Larger text.** The category and quick-filter rows scroll sideways. At 135 to 235 per cent text the larger-text checker flags them for reaching past the right edge, as it already flags Home's "For you" rail. It finds nothing else on Explore (no clipping, overlap or small target). Wrapping the rows at larger text sizes needs the device's real font scale and a real-device check; it is a follow-up, not done here.
- **The Map and Google's terms.** The Map draws Google Places positions on the app's own basemap. Google's Places terms (section 5.3, "No use with a non-Google map", as I read it from search summaries; I could not open the primary text) may not allow that. The Meet halfway map already does the same. Until the places carry coordinates from a source that allows it (see the open-data work), this needs a decision before merge: hide the Map in production, or accept the risk. I have not changed it.
- **No age or price filter** until the data exists (see `docs/CATALOGUE_EXPANSION_PLAN.md`, phase C).
- **Towns** are looked up only as postcodes, outcodes or 13 built-in towns.
- **Coverage** is what is loaded and cached. Nearby will often be thin outside central London, and says so.
- **Restaurants mode** is preserved from before. It is not visually re-verified in this change.
- `venueService.searchArea` is no longer used by Explore and is left in place.

## Rollback

Revert the merge commit. There is no data, API, migration or configuration to undo.

## Screenshots

Taken by the browser journeys at 393 by 852 against the fixture (simulated, not a device). In `docs/explore-nearby/`:

| File | Shows |
|---|---|
| `explore-nearby.png` | Nearby, the default |
| `j1-soft-play.png` | Searching "soft play": genuine soft play, with its source and an age line that is typical, not a limit |
| `j2-museums-indoor.png` | Museums and Indoor |
| `j3-empty-relax.png` | Restrictive filters, an honest explanation, one tap to take one off |
| `j4-map.png` | Parks and playground on the map |
| `j5-named.png` | A named attraction in Search all |
| `j6-denied.png` | Location off: it says so, and a postcode still works |
| `j7-empty.png`, `j7b-thin.png` | An empty result, and a thin area that offers a wider search |
