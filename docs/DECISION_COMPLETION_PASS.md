# Decision-completion pass (after #162)

Base: `main` at `da0f098`. Source: the owner's second real-device run of production on an iPhone.

The three jobs this pass strengthens:
- **What works for us**: Family Fit, opening hours, buggy or sling.
- **Where should we meet**: the Halfway tab and the map.
- **Organise it**: save, View plan, Add to calendar.

No redesign. No new paid provider. No change to the evidence, privacy, auth or spend architecture.

---

## P0: Home cold load

### What was measured, and what could not be

Production (`family-pilot-seven.vercel.app`) and every preview host are blocked by this environment's network policy, so
**no production or device timing was taken here**. Everything below is a local measurement or a stated model. The
real-device figure (about 10–12 s to the first card) is the owner's.

1. **Server round trips: measured, exact.** `scripts/bench-places-search.cjs` runs the real handler (`api/places/search.js`)
   in-process. It uses a fake Supabase client that counts every query and can charge latency, against a 160-place London
   catalogue, half of it with reviewed evidence. The search-cache hit is the path a request takes when the CDN misses.

   | | main | this branch |
   | --- | --- | --- |
   | Database round trips per London search | **410** | **12** |
   | …of which the evidence overlay | 404 (metadata 160, claims 160, visit reports 80, households 4) | 6 |
   | Peak concurrent queries | 160 | 5 |
   | Handler time, model 15 ms/query, pool of 10 | 746 ms | 159 ms |
   | Handler time, model 40 ms/query, pool of 10 | 1,896 ms | 294 ms |
   | Handler time, model 15 ms/query, pool of 20 | 455 ms | 142 ms |
   | Handler time, model 40 ms/query, pool of 20 | 1,100 ms | 301 ms |
   | Response payload | 119 KB | 119 KB (unchanged) |

   The benchmark runs as a Preview, so neither column includes Production's discovery write to `place_records`. In
   Production that write adds one round trip: before the overlay on `main`, alongside it on this branch.

2. **Client work: measured locally.** Merging and personalising 160 places takes 20–35 ms in Node. A phone is slower, but
   this is not where seconds go.

3. **Client request order: measured on the fixture.** Search and weather start together; the cards render about 0.3 s
   after the response. Since #162 the request is prefetched at the end of setup, so on the device the wait was server time.

### Root causes found in the code

- **N+1 evidence overlay.** Every place returned (about 160) had its consumer evidence built separately, with three or
  four chained reads each (`getConsumerMetadata`: metadata, then claims, then visit reports, then households). That is
  about 410 round trips, up to 160 at once, on every request the CDN does not answer. The same pattern was in Meet halfway's
  catalogue search.
- **A write in the way.** The production discovery upsert (`place_records`) ran before the overlay, adding a round trip
  that nothing after it needed.
- **Sequential reads that are independent.** The catalogue read waited for the cache read, and the food lookup waited for
  the evidence overlay.
- **Likely, not verifiable here: region.** Supabase is in `eu-west-1` (Ireland). `vercel.json` sets no function region,
  so unless the project dashboard does, functions run in Vercel's default `iad1` (Washington DC). Every round trip then
  crosses the Atlantic (about 80 ms), which multiplies the 410 above. **Owner decision** below.
- **Cold starts and the post-deploy CDN.** A deployment empties the CDN, so the first Home after each deploy (as in the
  real-device run) always reaches the function, often cold.

### What changed (no evidence change)

- `getConsumerMetadataBatch` (consumer-projection.js) reads metadata, claims, visit reports and households with set-based
  queries in chunks of 100, then runs the **same pure projection** per place.
  - `evidence-batch.test.ts` proves it returns exactly what `getConsumerMetadata` returns for every case: reviewed, AI
    draft, no metadata, expired claims, auto-approved claims, a field disputed by parent reports (partners counted as one
    household), and superseded claims.
  - The same test proves the round trips do not grow with the number of places.
  - **Paged reads.** Supabase (PostgREST) returns at most 1,000 rows per request and truncates silently. One venue never
    came near that, but 100 venues' claims or visit reports together can. Every set-based read now pages (`readAllRows`,
    ordered by `id` last so pages neither overlap nor skip). The test client enforces the same 1,000-row cap; a chunk of
    1,500 claims and 1,200 reports gives exactly the per-place answer, and with paging switched off those tests fail.
- The search endpoint and Meet halfway's catalogue search use the batch.
- The discovery upsert runs alongside the evidence and food reads instead of before them. It still runs on every
  production Explore search, cache hits included: the cache is shared with Previews, which never discover, and a failed
  upsert is retried by the next search.
