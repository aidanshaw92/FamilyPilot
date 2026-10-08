# Reviewed admission claims (staged, not published)

Prepared 2026-10-08 from pages already stored in `venue_source_evidence`.

- **No page was fetched and no provider was called** (£0).
- **Nothing was written to production.**

The claims are in `familypilot/data/pricing/reviewed-admission-claims.json`. They are checked by
`familypilot/src/__tests__/reviewed-admission-claims.test.ts`.

Publishing them is a separate, approved step. It would write `venue_claims` rows through the approved-claim path, or ship
the file behind #171's read path.

## 1. The result

36 venues reviewed:

| Decision | Venues | What it means |
| --- | ---: | --- |
| Publish: free general entry | 19 | "Free entry", with any charged parts named as conditions |
| Publish: paid | 5 | Adult and child bands, free-under rules and family tickets, only as stated |
| Hold | 8 | A real price exists, but no ticket is plainly the general admission, or the child terms are missing |
| Refuse | 4 | Only a part of the venue is free; the venue must never be labelled free |

Coverage, if published: 24 of 134 destinations (18%) would show a confirmed admission answer, up from 0 today.

- 19 of those (14%) are free entry.
- Family totals can be computed at 5 venues.

## 2. Rules applied (the approved policy)

1. **The venue's own page only.** Every source has subject scope `venue_own_subtree` or `venue_named_page`.
   - Example: the V&A accessibility statement says "Admission is free". It is a sibling page, so the Storehouse and
     South Kensington claims use their own visit pages instead.
2. **Free means the whole venue.**
   - Courtauld (the entrance and ticketing halls), the Design Museum (one display on Level 2), Hatfield Park (the Stable Yard)
     and Stanborough Park (the splash pad) are refused.
   - Venues that are free but charge for parts carry those parts as conditions: Horniman (Aquarium, Butterfly House),
     National Maritime Museum, Tate Britain, Tate Modern, Whitechapel, V&A, Queen's House, Olympic Park.
3. **Gift Aid.** De Havilland lists prices with and without Gift Aid. The standard prices (£12 adult, £10.90 concession,
   £6.50 child) are used. The Gift Aid prices are kept as a condition.
4. **Only stated bands.**
   - A child outside every stated band is unknown. This covers under-5s at De Havilland and the Cable Car, a 6-year-old at
     Museum of Brands, and a 16-year-old at Sherlock Holmes.
   - Unknown is never free, and never the adult price.
5. **Family tickets only with stated limits.**
   - Museum of Brands states its limits (2 adults, 2 children), so the ticket is used.
   - De Havilland's £31.50 family ticket states no composition, so it is a condition only.
6. **Eligibility rules are kept as conditions.** Examples: carers free (Hanwell, De Havilland), booking required (RAF Museum),
   groups of 10+ book ahead (Docklands), under-11s accompanied (RAF Museum), the £1 Universal Credit ticket (Museum of Brands).

## 3. The claims

### Free general entry (19)

| Venue | Page | Read | The page's words | Conditions recorded |
| --- | --- | --- | --- | --- |
| Gunnersbury Park | visitgunnersbury.org/museum/accessibility | 2 Oct | "Entry is free for all visitors, and you are welcome to leave and return…" | (see 5.1) |
| Hackney City Farm | hackneycityfarm.co.uk | 1 Oct | "Hackney City Farm is free to visit." | none |
| Headstone Manor and Museum | headstonemanor.org/visit | 7 Oct | "…Closed: Monday FREE ENTRY" | none |
| Horniman Museum and Gardens | horniman.ac.uk | 1 Oct | "The Museum and Gardens are free to visit There is a charge to visit the Aquarium, Butterfly House…" | Aquarium, Butterfly House, some events and exhibitions charged |
| London Museum Docklands | londonmuseum.org.uk/docklands/visit/groups | 1 Oct | "Our galleries are free to visit, but we ask that groups of 10 or more book in advance" | groups of 10+ book |
| Mudchute Park and Farm | mudchute.org/plan-your-visit/faq | 1 Oct | "Mudchute Park and Farm is free to visit." | none |
| Museum of the Home | museumofthehome.org.uk/plan-your-visit | 27 Sep | "We are free to visit, open Tuesday–Sunday and on Bank Holidays." | none |
| National Maritime Museum | rmg.co.uk/national-maritime-museum | 1 Oct | "Access to all free galleries and activities Free entry Book online" | special exhibitions charged; free ticket guarantees a time |
| Queen Elizabeth Olympic Park | queenelizabetholympicpark.co.uk | 1 Oct | "…is free to visit every day of the week" | attractions inside charge separately |
| Queen's House | rmg.co.uk/queens-house | 1 Oct | "The Queen's House is free to visit. We recommend booking tickets online…" | booking recommended; tours charged |
| Royal Air Force Museum London | rafmuseum.org.uk/london/plan-your-day | 2 Oct | "Children under 11 must be accompanied by an adult. Book your free entry" | booking required; under-11s accompanied |
| Tate Britain | tate.org.uk/visit/tate-britain | 1 Oct | "Tate Britain is free to visit." | some exhibitions ticketed |
| Tate Modern | tate.org.uk/visit/tate-modern | 1 Oct | "Our gallery is free to visit." | some exhibitions ticketed |
| The National Gallery | nationalgallery.org.uk/visiting/plan-your-visit | 1 Oct | "The National Gallery is free to visit." | some exhibitions ticketed |
| V&A East Storehouse | vam.ac.uk/east/storehouse/visit | 1 Oct | "Admission is free Some exhibitions and events will carry a separate charge" | as stated |
| Victoria and Albert Museum | vam.ac.uk/south-kensington/visit | 1 Oct | "Admission is free Some exhibitions and events carry a separate charge" | as stated |
| Young V&A | vam.ac.uk/young/visit | 1 Oct | "…Admission is free Visit our galleries now" | some exhibitions ticketed |
| Whitechapel Gallery | whitechapelgallery.org/visit-2 | 1 Oct | "Free Entry to the Gallery Ticket prices apply for select Exhibitions: Standard" | select exhibitions £15; under-16s free |
| Sydenham Hill Wood | wildlondon.org.uk/…/sydenham-hill-wood-and-coxs-walk | 1 Oct | "…36 nature reserves across London - and they are all free to visit!" | none (see 5.1) |

