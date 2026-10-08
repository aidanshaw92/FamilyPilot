# Family-specific outing costs: coverage audit and staged plan

Read-only audit on 2026-10-07, then a foundation (this PR). No price was invented, no provider was called, and nothing was
written to production.

## 1. What data exists today

| | Result |
| --- | ---: |
| Catalogue rows with an `estimated_spend` | **0 of 168** |
| Approved pricing claims (`venue_claims`) | **0** (no price, admission or ticket field exists among the 13 claim field types in use) |
| Venues with stored official pages | 156 (2,212 pages, 1,186 fetched OK) |
| ...whose stored pages contain any £ amount | 51 |
| ...mentioning price words (admission, tickets, prices) | 69 |
| ...stating free entry in words | 22 |
| ...mentioning a family ticket or pass | 5 |
| ...with "under N free" style child wording | 6 |

So a parent today can learn nothing about cost from FamilyPilot, and the **Explore "Free" and "Under £25" filters could only
return an empty list** (a venue with no price fails every price filter): a broken interaction exposed as working. This PR
stops offering them until about a tenth of places carry a price.

## 2. What the stored pages could yield (and the traps)

Sampling the stored text around pound amounts shows a handful of clean structures and many hazards.

Clean (candidates for a reviewed claim): "Adults £17.00 / Children 3-15yrs £8.50 / Family 2 Ad & 4 Ch £42.00"; "Adult £5 /
Child £4 / Under 3 Free"; "Adult - £14, Concessions - £12, Child (5-16) - £8, Family - £35".

Hazards a naive extractor would get wrong (all seen in the sample):
- party and hire packages ("£39.99 per person", "£185+VAT for 2 hours"), event prices, sports pitch hire;
- season tickets next to single tickets; "member £0"; Gift Aid and non-Gift-Aid pairs; "from £" ranges;
- concessions that are not children's prices; age bands that differ by venue (3-15, 5-16, under 16, under 6 free);
- "free entry" that applies to part of a site (a garden, the ground floor) while a paid attraction sits beside it.

Estimated reliable yield after a careful extractor **and human review**: on the order of 10 to 25 venues with usable
adult/child prices, 5 with a family ticket, up to about 22 with confirmed free entry (each to be read, not trusted). That is
about 6 to 15% of the 168 rows. It is not enough to make price a headline on Home; it is enough for the venues families
actually pick first, if those are the ones reviewed.

## 3. The rules this PR encodes (`services/pricing/admission.ts`, 31 tests)

1. **Unknown is never zero.** No price, a stale price (older than 400 days or past its end date), a child nobody's band covers,
   a child of unknown age, or no adult price each give `unknown` with a reason. `free` is a positive, sourced statement.
2. **Babies are free only where a band that covers their age says free.** No "under 3s free" band means a baby's ticket is
   unknown, not nothing. Concession bands (students, over-60s) never price a child.
3. **Ages are those on the visit date,** from a date of birth the parent entered. A child saved with only an approximate age
   has an unknown age at a ticket boundary (35 vs 36 months is the difference between free and £8.50).
4. **Family tickets are never assumed cheaper.** One applies only if the party fits its stated limits (adults, children,
   oldest child). Both routes are computed when possible, the cheaper is returned and the other is shown ("Buying individually
   would be £51"). If only the family route is computable it stands.
5. **A minimum is not a total.** "From £8.50" is the cheapest paid individual ticket, worded as a minimum.
6. **Several families:** each has its own subtotal; a combined total exists only when every family is known. Otherwise
   "£34 so far, 1 cost not confirmed". Parking and optional activities are separate lines and an unknown extra keeps the
   outing incomplete; an optional extra does not.
7. **No category inference.** Nothing prices a place from "museum" or "farm".

Presentation states: *Free entry*, *From £X*, *Price not confirmed* (cards); an estimate with breakdown, conditions, checked
date and booking link (Venue Detail); *£X so far, N costs not confirmed* (plans).

## 4. What shipped in this PR, and what did not

Shipped: the data contract, the calculator and its wording; the attendee builder (ages on the day); the Venue Detail "To get
in" card (today always "Price not confirmed" plus a link to the venue's own website); the Explore filter fix.

Deliberately **not** shipped:
- **No price badge on cards.** With 100% unknown it would be "Price not confirmed" wallpaper on every card. The badge helper
  exists and is tested; turn it on when coverage justifies it (suggest 30%).
- **No plan-screen integration** (`combineAdmission` / `outingTotals` are ready): it touches the plan view model, and there is
  no price to show yet.
- **No extractor and no data.** Writing prices needs the staged path below.

## 5. Staged plan (each stage needs your go; none is started)

1. **Stage 1 (this PR):** foundation and honest unknowns.
2. **Stage 2, no network, £0:** extend the extractor with explicit admission rules (adult / child with an age band / "under N
   free" / family ticket / free entry), restricted to a price table or sentence naming the audience; emit **drafts only**
   (never auto-approved, as today's pipeline), re-run over the stored pages with `reextract` (cannot spend).
3. **Stage 3, human review:** a queue of the ~40 candidates (the venues with a table and the 22 free-entry statements), each
   approved against the page. New claim fields (`admission.status`, `admission.band.*`, `admission.family`) with the existing
   30/90 day freshness rule.
4. **Stage 4:** serve approved claims as `venue.admission`, switch on the card badge and the plan lines.
5. **Stage 5, only if wanted:** a refresh path using the existing `refetch_official` job (re-reads the venue's own page; no
   Google).

No paid API, no uncontrolled scraping, no contacting venues. Data provenance stays the venue's own page with its URL and the
date it was read.

## 6. Decisions for you

- Whether Stage 2 to 3 should start now, and which ~40 venues to review first (my suggestion: the ones most often saved or
  planned, once the beta shows them).
- Whether "Free entry" from a page may be approved when it covers only part of a site (my suggestion: no, only when the page
  says the whole visit is free).