- The catalogue read starts alongside the cache read, and the evidence overlay runs in parallel with the food lookup.
- **Instrumentation, zero cost.** Every successful search response now carries `Server-Timing` (budget, cache, provider,
  catalogue, evidence, total) and `X-FamilyPilot-Region`, and logs one `places_search_timing` line. To read a
  real breakdown from the phone's network:

  ```
  curl -sI 'https://family-pilot-seven.vercel.app/api/places/search?lat=51.5074&lng=-0.1278&radiusKm=40&scope=london&intent=explore' \
    | grep -i 'server-timing\|x-familypilot-region\|x-vercel-cache'
  ```

  A CDN `HIT` replays the timings of the origin request that filled it.
- Unchanged: the budget is still primed before anything can spend (pinned by test). The #162 skeleton and
  stale-while-revalidate are intact.

### Owner decision: function region

Add `"regions": ["dub1"]` to `vercel.json`, putting functions in Dublin next to the Supabase project (and next to London
users). It is free on every plan. It changes where every function runs, including where Google requests originate, so it
is yours to approve. First check the project's Functions region in the Vercel dashboard. If it already says Dublin, nothing
is needed. `X-FamilyPilot-Region` on a production response will show it either way.

---

## P0: "Possible for your family today" above "Closed for today"

**Cause:** today's opening state fed the suitability verdict.
- Already closed for the day became a soft caution, so the verdict was "Possible".
- Closed all day became a breach, so "Probably not…", which also wrongly called a good place a poor fit.
- The headline then appended "today" whatever the clock said.

**Rule now:** SUITABILITY and TODAY'S AVAILABILITY are separate (`family-match.ts`).
- Shut today never lowers the verdict, never removes the place, and never disables planning another day.
- Nothing about a shut place is worded as a claim about today:
  - the headline reads "Good for Sloane, but not today";
  - "Closed for today · opens tomorrow 10am" leads the cautions and the card note;
  - routine timing ("leave by…") and "good weather today" are not given for a day you cannot go.
- A confirmed breach still makes it poor ("Probably not for your family", no "today").
- "Never open to visitors" is still a breach.
- New field: `availableToday`.
- Create a Plan on a venue shut today now opens on the day it next opens, unless the parent chose a date.
- Tests (`closed-today.test.ts`) cover: open now, opens later, closing soon, already closed, closed all day, unknown and
  malformed hours, and planning on a future date. 13 of 14 fail against `main`.

---

## P1: Home · Explore · Halfway · Plans · Profile

- Meet halfway moved into the tab group (`app/(tabs)/halfway.tsx`). Its URL is still `/halfway`, so deep links still work.
- A link naming a family still selects them when the tab is already open.
- The screen clears the floating navigation and has no back button.
- **Finding:** the brief assumed Saved Places already lived in Plans. It did not: the Plans tab's "Saved plans" chip holds
  saved *plans*, and saved *places* were only reachable from the Saved tab. So Saved places became its own screen at the
  same `/saved` URL (with a back button), opened from a new "Saved places · N" card in Plans. The Plans card for Meet
  halfway is gone, because it is now a tab.
- Still five tabs, so the approved pill keeps its geometry.
- New Halfway icon in both frames' stroke language: a pin over a dashed line joining two dots. Glyphs are drawn around
  their own centres, so reordering tabs moved no vectors.

---

## P1: Halfway map

### Architecture and provider

The map is drawn **on the device, from data shipped with the app**: `src/data/london-basemap.ts`, 45 KB, generated by
`scripts/build-london-basemap.mjs` from Natural Earth 1:10m vectors.
- **Contents:** London borough and county outlines, the Thames, motorways and main A-roads.
- **Licence:** Natural Earth is public domain; credited anyway.
- **Rendering:** react-native-svg, which is already a dependency.
- **What it doesn't need:** tiles, a provider, an API key, a request or an account.

### Privacy model

- **Families are AREAS.** Both positions are cut to the two-decimal grid a connection already shares (about 1 km), so the
  map shows nothing about the other family beyond their shared snapshot. This family's own home is treated the same way.
- **Each area is a soft dashed circle** about 1.5 km across, labelled "Your area" and "Hannah's area". It is never a dot.
- The map never zooms closer than 6 km across.
- **The venue** is a pin at its real location.
- Labels stay inside the frame at every width: the margin grows with the distance between the families, and a label
  near an edge hangs inwards from its circle (tested at 300–398 px wide).
- **No routes:** no line joins anything, because FamilyPilot estimates journeys and does not route them. The caption says
  so.

### Cost

| Option | Account | Third party sees viewers | 100 users | 500 | 1,000 | 5,000 |
| --- | --- | --- | --- | --- | --- | --- |
| **Implemented: bundled Natural Earth** | none | nobody | £0 | £0 | £0 | £0 |
| OpenFreeMap tiles (MapLibre, web only) | none | yes (IP + area viewed) | £0 | £0 | £0 | £0, no SLA |
| Mapbox GL JS | yes, with card | yes | £0 | £0 | £0 | £0 (inside ~50k free loads) |
| Google Maps Static | yes, with card | yes | £0 | £0 | £0 | ≈ $20/month |

