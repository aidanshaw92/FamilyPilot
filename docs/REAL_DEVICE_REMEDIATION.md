# Real-device remediation (after #161)

Base: `main` at `a9d2525`. Source: the owner's first full real-device run of the production app on an iPhone.

The run was positive: onboarding → Home → Venue Detail → Create a Plan → Plan → Explore → Meet halfway → Profile now reads
as one product. This pass removes the friction and semantic slips the run exposed. It does **not** redesign anything, add a
provider, change the evidence/privacy/spend architecture, or touch the photography work.

| Item | Class | Outcome |
| --- | --- | --- |
| P0 Home looks broken while loading | A (existing contract: Home is the curated answer) | Fixed |
| P1 "Family name" under "Who else is in your household?" | B (meaning strongly evidenced) | Fixed |
| P1 Time to first value / onboarding | Investigated | Structure kept; Home's wait now overlaps the last step |
| P1 Plan evidence not stop-type aware | B | Fixed with a reusable contract |
| P2 "Nobody has confirmed these" | B | Reworded, honesty unchanged |
| P2 "Aidans" on Meet halfway | B | Fixed with one display-name rule |

---

## P0: Home must not look broken while loading

### Root causes (each reproduced against a build of `main`)

Measured with `scripts/verify-home-loading.mjs` against the local fixture. The slow real device was modelled as a 6 s places
search, a 9 s weather lookup and 3 s photographs. Full numbers for 360/390/393/430 are in
`docs/real-device-remediation/home-loading-{before,after}.json`.

1. **The only loading state was one plain grey block the size of the whole deck.** `app/(tabs)/index.tsx` rendered
   `<Skeleton height={deckHeight} />`, a single pulsing rectangle about 430pt tall with nothing in it. That is the "giant
   blank card".
2. **The list waited for the weather, with no limit.** `venueService.getNearby` did `Promise.all([delay(300), search,
   weather])`. Weather only nudges the ranking, but the list could not appear until it answered. `fetch` had no timeout.
   On `main` this held the cards back even when the places list was already cached on the device: a reopen inside the
   ten-minute cache still showed the plain block until the weather answered.
3. **Nothing the device already held was shown.** The client places cache was discarded after ten minutes, so every
   later visit waited on the network with the plain block.
4. **Home's request only started when Home existed.** The search is London-wide and identical for every family (it is
   personalised on the device afterwards), but it was first sent after onboarding finished and Home mounted.
5. **A card's photograph showed a grey block until it arrived.** `VenueImage` drew a 120pt pulse strip on grey while
   pending, which on a full-bleed Home card reads as blank.
6. **The header changed after first paint.** The profile query had a fixed 200ms delay although the profile is on the
   device, so Home first said "Good morning, there" and "Picked for your family", then the family's names.
7. A fixed `delay(300)` sat in front of the list (a mock-era leftover), so even a cached list took at least 300ms.

**Investigated and left unchanged:** the places search endpoint (`api/places/search.js`). On a CDN and search-cache miss it
builds the consumer evidence for up to 160 places with three database reads each (`getConsumerMetadata`). That is
plausibly most of a cold request's time in production. It is evidence architecture, so it is out of scope here and is
recorded as a follow-up. Repeat loads are answered by the CDN (`s-maxage` = 6h). Production latency could not be measured
from this environment: the production and preview hosts are blocked by the sandbox network policy.

### What changed

- **Kept list first, then refresh (stale-while-revalidate).** The client keeps the last London search showable for six
  hours. That is the server's own search-cache window, which the CDN already serves with `s-maxage`, so a parent is never
  shown anything older than a fresh request could return. `useHomeVenues` shows the fresh list when it has it and the
  kept one (re-ranked for the family as it is *now*, device-only, no request) until then. A failed refresh never removes
  picks already on screen. The fresh-cache rules are unchanged: the network is still skipped only inside ten minutes.
- **Home's request starts when setup completes**, while the next screen is read. It is exactly the request Home sends
  next (same URL, same CDN/cache path), skipped if a fresh copy is held. A Home that mounts while it is running waits for
  it instead of sending its own (in-flight de-duplication in `PlacesRepository`).
- **Weather gets 2.5s** (`HOME_WEATHER_WAIT_MS`). Past that the list ranks without it, exactly as it already did when
  weather failed. No artificial delay.
