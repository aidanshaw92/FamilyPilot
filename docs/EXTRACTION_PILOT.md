# Extraction pilot: facts the stored pages state and the rules missed (rules v6)

2026-10-08. Extractor change, verified by replaying old and new rules over every stored page.

- No page was fetched, no Google request was made, and nothing was written to production.
- Stacked on `fix/parking-misreads` (v5).

## Method

1. **Find candidates.** For each of the 134 London destinations, list every sentence on its own stored pages (latest
   reading per URL, 634 pages) that mentions a field, where no page of that venue yields the field today. Result: 313
   sentences across 85 venue-field pairs, close to the audit's 83 mentions.
2. **Read and classify.** Each sentence was read and judged in one of three ways:
   - a true venue fact;
   - somebody else's (a station, a bus, a council, a neighbouring park);
   - deliberately unknown under existing rules: a day-only kiosk, "limited" or Blue Badge-only parking, soft play,
     arcades.
3. **Write narrow rules.** One rule per sentence shape demonstrated in the corpus. Every rule names its example in a
   code comment.
4. **Replay old against new** over all 634 pages. Every changed fact is listed below and was reviewed.

## Every fact the new rules change (v5 → v6, all stored pages)

| Venue | Fact | The page's words | Read |
| --- | --- | --- | --- |
| Gunnersbury Park | + wheelchair yes | "Step-free access is available throughout the museum, with some ramps and slopes" | 2 Oct |
| Museum of the Home | + wheelchair yes | "Step-free access is available to the Museum and to our galleries." | 27 Sep |
| Royal Air Force Museum London | + wheelchair yes | "We have step-free access around our site." | 2 Oct |
| Queen's House | + wheelchair yes | "All floors of the Queen's House have lift access." | 1 Oct |
| National Maritime Museum | + wheelchair yes | "The building has accessible lifts to every floor." | 1 Oct |
| Saatchi Gallery | + wheelchair yes | "All floors have lifts and there is level access between the galleries on each floor." | 1 Oct |
| The Wallace Collection | + wheelchair yes | "Lift access is available to all floors." | 1 Oct |
| William Morris Gallery | + wheelchair yes | "...an entrance with a ramp, accessible toilets and lift access to all floors." | 1 Oct |
| London Eye | + wheelchair yes | "...a wheelchair-friendly attraction with full accessibility throughout." | 1 Oct |
| Frameless | + wheelchair yes (already served) | "...lifts to every floor including our disabled toilets." | 1 Oct |
| Cutty Sark | + toilets yes, + café yes | "The main toilets are next to the cafe in the Dry Berth at level –1, underneath the ship." | 1 Oct |
| Mudchute Park and Farm | + toilets yes | "Toilets, including a disabled toilet, are available in the courtyard..." | 1 Oct |
| Chiswick House | + toilets yes | "Baby changing is available in the toilets by the Café..." | 1 Oct |
| Hackney City Farm | + toilets yes, + café yes | "There is an accessible toilet and baby changing facilities in the cafe."; "two inside the cafe" | 27 Sep / 1 Oct |
| Tate Modern | + café yes | "Corner Cafe, Bar, Venue Opening times Sunday to Monday 10.00–18.00..." | 1 Oct |
| Victoria and Albert Museum | + café yes | "Main Café – hot meals available from 18:30 – ..." | 1 Oct |
| Northala Fields | + parking yes | "car parks are locked in accordance with park locking times" | 1 Oct |
| Sydenham Hill Wood | **− accessible toilet yes** (served today, wrong) | "The nearest Changing Places Toilet can be found in Dulwich Park" | 1 Oct |

**Totals:** 20 new facts at 18 venues, and one wrong served fact withdrawn. Nothing else in the corpus changes.
Including v5, the parking fix, the replay from `main` changes 26 facts.

## Refused on purpose, with the tests that pin it

- Step-free access belonging to something else:
  - "Hoxton Station has step-free access"
  - "Our nearest step-free station is Paddington"
  - "Both our community buildings offer step-free access"
  - "The toilets ... are step-free"
  - "Wheelchair accessible picnic tables will be added"
- A café that is closed for now. Colne Valley's pages say "The Riverside Café is temporarily closed for business" and "We
  have not heard when exactly it will be reopened". A page saying that publishes no café, whatever else it says about
  the café.
  - A seasonal schedule ("usually closed from 20th December and usually reopens 3 January", Hackney City Farm) is not
    such a closure.
- A café with hours in a sentence that also says it is being rebuilt. The Design Museum: "Cafe & Design Kitchen 10:00 –
  17:00 ... we are rebuilding our cafe".
- "By the cafe ///noting.fortunate.dots", a what3words pin in a list of toilets.
- "Please ask a member of staff for the nearest baby changing facilities" (Madame Tussauds, and the same template on
  SEA LIFE's FAQ). It does not say the baby changing is on site. Found in the merge review: once #175 makes Madame
  Tussauds' pages eligible, this sentence would have been auto-approved. SEA LIFE keeps its baby changing from two
  unambiguous sentences on the same page, so no served fact is lost.
- Already refused before this pilot and still refused:
  - "The Kiosk Community Café: every Saturday 9am to 2pm" (day-only);
  - "parking is extremely limited";
  - Blue Badge-only bays;
  - soft play and "Ninja Playground";
  - "one of our cafes" in "why not rest and refuel in one of our cafes?" (the negation guard reads the question).

## Why it is 20 and not the audit's "about 40"

The audit's 40 counted true sentences per field, before checking three things:

- Whether another page of the same venue already yields the field: the mention list here excludes those.
- Whether the existing rules deliberately leave it unknown (limited parking, day-only cafés, soft play).
- Whether the loss was extraction at all. Mudchute's "visitor parking is not available on site", Tate Modern's "no
  parking facilities" and Mayow Park's toilets are extracted correctly. They were withdrawn by reconciliation (a conflict
  with another page, or a newer reading), which is a different problem, documented in `WEBSITE_IDENTITY.md`.

## Coverage this adds (134 London destinations)

- Only one venue gains its FIRST displayed fact: Museum of the Home, which is `ai_draft` today.
- The other 17 already show something and gain wheelchair access, toilets, a café or parking.
- Of the 63 `ai_draft` destinations, only Museum of the Home has a publishable fact anywhere on its stored pages. The
  rest are the blocked, empty and homepage-only sites in the audit's section G.

## Applying it (your approval; not run)

1. Merge `fix/parking-misreads`, then this PR.
2. Run `reextract` (stored pages, no network) for the 18 venues above.
   - Auto-approval may use a reading for 14 days, so these readings (27 Sep to 2 Oct) are usable until 11 to 16 October.
   - After that, the same facts need one `refetch_official` read of each venue's own site (no Google).
3. Sydenham Hill Wood's wrong accessible toilet is disputed by the same run: its page is a complete reading that no
   longer yields it.

**Tests:**
- `extraction-pilot-v6.test.ts` (28): every recovered sentence and every refusal above, verbatim.
- The replay suite's pinned coverage moves with reasons: toilets 31 → 35, café 35 → 39, parking 35 → 36.
- Full suite: 2,853 passed.