Assumes about 4 Halfway maps per active user per month (400 / 2,000 / 4,000 / 20,000 loads). The paid rows use public list
prices as last known and must be re-checked before any choice. **No paid or third-party option was enabled.** A richer,
street-level basemap would be an owner decision, against this table.

---

## P1: Saving a plan

- "Saved" is now said only once the day is **confirmed in the phone's storage** (written, then read back, by
  `save-plan.ts`).
- A failed write is rolled back and says "We couldn't save this plan on this phone. Please try again." with Try again.
- A double tap saves once.
- The same day saved again is recognised by its content: "Already in your plans", with no duplicate.
- **After saving:** "✓ Plan saved", then **View plan →** and **Add to calendar**.
- **View plan** opens *that* saved plan, as Plans shows it, with Add to calendar and **See all your plans →**.
  - See all your plans goes to the Plans tab with the row marked "✓ Just saved".
  - Back, from the screen or the phone (Safari's swipe), returns to the plan, which reads "Already in your plans".
  - First built differently: View plan popped to Plans and opened the plan over it. The browser verifier showed that on
    the web this leaves Safari's history behind the app (the phone's Back returned to the plan while the app showed
    Plans), so it became a plain push.
- A day rebuilt by an advice option or "Add lunch" is a new, unsaved day.

## P1: Add to calendar

- **Event model** (`calendar-event.ts`, tested separately from any OS):
  - title "Day out: {venue}";
  - from leaving home to getting home (London time converted to UTC, so it is right across clock changes and past
    midnight);
  - the venue as location;
  - each stop with its times, including lunch;
  - "Times are estimates…".
  - Its UID is stable per saved plan, so adding again updates rather than duplicates.
- **Never included:**
  - a child's name or date of birth;
  - routines, naps or feeds;
  - another family's area, home or timings (only their shared label, "With Hannah's family");
  - evidence, unknowns or provenance.
- **Delivery** (`add-to-calendar.ts`): an `.ics` file, only on the parent's tap.
  - iPhone Safari opens it in Calendar's own Add sheet; desktop browsers download it.
  - **No calendar permission** and no calendar module.
- **Native builds** fall back to sharing the plan text and say so. Native calendar writing would need `expo-calendar`, a
  permission prompt and an App Store usage string: an **owner/store decision**, not taken.
- Available after saving and on any saved plan opened from Plans.

## P1: Buggy / pushchair, Sling / baby carrier

- **Labels (display only):** "Buggy / pushchair" and "Sling / baby carrier".
  - The stored values `buggy` and `carrier` are unchanged.
  - Mobility is recorded per child, and `carrier` means a worn sling/carrier, as the model already documented. No
    migration.
- **Advice, only on evidence.** "A sling or carrier may be easier for Ozzie: …" is said only for a child whose answers
  include **both** a buggy and a sling/carrier (a child who is only carried has nothing to choose). The triggers are:
  - an approved **buggy access** fact of "difficult" or "mixed"; or
  - an approved **terrain** fact (`extendedTerrain`, newly read into Family Fit) of "hilly" or "very hilly", where buggy
    access is not confirmed good.
- **Never triggered by:**
  - the category (park, zoo, farm, museum);
  - visit length;
  - the editorial `terrain` / `terrainNotes`;
  - parent reports alone;
  - unknown evidence.
- **Conflicting evidence** (good buggy access but hilly paths) says nothing.
- **No claim is ever made about "lots of walking"**: no walking-distance evidence exists.
- **For a child who also goes in a sling,** confirmed-difficult buggy access is now a caution with a way round, not a
  breach. For a buggy-only child it is still a breach.

---

## Verification (local web build, fixture servers, zero provider requests)

| Check | Result |
| --- | --- |
| Typecheck | clean |
| Unit tests (Vitest) | 167 files, 2,634 tests passed |
| Create a Plan journey (Save, View plan, phone Back, See all your plans, calendar file), 360/390/393/430 | 153/153 |
| Journey audit, phase 2 | 301/301 |
| Plan screens against design | 56/56 |
| Home against Figma | 89/89 |
| Deck gesture | 11/11 |
| Home loading, 360/390/393/430 | all passed |
| Navigation clearance, all five tabs | all passed |
| Product coherence (realistic fixture) | all passed |
| Onboarding flow (new mobility words) | all passed |
| Place credits | 13/13 |
| Account journey, account QA, post-visit (auth build) | all passed |

Screens: `docs/decision-completion/` (Halfway with the map, Plans with Saved places, Saved places, a saved plan's
footer, the mobility question; each at 360, 393 and 430).

## Not verified here

- Production and device timings: hosts blocked; only the local model and fixture were measured.
- Native iOS/Android rendering, and the native calendar path: only the web build ran.
- VoiceOver/TalkBack on the new map, tab and save confirmation.
- iPhone Safari's handling of the `.ics` (the expected behaviour is Calendar's Add sheet). A real-device check is the next
  step.
