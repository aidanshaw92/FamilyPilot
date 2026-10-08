# Hard exclusions: what can remove a venue from a family's day, and how each was checked

Status: 2026-10-08. A mistaken exclusion is as costly as a mistaken recommendation: the family never sees the place. So nothing here is allowed to refuse a visit on a sentence alone. Every refusal below was traced to the venue's own page and tested at its edges.

## 1. Natural History Museum, Friday 9 October 2026

**Confirmed: a whole-site closure on that date, not a gallery, exhibition or partial closure.**

The visit page (`nhm.ac.uk/visit.html`, read 8 October 10:57 UTC) says it twice:

- In the opening times: "Open daily 10:00–17:50 (last entry 17:30) **Closed 9 October and 24–26 December**".
- In a dedicated notice on the same page: "**Museum closure.** Our South Kensington site will be closed on Friday 9 October 2026, as we're hosting a charity gala. We're sorry for any inconvenience this may cause and look forward to welcoming you another time."

Checks, each answered from the stored pages:

| Question | Answer |
|---|---|
| Whole venue or one part? | "Our South Kensington site will be closed": the whole site. The gallery-by-gallery closures live on a different page (`galleries-and-museum-map.html`, "Last updated 6 October 2026": Creepy Crawlies, the Cocoon, lifts) and none mentions 9 October. |
| Is this the venue we serve? | Yes. The Natural History Museum at Tring is a separate site with its own hours ("Open Tuesday–Sunday and bank holidays"); the notice names South Kensington and the address on the page is Cromwell Road, SW7. The pilot venue is the Cromwell Road site. |
| Is the date unambiguous? | Yes: weekday, day, month and year, and 9 October 2026 is a Friday. |
| Is it current? | Read the day before. The notice is for a future date and is not a withdrawn or archived one. |
| Does anything on the museum's pages contradict it? | The homepage and every page footer say "Open every day" / "Open daily 10:00–17:50 Closed 24–26 December". That is standing text that lists only the annual closure; it does not say the museum is open on 9 October. The dated notice is the more specific statement. It is still recorded as a conflict for a person to confirm, not hidden. |
| Does the venue offer an exception? | None stated (no "gardens open", no "pre-booked visitors"). |
| What does the app do? | Plans a different date or venue: the planner refuses 9 October with the rule's words ("The South Kensington museum is closed on Friday 9 October 2026 for a charity gala."), Home and Explore show **Closed today** on the day, and Venue Detail agrees. The date before and after are untouched. |

The rule remains `review` status: a person approves it before it can refuse a date in production. In production a rule is only served from an approved `rules.*` claim whose approver starts `human:`; nothing automatic can create one.

## 2. Every other rule that could refuse a visit

Only two kinds can: a **dated or weekly whole-venue closure**, and a restriction the reviewer marked **covers the core visit** (for a household that needs it). Of the 28 proposed rules, these are the ones that qualify:

| Venue | Rule | Quote and page | Scope check | Result |
|---|---|---|---|---|
| Natural History Museum | closed 9 Oct 2026 | above | whole site | **verified**, see §1 |
| Natural History Museum | closed 24–26 Dec | "Closed 24-26 December" under "The Natural History Museum, London … Cromwell Road" on every page footer | London site named | **verified** |
| Science Museum | closed 24–26 Dec | "The museum is open daily from 10.00–18.00 (except for 24–26 December when the museum is closed)" (`/visit`) | whole museum | **verified** |
| Discover Children's Story Centre | closed 24, 25, 26 Dec | "We're closed on 24, 25, 26, 31 December and 1 January over the festive period" (`/your-visit/`) | whole centre | **verified** |
| Discover Children's Story Centre | closed 31 Dec and 1 Jan | same sentence | whole centre | **verified** (year inferred from the reading date: 2026 then 2027) |
| Discover Children's Story Centre | no pushchairs in storytelling or play areas | "We do not allow buggies and pushchairs in any of our storytelling or play areas. If you have a smaller baby we recommend bringing a sling." (`/getting-here/`) | the paid Story Worlds are the storytelling and play areas; the café and bookshop are open to everyone, so only the core is covered; **the reviewer must confirm the "covers the core visit" judgement** | refuses only a household that listed buggy access as a must-have; warns anyone else who brings a buggy, with the venue's own advice and its exception ("ask front of house" for twins or a sleeping child) |

Not refusals, though they can look like it: Gunnersbury's museum closed on Mondays (the park is open every day: area scope), Mudchute's courtyard closed on Mondays (affects toilets; a warning for a household that listed toilets), Horniman's Nature Gallery closed to 5 February 2027, the RAF Museum's 4D Theatre, the Science Museum mezzanine without step-free access, and the Natural History Museum's lifts. Each is an area, and an area never refuses a venue.

## 3. The safeguards, and the tests that pin them

A rule may refuse only if all of these hold; otherwise it **warns** (prominently, in the venue's words, naming the day it was read):

1. It covers the whole venue (an area never refuses).
2. It has a readable bounded date or weekday (an undated "closed" warns).
3. It was read **at most 90 days before the day the decision is made**, and has a reading date at all (not future-dated).
4. No other reading of the venue's pages contradicts it (a recorded `contradiction`).
5. The venue does not itself soften it for that date (an `exceptionOf` rule applies).

`hard-exclusions.test.ts` (27 tests) pins: both ends of a one-day, multi-day and year-end closure; a weekly closure; an unreadable date; the 25 October 2026 clock change (the 25th is 25 hours long and all of it is closed); BST and GMT day boundaries; a reading exactly 90 and 91 days old; a notice read today about Christmas and the same notice judged three months later; a missing or future reading date; contradicted and excepted closures; and, for eight combinations, that the venue card, the shared rule, the matcher and the planner's sequencer all give the same answer.

## 4. A finding outside the rules: general parking is not disabled parking

A household with a wheelchair user that lists parking as a must-have was refused six of the ten pilot venues because each says "no parking on site". Four of them also publish Blue Badge spaces or bays (Natural History Museum, Science Museum, Horniman, Discover), and the app has no field for that. That is a wrong hard exclusion produced by a data model too coarse for the household. Under the new hard-conflict policy a general "no" is carried as *to check* for a party with a step-free need (`parkingFor`, tested) so none of the six is refused. Today's planner (flag off) still refuses them. The permanent fix is an accessible-parking claim; it is on the data-model list in `FAMILY_FIT_V2.md`.

## 5. What was not checked

I cannot fetch these pages from here, so the closure was verified against the reading taken yesterday by the bounded runner, not against the live site. A person should look at `nhm.ac.uk/visit.html` once before approving the rule, and again if it is still on the list on 9 October. If the notice has been withdrawn the rule must be withdrawn too.