- **A deck-shaped skeleton** (`RecommendationDeckSkeleton`) replaces the plain block on a first run. It shows the
  foreground card and the two rear strips at the deck's exact geometry (`deckMetrics`/`deckSlot`, the functions the deck
  uses), the card's furniture as placeholders, and one line: "Finding today's best places for Ozzie…". It is placed in
  the deck's own slot, so the cards arrive without anything moving.
- **The photo placeholder is the category illustration** (`CategoryArt`, the approved no-photo fallback), with the photo
  fading in over it. It is hidden from screen readers, because it is not what the place looks like. The no-photo path is
  unchanged.
- **The profile is the query's initial data** (`familyService.getProfileNow`), so the greeting and "Picked for…" are right
  on the first frame.

### Before → after (393pt; every width behaves the same)

| Scenario | main | this branch |
| --- | --- | --- |
| First run: cards appear | 9.36s, plain empty block for 8.8s | 6.35s (the search itself), deck-shaped skeleton with the family's line |
| Slow weather (search 0.3s) | 9.32s (held for the weather) | 2.91s |
| Reopen, list on device (fresh) | still held for the weather (plain block for the whole 3s sample) | 0.14s |
| Reopen, list past its fresh window | plain block until both requests answer | 0.25s, refreshed in place, cards never removed |
| Slow photo | grey block on the card | category illustration, photo fades in |
| Greeting | "Good morning, there" → "…, Aidan" | "Good morning, Aidan" from the first frame |
| Header / chips movement | 0px | 0px |
| Deck vs placeholder position | n/a | 0px top, 0px height |

The category chips are still derived from the list, so on a first run the rail shows "For you" alone until the list
arrives, and the other chips then appear beside it. They are added horizontally in a row of fixed height, so nothing
moves vertically. On a returning visit the kept list supplies them at once.

---

## P1: "Who else is in your household?" asked for a "Family name"

**What the code said.** The field was `familyName`: the household's surname ("Shaw" → "Shaw family" on the parent's own
screens). The per-person field ("First name" + relationship) only appeared after tapping "+ Add another adult". So the
first and only field under a question about *people* was a *surname*, labelled "Family name", and a parent typed their
partner's first name into it. The owner's reading ("that field expects the other person's first name") describes what
the screen *invited*, not what it stored. The model was right; the screen asked the wrong thing first.

**Fix (no model change).**
- The step opens with one person card: **"Their first name"**, then "How they're connected to you" with the
  relationship chips underneath.
- A card left blank means "just me": it is never saved and is no longer an error.
- The household-level label is kept, moved below the people, and named for what it is: **"Household name (optional)"**,
  "Your family's surname, shown as 'Shaw family' on your own screens. Never shared." No surname is required of anyone.
- Edit profile uses the same words ("Their first name", "Household name").
- Meet halfway's "Add a family by postcode" now says "Their first name" and how it will be shown.

**Audited, unchanged:** a child's field is "Name" under "Who are we planning for?" (a first name; not the reported
confusion). The Plans tab's older `FamilyEditor` ("Family label") edits a planning family's raw label; it is not part of
onboarding or Profile, and is left alone.

---

## P1: Time to first value / onboarding

**Steps:** account → parent (name + area; one free postcode lookup) → household (optional) → children → how they get
around → naps and feeds (only for a child young enough) → "Who do you plan days out with?" (optional) → Home.

**System waiting** in that path is: the postcode lookup on the first step (one free request) and **Home's first list**,
the ~10s the owner saw. Everything else is the parent's own input time. Each input step powers something specific:
- household → Who's coming and named attendees;
- children → ages and Family Fit;
- getting around → buggy and step-free must-haves;
- routines → leave-by and routine advice, the behaviour the real-device run rated most useful.

**The Connected Families step** is already the last step, marked "LAST STEP · OPTIONAL", with one-tap "Do this later". It
asks for nothing (no email, no phone) and costs a single tap.

**Conclusion: keep the structure.** The time-to-value problem was the Home wait, not the steps. The wait is now started
at the end of setup, so the seconds a parent spends on the optional invite step overlap Home's search instead of adding
to it. Moving the invite after the first plan would remove that overlap and the natural "invite your partner" moment
while saving one tap, so it is not changed. If a later real-device run shows parents stalling on it, showing it after
the first plan is a small change.

