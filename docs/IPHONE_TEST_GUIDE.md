# iPhone test guide (about 40 minutes)

15 October 2026. Three links, all Vercel Previews (they ask for your Vercel sign-in; open them in Safari on the phone). Use your own family profile on the rehearsal link; the two-account canary is a separate run on a computer (`docs/PRODUCTION_CANARY.md`), after this.

| Link | What it is | Use it for |
|---|---|---|
| **A. Beta rehearsal** `https://family-pilot-git-preview-beta-rehearsal-aidanshaw92s-projects.vercel.app` | Explore #203 + reconnect #220 + outage honesty #223 + the 234 Tranche A venues (rehearsal marker, never served in production) | Everything below. This is the beta as it would ship. |
| B. Explore alone `https://family-pilot-git-feat-explore-nearby-aidanshaw92s-projects.vercel.app` | #203 on today's catalogue (Google rows still fresh) | Only if A looks wrong and you want to see Explore without the new venues. |
| C. Production `https://family-pilot-seven.vercel.app` | What families would see today | The "before" for saved places (step 6) and the canary. |

Note: Preview A's catalogue is the **independent venues only** (no Google rows), which is the state after 8 November. Opening hours, photographs and facilities are therefore "not yet checked" on most venues; that is correct, not a fault.

## Steps (tick each; write one line if it fails)

1. **Setup.** Open A. Set up your family if asked (or sign in). Home shows places within a few seconds. Note the time to the first card on Wi-Fi and again on 4G with Wi-Fi off (expect up to 10 s cold on 4G).
2. **Explore, Nearby.** Explore tab. "Within 5 miles" shows a count and cards; change to 2 and 10 miles; the count changes and never exceeds what the radius shows. Tap Museums & galleries, then All. Tap Change (location): enter a postcode; then "Use my location" if you allow it (your position stays on the phone).
3. **Explore, Search all.** Search "kew" (Royal Botanic Gardens, Kew once), "zoo", "farm", "museum". Filters: Toilets, Baby changing, Step-free: a filter that hides places says how many it hid, and the list never claims a facility we have not read.
4. **Map.** List/Map: pins only for independently located places; the credit line is visible; no Google map tiles.
5. **A venue and a plan.** Open London Zoo (Wikidata) and Regent's Park (OS): the name, "Contains OS data © Crown copyright and database right 2026" on the park, "not yet checked" where we hold nothing, no invented hours or prices, website link opens. Create a plan from one: leave and arrive times, routines respected; it reopens from Plans.
6. **Saved places across the cutover.** On **C (production)** save a place and build a day from it. Then on **A**, with the same profile (sign in), open Saved: the row shows "has a new listing"; tap it: the sheet proposes the real successor with kind and distance; tap "None of these": nothing changes; reopen and confirm: the place and the day are repointed, the day's itinerary unchanged, and the notice says plans already made are unchanged. A place with no successor says it is no longer listed and keeps its details. (If your production and Preview profiles are separate accounts, do step 6 wholly on A: save a Google-id place is not possible there, so test with the seeded example from the Saved screen and report what you see.)
7. **Meet halfway.** Together > Meet halfway with any family (or the example): a list between the two areas; Plan this day; the plan carries the date and arrival time.
8. **Errors.** Airplane mode, then open Explore from the tab bar: "Couldn't load" with Try again, never an example venue with facilities or prices. Airplane mode off, Try again: the list returns. Saved with airplane mode on: no "new listing" line, nothing says a place is gone.
9. **Larger text.** Settings > Accessibility > Display & Text Size > Larger Text, largest non-accessibility size: Home, Explore, a venue, a plan: nothing clipped, every control reachable.
10. **Rotate and background** the app mid-load on Explore and a venue; nothing reverts, no blank screen.

## Then

Two-account production canary on a computer (`docs/PRODUCTION_CANARY.md` sections 1 to 6: sign-up ×2, invite and accept, isolation, Meet halfway, plan sharing, sign-out and in, cleanup). Report PASS / FAIL per step; a FAIL on sign-up, invitation, sharing, isolation or privacy is a release NO-GO (`docs/BETA_GO_NO_GO.md`).
