# Opening hours, variable prices and unavailable sources

How the product decides which hours to believe, how it says a price that changes by the day, and what it does about a source it cannot read. Each part is implemented and tested in this branch; none of it writes to production.

## 1. Opening hours: which source, and what to say

**The three disagreements the pilot found** (provider hours from the local Layer A snapshot against the venue's own page, read 8 Oct 2026):

| Venue | Google says | The venue says | Effect if nothing is done |
|---|---|---|---|
| London Zoo | 10am to 5pm every day, all year | 5pm until 23 October, **4pm from 24 October to 12 February** (last entry 3pm) | A plan for 24 October onward can run an hour past closing |
| Mudchute Park and Farm | **Closed on Mondays** | Farm open every day, 9am to 4pm (only the pets corner and courtyard close on Mondays) | A Monday is refused, and the card says Closed today, when the farm is open |
| Gunnersbury Park | **Open 24 hours** | Park gates 7am until dusk; museum Tuesday to Sunday 10am to 4.30pm | A 6am or a late-evening plan is accepted |

The other seven agree with their provider hours, or have none to compare (Battersea).

**The hierarchy** (`src/services/places/hours-reconcile.ts`), for the whole venue's hours on a given date:

1. The venue's own pages, read and approved by a person, **if the reading is no more than 45 days old** and gives clock times. Seasonal: a rule applies only inside its dates.
2. The provider's weekly hours.
3. Nothing: unknown, never "closed".

**The rules that keep it honest.**

- *Never silent.* When the two disagree for that date the venue's hours are used and a prominent note says so, naming both: "Opening hours differ between sources on Sunday: Google lists 10am to 5pm; the venue's website says 10am to 4pm. We've used the venue's website. Check before you go." It appears in the plan's "Needs checking" block, is kept on the saved plan, and appears under the Today card on Venue Detail. When they agree nothing is said.
- *Closures outrank hours.* A dated whole-venue closure is a venue rule, not an hours reading; it refuses the date whatever the weekly hours say.
- *A part of the venue never speaks for the venue.* Gunnersbury's museum hours cannot make the park look closed on a Monday; only whole-venue hours can agree with, contradict or replace the provider's.
- *"Until dusk" is reported, not scheduled.* Gunnersbury's contradiction (24 hours against 7am to dusk) is told to the parent, but no clock time is invented for dusk, so the provider's schedule is kept for planning and the plan carries the note.
- *Stale means ignored.* A reading older than 45 days is not used at all, because hours change with the season. It is not shown as current and not allowed to override.
- *Only a person's approval publishes one.* An hours reading is a claim (`hours.<id>`, with its source page, quote and date) that is projected to the app only when approved by a `human:` identity. An automatic approver can never create one.

**What changes for a parent.** London Zoo on 25 October: a 1pm to 4.30pm visit that today builds is refused ("The visit would run past closing"); a 10.30am visit for two and a half hours is built with the disagreement stated. Mudchute on a Monday: the card no longer says Closed today, and the plan builds with a note. Tested in `hours-reconcile.test.ts`, including that the caller's venue object is never mutated.

**Limits.** Dusk and sunset are not computed. Bank-holiday hours ("8am on Sundays and bank holidays" at Horniman's gardens) are only represented as the Sunday rule. Last-entry times are carried and shown, but are not used to refuse a visit.

## 2. Variable prices: London Zoo's four day types

London Zoo prices each ticket four ways by the kind of day (Off Peak, Weekday Standard, Standard Weekend, Peak: adult £27.70 / £31.80 / £33.60 / £34.50; child 3 to 15 £19.40 / £22.20 / £23.50 / £24.10; under 3 free), published with a calendar that says which date is which. A single figure would pick one of the four and tell the parent it was theirs.

**What the admission contract now does** (`src/services/pricing/admission.ts`):

- `AdmissionPricing.tiers` holds the venue's own rate tables.
- With tiers and no recorded calendar the estimate is a **range**: the party is priced under every table, and the answer is "About £74.80 to £93.10 to get in, depending on the day" with each table's total listed and "Check which kind of day yours is when you book."
- If every table gives the same total for this party (a baby alone, free on every day) it is one price.
- If any table cannot price the party (a 17-year-old that no band covers) the answer is **unknown**, never a range with a missing end.
- A stale reading is not shown, tiers or not.
- For an outing with several families there is a range for the outing, never a single total, and a cost nobody has confirmed turns it back into a partial figure.
- On a card: "From £19.40", worded as a minimum.

**Not done.** The London Zoo prices are **not** added to the shipped admission data. That list is published through a pull request, and the pilot's rule is that nothing is merged unreviewed. The contract is ready for it. Recording the zoo's calendar (so a specific date resolves to one table) would turn the range into a single price; that is the next step, and needs the calendar page read.

## 3. A source that cannot be read

The pilot met two: Battersea Park's operator site answered HTTP 403, and Gunnersbury's own link to its park page returns 404.

- **Marked, not forgotten.** The profile records each as a source with `status: refused` or `dead`, the date, and that it is never retried automatically. The profile document shows "Source unavailable" at the top of that venue. A venue whose operator source is refused cannot be called fully read; its unknowns are labelled as "not stated on the pages read", never "not available".
- **Never worked around.** No retry, no alternative host for the same content, no guessing of paths.
- **Permitted alternatives, in order:** the other official or public-body pages for the venue (Battersea's council pages, which were read); open data under its licence, read on a runner (OpenStreetMap lists toilets, cafés and playgrounds for most parks, and is the next step for Battersea; the authoring container has no outbound access, so it runs in the same bounded GitHub workflow as the page reader); and a parent who has visited, through the existing observation path.
- **What is not allowed:** another site's copy of the refused operator's content, a cached copy from a search engine, or any scraping of the refused host.