### Paid (5)

| Venue | Read | Bands recorded | Family ticket | Unknown by design |
| --- | --- | --- | --- | --- |
| Hanwell Zoo | 30 Sep | adult £5; child (3+) £4; under 3 free | none stated | child upper age not stated (condition) |
| Museum of Brands | 27 Sep | adult £14; child 7–16 £8; concession £10 (60+ or 17–25) | £36, exactly 2 adults + 2 children | under-7s (see 5.2) |
| The Sherlock Holmes Museum | 26 Sep | adult £19; concession £17; child 6–15 £14; under 6 free | none stated | 16+ child |
| De Havilland Aircraft Museum | 1 Oct | standard: adult £12; concession £10.90; child 5–16 £6.50 | £31.50 condition only | under-5s |
| London Cable Car | 30 Sep | round trip: adult 16+ £13.50; child 5–15 £6.75 | none | under-5s; one way £7 / £3.50 as a condition |

What a family is told (visit 14 Nov 2026; asserted in the test):

| Venue | 2 adults, 4y and 1y | 2 adults, 7y and 10y | 1 adult, 15y |
| --- | --- | --- | --- |
| Hanwell Zoo | £14 | £18 | £9 |
| Museum of Brands | £36 (family ticket) | £36 (family ticket; £44 individually) | £22 |
| Sherlock Holmes Museum | £38 | £66 | £33 |
| De Havilland | price not known (no under-5 band) | £37 | £18.50 |
| London Cable Car | price not known (no under-5 band) | £40.50 | £20.25 |
| Any free venue | Free entry | Free entry | Free entry |

### Hold (8)

| Venue | Why not published |
| --- | --- |
| Chiltern Open Air Museum | Four price lists (pre-booked or on the door, standard or premium). Which dates are premium is not stored, and the asterisk on adult prices is never explained. |
| Cutty Sark | Adult £22, child £11, but child ages are not stated; a combined £38/£19 pass appears on another reading |
| London Eye | Only "From £29 per adult" online; no child price |
| SEA LIFE London Aquarium | Only "From £28 per adult"; no child price |
| Paradox Museum London | "Starting from" £18.50 child, £24 adult; no age bands |
| Discover Children's Story Centre | £10 "Adult or Child", but whether babies pay is not stated |
| Harry Potter Studio | Only "children aged 4 and under are entitled to free entry"; no prices stored |
| Hyde Park Winter Wonderland | Seasonal; entry depends on session and packages |

### Refuse (4)

| Venue | Only this is free |
| --- | --- |
| The Courtauld Gallery | the John Browne Entrance Hall and the Ticketing Hall |
| the Design Museum | the Designer Maker User display on Level 2 |
| Hatfield Park | the Stable Yard |
| Stanborough Park Water Sports Centre | the splash pad |

## 4. Verification

**1. Against the stored pages (read-only SQL, 2026-10-08).**
- For each of the 36 claims, the excerpt (whitespace-normalised) was searched for in the stored `extracted_text` of the
  cited URL. The match had to be on the cited date and under the cited subject scope.
- Result: **36 of 36 found**.
- Each excerpt is also present in the **latest** stored reading of that URL. No later reading contradicts or drops it.
- Every `venueId` resolves to a `place_records` row, and the names in the file match those rows.