---

## P1: Generated-plan evidence is stop-type aware

**Root cause.** The sequencer matched every stop against the same family request and put every unknown evidence field
into one plan-wide list, worded "…here" / "…for this place". A lunch stop from OpenStreetMap carries no reviewed facts at
all, so it always added "Recommended ages are not published for this place" and "What a visit costs is not confirmed".
Under lunch, those read as mechanical.

**Contract** (`src/services/planning/stop-evidence.ts`, applied in the sequencer before any evidence is used):

| | Attraction (a day-out place) | Lunch stop | Café/restaurant chosen as the day's venue |
| --- | --- | --- | --- |
| Journey | yes | yes | yes |
| Confirmed age rule at the door | yes | yes | yes |
| Recommended ages | yes | no | no |
| Visit cost | yes | no | no |
| Indoor / outdoor | yes | no (the day's setting is about the activity) | yes (it is the activity) |
| How lively | yes | no | no |
| Visit length | yes | no | no |
| Buggy access, toilets, baby changing | yes | yes | yes |
| Parking (only ever a family's own must-have) | yes | yes | yes |
| Opening at the time the plan arrives | yes | yes (checked by the sequencer for every stop) | yes |

No food facts are invented: FamilyPilot holds no highchair or children's-menu evidence, so none is claimed or asked about.
Outcomes are untouched:
- a confirmed missing must-have is still a hard conflict at any stop;
- an unknown must-have is still "check before you go";
- routine conflicts are still advice;
- informational timing is still a note.

Each unconfirmed line now names its stop ("Baby changing is not confirmed at Mapped Kitchen"), because "here" did not say
which stop in a two-stop day.

---

## P2: Uncertainty in a parent's words

- The plan's unknowns heading "Nobody has confirmed these" is now **"Check before you go"**.
- `create-plan` failure lines say "Baby changing isn't confirmed at X" / "It isn't confirmed whether X works with a
  pushchair" instead of "Nobody has confirmed…".
- "How busy or lively it gets has not been reviewed" now ends "…is not confirmed".
- "Whitechapel Gallery: opening hours not confirmed" now reads "Opening hours not confirmed at Whitechapel Gallery".

Every line still says *not confirmed / not published*, never a yes or a no (pinned in `unknown-facts.test.ts`).

**Left as is:** post-visit questions say "Nobody has confirmed this yet" to explain why the parent is being asked; there
it is the honest reason and reads naturally. Provenance labels (confirmed by the venue, parent-reported, needs a
recheck) are unchanged.

---

## P2: "Aidans" on Meet halfway

**Trace.** A connection's label is always "X's family" (`connection-snapshot.ts`). A family added by postcode is labelled
with the first name typed for them and was printed bare: in Meet halfway's chips and journey rows, Profile, the plan
sheet and the Plans tab. No code path turns "Aidan" into "Aidans", so the label shown was a typed one, shown as if it were
a family. Separately, every sentence that added "'s family" to a label produced "Alex's family's family" for real
connections ("the nap for Hannah's family's family").

**Fix.** One rule, `familyDisplayName`, used wherever another family is named:
- "Hannah" → "Hannah's family", "James" → "James' family";
- "Aidan's" / "Aidan's" (either apostrophe) → "Aidan's family";
- "Alex's family", "Shaw family", "The Hills", "A FamilyPilot family" are kept as given;
- an empty label becomes "Another family".

Nothing is looked up or sent anywhere. The privacy model is unchanged.

---

## Protected (regression-tested, unchanged)

- Family Fit sentences and multi-child rules.
- The Create a Plan structure (date, arrival time, named attendees, duration).
- Meet halfway:
  - stored-catalogue candidates;
  - zero paid routing and approximate journeys;
  - fairness;
  - both families' Family Fit;
  - consented routines;
  - unknown must-have → check, confirmed miss → excluded;
  - "That start has already gone…" with a one-tap corrected start.
- Profile and Connected Families: consent, device-local child data, explicit sharing.

## Follow-ups recorded, not done

- `api/places/search.js` consumer-evidence overlay: three database reads per place on an uncached request. Batch it.
- VoiceOver/TalkBack and native iOS rendering of the skeleton and placeholder were **not** verified (web build only). A
  real-device check of the first-run Home is the next step.
