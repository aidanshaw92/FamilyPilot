# Saved places and plans when a venue gets a new listing

14 October 2026. Design and the matching rules; no screen is changed and nothing is deployed. Read-only production counts taken the same day.

## What exists, and where

| What | Where it lives | Production rows (14 Oct) |
|---|---|---:|
| Saved places | on the device only (`familypilot-saved-v2`), each a copy of the venue as it was when saved, named by its id | not on any server |
| Saved days and single-venue plans | on the device only (`familypilot-planning-v1`): a rendered itinerary plus, for a day, the id it can be rebuilt from | not on any server |
| Saved-places backup | `saved_places_backups`, written only when a signed-in parent taps "Back up" | **0** |
| Account plans, connections, invites | `planning_workspaces`, `planning_connections`, `plan_invites` | **0, 0, 0** |

So there is nothing on a server to migrate or to lose, and nothing a server-side map could repair: the only copies are on the phones of the families already using the app. Whatever happens to a saved place happens on the device, and any fix has to run there.

## What goes wrong, exactly

A saved row and a saved day name a venue by the id its old provider copy had. When the venue is listed again from an independent source it has a new id. Then, on that device:

- the saved row still **draws**, from the copy kept on the device;
- **opening it** asks the server for an id that is no longer served. With Google details off the server answers 503 (`PLACES_DISABLED`), which the screen reads as a connection problem: **"Could not load this place. Check your connection and try again."** with a Retry that can never succeed (measured in the release rehearsal, 14 October). The "Place not found" page appears only for a 404, which a Google-style id does not get;
- a saved day still **reads** as it was planned (its itinerary is stored whole), but **Change / rebuild** needs the venue id and fails the same way;
- a plan sent to another family is not affected: what was sent is a copy of the day, not a reference.

## Options

| Option | What it does | Verdict |
|---|---|---|
| **A. Keep the old id as the new entry's id** (the "keyed" entry) | the registry entry for a continuing venue carries the old Google place id as its own id, so the old reference keeps resolving | **Not done.** It puts Google place ids in a public file, ties each independent record to a Google record by a join we made from names and positions, and does it silently for every parent. If a match is wrong, someone's saved place quietly becomes another venue. |
| **B. A private map from old ids to new, on the server** | the detail endpoint answers an old id with the new venue | **Not done**, as you decided: the same silent reassignment, plus a stored table of Google ids linked to OSM or other records. |
| **C. Propose, and let the parent confirm** (this document) | on the device, for each saved place that no longer resolves, look in today's catalogue for the same place and **ask** | **Recommended.** No server involvement, no Google id leaves the device, nothing happens without a tap. |
| D. Do nothing | the rows draw, opening fails | Honest but a dead end for a family's planning. The cost is small today (a handful of devices) and grows with use. |

## The recovery experience (option C)

Principles: **never silent, never bulk, never destructive, and the parent can always say "none of these".**

1. **Where it shows.** On *Saved places*, a place whose id the catalogue no longer serves gets a quiet line under its name: **"This place has a new listing. Reconnect"** (a link-styled control, 44 pt target). Nothing else about the row changes. A place that still resolves shows nothing.
2. **One place at a time.** Tapping it opens a sheet: **"Is this the same place?"** with up to three candidates from today's catalogue, each a card with the name, the kind of place, how far it is from where you saved it, and why it is proposed ("same name", "in the same spot"). Buttons: **"Yes, this one"** on each card, and **"None of these, keep it as it is"**. When the top two are alike ("Victoria Park", "Victoria Park Gardens") the sheet says **"More than one place looks like this one. Choose the one you meant."** and does not highlight either.
3. **What "Yes" does.** The saved row points at the chosen venue (it keeps its group, its saved time and its own id), the saved id is replaced, and any saved day *rebuilt from* the old id now rebuilds from the new one. A day that has already been made keeps its itinerary exactly as it was; nothing a parent has planned is rewritten.
4. **What "None of these" does.** Nothing changes. The line stays, and the sheet can be reopened.
5. **From a plan.** "Change" on a saved day whose venue no longer resolves opens the same sheet for that venue, instead of the "Place not found" page.
6. **From the venue page.** An id that is not served (the 503 above, or a 404), when the device holds a saved copy of it, shows the same offer instead of "Could not load this place … try again". An id nobody saved keeps today's wording.
7. **Nobody is asked about a place they have not saved**, and nobody is asked twice about one they declined in the same visit.

Copy rules: plain, no "migration", no "alias", no blame ("This place has a new listing", not "Your saved place is broken").

## The matching rules (`familypilot/src/services/saved/reconnect.ts`, tested)

A candidate is proposed only if **all** hold: it is not the saved id; it is the same *kind* of place (a house filed as a museum and an aquarium filed as a zoo may match; a park never matches a farm); it is within **300 m** of where the saved copy put it; and **60%** or more of the shorter name's words are shared (damped when the longer name has many more). At most **three** are offered, best name first, nearer first among equals; two within 0.15 of each other are called ambiguous. A shared word is never enough ("Brockwell Park" does not match "Brockwell Lido" or "Park Road Gardens"). The module never chooses: the choice is the parent's.

## Interaction with the Google retention correction

The saved copy that makes this possible (name, position) is Google content kept on the device indefinitely, which the retention audit proposes to stop (docs/GOOGLE_RETENTION_AUDIT.md, step 2). The two fit together: reconnecting **replaces** the old copy with the independent venue, so the confirmed row holds only our own record afterwards. Before step 2 ships, the matching can read the old copy one last time; **step 2's migration must run the proposal first** (so a place's name and position are used to find its successor) **and only then drop the provider fields**, or the matching has nothing to go on. Until a parent confirms, the row keeps its copy.

## Cost and when

About 300 lines for the sheet, the Saved row line, and the venue-page fallback, plus the plan "Change" route; the matching and the state changes are written and tested here. It is **not** part of Tranche A: Tranche A can be published without it (the rows keep drawing; opening a pre-release save says "Could not load this place" with a Retry that cannot work), and the experience above should ship in the same window, before 8 November. If you would rather not build it now, the minimum honest alternative is a one-time notice on Saved: "Some saved places have a new listing. Search for them again and save them to keep them," and nothing else.

## What this does not do

It does not recover a saved place whose venue has **no** independent record in what is served: with Tranche A alone that is 59 of the 147 we hold (29 of them continue only through OpenStreetMap, which is held; 30 have no candidate in any open source, among them all six soft-play and three of the seven activities). There is nothing to reconnect those to, and the row can only be kept as a note or removed. It does not touch a plan another family accepted. It does not move any data between devices.
