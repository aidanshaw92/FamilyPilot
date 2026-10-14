# Tranche A Preview: what was demonstrated

14 October 2026, after the performance merges. **Still UNREVIEWED: this is evidence for your decision, not a release, and nothing is served in production.** The Preview is PR #214 (`preview/tranche-a`, never merged): main as of `f9bb4a8` (#209 and #215 included) + the 234 entries marked `PREVIEW ONLY (not a review)` + Explore and Nearby (#203) with staged loading + the saved-place reconnect screen (#220). Vercel Preview: <https://family-pilot-git-preview-tranche-a-aidanshaw92s-projects.vercel.app> (needs your Vercel sign-in).

Everything below ran in a real browser on a build of that branch, served by the real `/api/places/*` handlers against **an empty Google catalogue**, which is the state after the Google rows expire: the independent entries are all there is. No Google request was made in any run (each script fails on one), and nothing was written to a database.

## Your checklist

| You asked to see | Evidence | Result |
|---|---|---|
| Correct venue identities and categories | `validation/VALIDATION.md`: every entry checked against the source it names; 3 removed, 12 reclassified, 5 exceptions, each with its reason; `TRANCHE_A_CONTENTS.md` lists all 234; `validation/sample-20.json` is 20 drawn at random for your own check | **234 of 234 pass** |
| Accurate independent coordinates | Each OS point re-read in a fresh download (inside the polygon); each Wikidata item re-read live (coordinates within 5 m, same label and website, none dissolved or closed). The map shows 30 pins for the 5-mile view, from those positions | Pass |
| OS and Wikidata provenance | Each entry carries its source record (Wikidata link, or OS feature id and product page), licence and retrieval date; downloads, checksums and licence evidence in `PROVENANCE.json` | Pass |
| Correct attribution | "Contains OS data © Crown copyright and database right 2026" on an OS venue's page and with the map; OGL and CC0 named on About, with the ODbL notice ready for the day OSM entries are added | Pass (rehearsal checks 4, 6, 7) |
| No Google-derived fields | The entry shape is closed (name, category, identity, location, website, review); zero Google hosts, place ids or markers in the 234 entries; every entry compared with the 149 stored rows; zero Google requests in all four scripts | Pass |
| Explore and Nearby with real records | 78 places within 5 miles, 16 within 2, 165 within 10: each equal to what the registry holds within that radius; museum filter; Search all finds Kew once | 32 of 32 rehearsal checks pass |
| Venue detail and Create a plan | London Zoo (Wikidata) and Regent's Park (OS): detail names the venue, claims no opening hours, plan shows when to leave and arrive; Meet halfway builds a day at Clissold Park | Pass |
| Saved-place and saved-plan behaviour | `verify-independent-reconnect.mjs` on the real catalogue: Regent's Park offered its OS record, London Zoo its Wikidata record; declining changes nothing; confirming repoints the saved place and the saved day but leaves the day's itinerary and original decisions byte-for-byte unchanged; a place with no successor says it is no longer listed; a catalogue outage never reads as "gone"; choices survive a reload; the repointed venue opens with its credit and Create a plan. The stubbed-catalogue script (32 checks, incl. axe and 44 px targets) also passes | **20 of 20**, and 32 of 32 |
| Mobile performance | 4x CPU, 1.6 Mbps, 150 ms: shell on screen at 0.38 s; **first place card 9.1 s cold, 2.8 s warm** (median of 3) | **Limit remains, see below** |
| Error handling | `verify-independent-errors.mjs`: service down, slow, malformed answer, an address nobody has, offline after load; no uncaught error | **12 of 12**, with one finding below |

## Limits and findings, stated plainly

1. **A first visit on a slow phone is still slow.** First place card 9.1 s cold on the throttled profile (9.4 s before the performance merges, 9.7 s for the production app to mount, measured after #215 merged). Repeat visits are fast. This is a desktop-browser simulation, not a phone; confirm on your iPhone.
2. **When live places cannot be loaded, Explore shows a bundled example list, and says so.** The notice reads "Live places aren't loading right now, so these are saved examples", above one example venue (the Science Museum). That is the app's existing, deliberate behaviour (it keeps the screen from being blank), but the example card carries details such as "Café on site" and "Free" from the bundled sample, not from anything we reviewed. I have not changed it. A "Couldn't load" with a retry would be more honest; say if you want that as a small separate change.
3. **Twelve unit tests fail on the Preview by design.** They assert that the shipped identity files are empty (catalogue-recovery, the registry, catalogue, between-contract, cost-control). They pass on the release candidate (#213) and on main, and they would be updated in the same commit that writes your name, to assert the reviewed set instead. Everything else passes (3,938 of 3,950 on the Preview; the same 12 fail on the previous Preview head).
4. **Not verifiable from here:** the Vercel Preview itself (this environment cannot reach it), and production behaviour for a signed-in family (production sends a returning visitor to sign-in, so only the new-visitor flow can be checked anonymously). The two-account production canary is still outstanding.
5. **59 of the 147 venues we hold have no Tranche A successor** (all 7 activities and 6 soft play among them). Tranche C and, if the OSM Foundation's answer allows, Tranche B address that. See `TRANCHE_A_RELEASE.md`.

## Not done, and not to be done without you

No reviewer name is written. No batch is activated. No production deployment, migration or paid Google request has been made. `cutover.json` on the release candidate is unchanged.