**2. Automated (vitest, 33 tests, all pass).**
- 24/8/4 decisions; one decision per venue.
- Every source is an eligible scope.
- Each source URL and date equals its evidence.
- No price is older than 400 days; all are current for a visit next month.
- Free claims:
  - every free excerpt states free entry in the page's words;
  - none contains a part-only phrase (hall, display, level, stable yard, splash, parking, "go free", members, "qualify for");
  - every refusal does contain one, and no refused venue is published.
- Paid claims:
  - every paid amount and family ticket amount appears verbatim in its excerpt;
  - adult bands carry no age limits and child bands always do;
  - the Gift Aid rule holds;
  - the family ticket carries its limits.
- The calculator gives the family table above.
- A mutation check confirmed the tests fail when given a wrong price (Hanwell child £4.50) or a part-only free claim
  (Design Museum as free).

**3. #171's own tests still pass (31).**

## 5. Decisions taken after your review (8 Oct 2026)

1. **Museum of Brands, under-7s: verified, and the cheaper route is not shown.**
   - Every stored Museum of Brands page (5 pages) was searched.
   - The only statement about young children's entry is inside the Universal Credit paragraph: "plus £1 each for up to
     4 accompanying children aged 7-16 (children under 6 are free)".
   - No page says what a child under 7 pays on a standard ticket, and none mentions a 6-year-old at all. So the £28
     "adults only" route is not proven to admit both children and is never shown.
   - A party with under-7s that fits the family ticket (2 adults, 2 children) is shown **"Family ticket £36"**, with the
     reason ("No ticket on record covers <child> at this age. Ask the venue whether a cheaper way in applies.") and the
     museum's conditions.
   - A party the family ticket does not fit (one adult and a 3-year-old) is shown **"Price not confirmed for your
     party"**, naming who is not covered. It never shows a figure and never reads as a stale price.
2. **Free general entry stays separate from paid parts.** The headline is "Free entry", and what is charged inside follows
   as the venue's conditions (Horniman: "There is a charge for the Aquarium, the Butterfly House and some events and
   exhibitions"). A refused venue (only part free) and a held one get no price at all: "Price not confirmed".
3. Two smaller flags from the review are unchanged:
   - Gunnersbury's and Sydenham Hill Wood's free statements are one step from the literal sentence.
   - Hanwell Zoo's child ticket has no stated upper age; this is shown as a condition.

## 6. The implementation in this PR (publishes on merge)

- The 36 reviewed claims live in `familypilot/src/data/reviewed-admission-claims.ts`, one typed source of truth with each
  decision's excerpt, URL and date.
- `services/pricing/reviewed-admission.ts` returns a price for a `publish` decision only. `merge-place.ts` puts it on the
  venue's detail record whatever the venue's enrichment status; Hanwell Zoo, the Sherlock Holmes Museum and the Cable
  Car are `ai_draft`.
- **Freshness:** `priceIsCurrent` stops a price being shown 400 days after its reading, which is late September to early
  October 2027 for these.
- **Not in this PR:**
  - Explore's price filters still read `estimatedSpend` and stay hidden (#171's coverage rule).
  - Cards show no price badge. Both are follow-ups once these prices are live.
- **Verification:**
  - `reviewed-admission-claims.test.ts` (38). It covers the earlier checks plus: only `publish` reaches a venue; hold,
    refuse and unknown venues read "Price not confirmed"; free stays separate from paid parts; Museum of Brands never
    shows £28; the party-gap wording; and that the detail record carries the price.
  - `verify-admission-card.mjs` (browser, fixture, 360 and 430) opens two detail-only fixture venues that carry the
    Museum of Brands and Horniman ids and checks the card text for three parties.
  - Full suite: 2,879 passed.
- **Rollback:** revert the PR, or set a claim's `decision` to `hold`.

## 7. Release check (8 October)

`pricing-release-check.test.ts` is the gate for showing these prices. It runs on every build. It passes for all 24
published claims (98 checks):

- **Fresh.** Every price is current on the release date. It stops being shown exactly 400 days after the reading, and
  then becomes unknown: never shown as current, never guessed.
  - The readings date from 26 September to 7 October, so the first price lapses on 31 October 2027.
- **Sourced.** The price's own source is the excerpt's page, read on the stated day, from the venue's own site (an
  eligible subject scope). The excerpt is quoted, never paraphrased.
- **Honest for every household.** Each published price was swept across 41 household shapes: one or two adults, none to
  four children aged 2 months to 17 years, and one with a child of unknown age. Every total is one of three things:
  - one line per person, each person once;
  - one family ticket that this party actually fits (adults, children and age limits);
  - unknown.

  No total ever leaves someone out.
  - Across 4 sample households: 76 free, 5 individual totals, 1 family ticket shown as the family ticket's price
    (individual prices unknown), and 14 unknown (9 not covered, 5 age unknown).
- **Plain tickets.** Every family ticket states its adult and child limits, and every free band is £0.
- **Only reviewed decisions are served.** All 24 `publish` claims are; no `hold` or `refuse` claim ever is.
- **Museum of Brands:** the £28 adult-only option is never a family of four's total (asserted).
