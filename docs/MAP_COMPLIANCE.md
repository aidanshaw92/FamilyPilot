# Map compliance: where Google Places content meets a map

**Status:** the Meet halfway gate is implemented on `fix/map-compliance` (draft PR on `main`). The Explore map has the same gate in the Explore PR (#203). Nothing here changes a database row.

## The rule we are enforcing

Google's Maps Platform terms for Places content (section 5.3, "No use with a non-Google map", in the versions I could find summarised) do not allow Places content to be shown on or with a map that is not a Google map. Section 5.1 allows Places content without a map, with attribution. I could read only summaries of the terms from this environment (the primary pages are not reachable), so the rule below is the conservative reading, and it should be checked against the live terms by the account owner.

FamilyPilot draws its own maps (Natural Earth shapes compiled into the app, `src/data/london-basemap.ts`). They are not Google maps. So:

> A place is drawn on the app's own map only if its record says it came from an independent source (`osm` or `mock`). A place from Google, from an unknown provider, or from `familypilot` (a record whose own origin is not recorded) is never drawn.

`familypilot` is excluded on purpose. A `familypilot`-provider row can be a Google row that was re-saved, so it is not evidence of independence. Unknown is treated as Google, not as safe.

The map is offered only if **every** place on the screen can be drawn. A screen that shows Google content beside a non-Google map, even if the Google place has no pin, is the situation the terms describe, so a single Google place switches the map off for that whole screen.

## Audit: every place we draw or locate

| Surface | Coordinates come from | Map it is drawn on | Google-derived content on screen | Cached coordinate retention | Before | After the fix |
|---|---|---|---|---|---|---|
| Meet halfway map (`HalfwayMap`, shown by `MeetHalfwayView`) | Place `latitude`/`longitude` from `/between`, read from `place_records` (today's catalogue is Google rows, 142 served; the only independent rows are two OpenStreetMap museums, Kingston Museum and Chiswick House) | FamilyPilot's own compiled map, not Google | Name, address, hours, facility facts, rating-derived text, Google Maps mark | `place_records` keeps the coordinates indefinitely; the client holds them in the React Query cache and in saved plans | **Plotted** every place, including Google ones | **Not plotted** unless every place is `osm`/`mock`; otherwise a list with a short note |
| Meet halfway list | Same | None | Same | Same | Cards opened the map on tap (no card actions at normal text size) | Cards open the place and offer "Plan this day"; the footer no longer mentions a map |
| Explore Map (PR #203, not on `main`) | Same | FamilyPilot's own map | Same | Same | Plotted every place | Same gate: the List/Map toggle appears only when every row is plottable |
| Venue and Plan screens | Coordinates are used to estimate journey times, not drawn | None | Google content with attribution | Same | No map | Unchanged. See "Not a map issue, but related" |
| Home deck, search results | None drawn | None | Google content with attribution | Same | No map | Unchanged |
| Outbound links | None | The user's own maps app, opened by an address string | None | None | None | Unchanged |

Nothing in the app calls a Google Maps tile, Static Maps or JavaScript API. The browser check in `verify-map-compliance.mjs` asserts that no request goes to a Google host while Google places are on screen.

## What users see now

- **Google places only (everything served today):** a list. The header says the map is off and why, in a sentence a parent can read. Each card has "Open this place" and "Plan this day". The Google credit stays.
- **All places independently located:** the map, pins and List/Map toggle exactly as before.
- **A mix:** the list, with the same note. No partial map.
- **No places yet:** the map shows the two families' areas only (as before).

## Production exposure

- The Meet halfway map has been on `main` since #163 (`a7c6d81`), then #194 and #196. So production has plotted Google Places rows on a non-Google map for as long as those PRs have been deployed. I could not confirm the live deployment date (the deployment API returned 403 for this session), so treat it as live until the account owner confirms otherwise.
- Smallest immediate mitigation: merge this fix (one component gate, one helper, no data change). It needs no migration and no environment variable, and rolling it back is a revert.
- Explore is not on `main`, so it has no production exposure. The gate is in the Explore PR so it cannot ship without it.

## Not a map issue, but related (flagged, not changed)

These are separate retention exposures. They are outside this fix and need your decision:

1. `place_records` stores Google-derived content (name, address, coordinates, hours, summaries) indefinitely and has a public-read policy. The 30-day rule for Places latitude/longitude applies to the stored copy, not just to what the app serves. The catalogue gate stops *serving* old rows, it does not delete them.
2. Saved places (device store, plus `saved_places_backups` in Supabase) keep the whole venue, Google content included, with no expiry.
3. Saved plans keep venue snapshots the same way.
4. Journey times use stored coordinates, so a coordinate older than 30 days is still being used for a calculation.

Proposed handling (needs approval, nothing done): keep the place ID, drop or null the Google fields on expiry in storage as well as in the API, and re-fetch only on user demand. That is a data change, so it waits for approval.

## Tests that keep this from recurring

- `src/__tests__/map-compliance.test.ts` (14): provider allow-list, the "every place" rule, unknown and `familypilot` providers, empty list, a mix, and that the Halfway view takes its decision from the helper.
- `scripts/verify-map-compliance.mjs` (runs in CI): scenarios A to D above in a real browser, including "no request to a Google host".
- The larger-text, accessibility, handoff and screenshot scripts now serve their map fixtures as independently located places (`scripts/lib/place-provider.mjs`), so they still test the map layout without pretending Google places can be drawn.

## Does #207 fully resolve it? What is left, 14 October

**On the map itself: yes, for everything that can reach a parent once it is merged.** The checks, not my reading, are the evidence:

| | |
|---|---|
| Meet halfway | A Google, unknown or `familypilot` place is never plotted, and one of them switches the whole screen to the list. 14 unit tests, a browser check in CI (Google places: no map, no toggle, no request to a Google host; independent places: the map; a mix: the list), the larger-text check at 1.35, 1.9 and 2.35, and an accessibility audit of the list that replaces the map (clean at 320, 360, 393 and 430). |
| Explore | `main` has no Explore map. #203 carries the same gate. I merged #207 and #203 in a scratch tree: one trivially resolvable conflict in an audit script, both TypeScript configs clean, and 40 tests pass, including the source scan that fails if **any** file renders `HalfwayMap` or `ExploreMap` without going through the rule. So whichever merges second, the scan checks the other. |
| Any other map | None. A search of `src` and `app` for map components, map libraries, tile and static-map addresses finds only `HalfwayMap` and `ExploreMap` (#203). Venue, Plan and Home show addresses and links. The four places that open Google Maps (`app/venue/[id].tsx`, `app/restaurant/[id].tsx`, `RestaurantCloseByCard`, `StoreCard`) are outbound links to Google's own map, which the terms allow, and a test pins that list. |

**What remains, and is not a map issue (so #207 does not touch it):**

1. **Production exposure until #207 is merged.** The Halfway map has been plotting Google places on a non-Google map since #163. I could not confirm the live deployment (the Vercel API returned 403), so treat it as live. Smallest mitigation: merge #207 (one commit; no data, migration or variable).
2. **Preview deployments of branches that predate #207.** I checked each open branch: all of them still contain the ungated Halfway map, so each one's Preview plots the stored Google places on it. That is #201 (optional lunch, the one you are reviewing on your iPhone), #190, #189, #184, #187, #179, #202, #204, #205, #206 and #208. Google is off on Previews, but the stored Google rows are served. Only #207 is clean for Meet halfway; #203 has the Explore gate but still carries the old Halfway map until it takes #207. Each stops when its branch takes `main` after #207 merges (a merge commit). I have not pushed to #201, because you asked me to leave it as it is; say if you want that merge.
3. **Storage and calculation (the first list above).** Google content kept past 30 days in `place_records` (publicly readable), saved places and their Supabase backups, saved plans, and journey times computed from Google coordinates older than 30 days.
4. **The legal reading.** I applied the conservative reading of Google's terms from summaries. If counsel reads section 5.3 differently, the rule can only get looser, never tighter than this.
