# Pricing evidence sample from stored official pages, and the yield to expect

Read-only, 2026-10-08. Nothing was fetched, no provider was called, nothing was written to production and no extractor was
built or run. Every snippet below is stored text from a page on the venue's own website (`subject_scope` = the venue's own
subtree) read by a loose pattern search and then **classified by hand**. This is a sample to decide whether and how to build a
reviewed extraction, not a result of one.

## 1. Funnel (134 destinations; restaurants and cafés are excluded because they are not priced per ticket)

| Step | Venues |
| --- | ---: |
| Destinations in London | 134 |
| with a stored page of their own that contains a £ amount next to an admission-type word | **33** (38 counting pages that are not the venue's own) |
| whose snippet is general admission (not a party, event, membership, café item, hire or a false match) | about 20 |
| of those, firm enough to price a family without a person reading the page | **3** |
| venues with a clear, venue-level statement that general entry is free | **about 18** (22 mention free entry in words; 4 of those are false matches or cover only an area) |

The 3 firm ones are Hanwell Zoo, Museum of Brands and The Sherlock Holmes Museum. Everything else needs a person to decide
which ticket the figure belongs to.

## 2. The sample, as stored

Adult prices, child bands and family rules actually present (retrieval dates from the stored reading; "also" means a second
stored reading differs):

| Venue | What the page says (abridged) | What it supports | Why a person must look |
| --- | --- | --- | --- |
| Hanwell Zoo (30 Sep) | Adult £5, Per child £4, Under 3 free; season tickets listed beside | adult, child, free-under-3 | Child's upper age not stated |
| The Sherlock Holmes Museum (26 Sep) | Adults £19, Concessions £17, Children (under 16) £14, Children (under 6) free | adult, child 6 to 15, free under 6 | Reads cleanly; the two child lines overlap in wording |
| Museum of Brands (27 Sep) | Adult £14 (26 to 59), Child £8 (7 to 16), Concession £10, Accessible £10, **Family £36 (2 adults, 2 children)**, children under 6 free | adult, child, family rule with limits | The age 6 gap (under 6 free, child from 7) must be read, not assumed |
| De Havilland Aircraft Museum (1 Oct) | Adult £14, Concessions £12, Child (5-16) £8, Family £35; then "Without Gift Aid (standard prices)" with lower figures | adult, child, family | **Two price lists** (with and without Gift Aid); which is "the price" is a policy call; family composition not in the snippet |
| Chiltern Open Air Museum (1 Oct) | Adult £17.50*, Concessions £16 | adult only | Earlier reading (26 Jun) was £14.50; the asterisk is unread; no child price in the snippet |
| Cutty Sark (26 Sep, 1 Oct) | Adult £22 Child £11 (one reading); Adult £38 Child £19 (the other) | adult and child | **Two different products** (the ship alone versus a combined ticket) on the same page |
| London Cable Car (11 and 30 Sep) | Adult 16+ £13.50 / Child 5-15 £6; Adult £25 / Child £12; Adult £7 / Child £3.50 | adult, child 5 to 15 | **Three products** (single, return, other); the cheapest is not the typical |
| London Eye (26 Sep) | £29 per adult; under 2 free but must be booked | an adult "from" price | No child price in the snippet; "from" |
| SEA LIFE London (1 Oct) | From £28 per adult; under 2 free | an adult "from" price | "From" for an online advance ticket |
| Paradox Museum (30 Sep) | "...children and £24 for adults" (truncated) | adult | Child price cut off |
| Discover Children's Story Centre (26 Sep) | Day entry adult or child; borough and annual rates | one price for adult or child | The amount is separated from its label in the text |
| Flip Out Watford, Brent Cross, Canary Wharf (Sep to Oct) | £3.50 to £3.95 per person, sessions "strictly for ages 5 and under"; £11.95 for 2 hours, £16.95 for 3 hours; "under 5s require a paying adult" | a **session price per child**, not an admission | Needs its own price model (per child, per session, an age ceiling, a paying adult) |
| Queen's House, National Maritime Museum | Adult £35 / Child £17.50 (+£3 booking fee); Adult £12 / Child £6 / Student £9 | prices for a **ticketed experience** | The museum's general entry is free ("The Queen's House is free to visit"); the prices belong to a tour or experience |
| Whitechapel Gallery (27 Sep, 1 Oct) | "Free Entry to the Gallery. Ticket prices apply for select Exhibitions: Standard £15"; elsewhere £16.50*; under 16s free | free general entry plus paid exhibitions | Two statements that disagree in amount and scope |

## 3. What is NOT admission (and a naive extractor would take)

| Venue | Stored text | What it actually is |
| --- | --- | --- |
| Gunnersbury Park, Headstone Manor | "£8 child, £10 adult", "£7 Standard / £4 Concessions" | a film screening, a craft session (events) |
| Colne Valley Regional Park, Kentish Town City Farm, Flip Out Watford | "£240 for up to 20 children", "£185+VAT for 2 hours", "£39.99 per person" | birthday parties |
| Swanley Park | "£10.00 per child which includes festive items" | a seasonal trail |
| Horniman | "£42 Direct debit / £47 Standard" | membership (and the museum is free) |
| London Museum Docklands | "Kids' meal boxes £6", "Babyccino £1" | café menu |
| Diana Memorial Playground | "£3 million renewal" | not a price |
| Queen Elizabeth Olympic Park | "under £10" | restaurant guide |
| Hyde Park Winter Wonderland | "£3 per child aged 12 and under, £4 per adult 13+" | an add-on pass; "unlocks free entry to the event" |

## 4. Free entry: the part-versus-whole traps

Of the 22 venues whose pages say something is free, roughly **18 say general entry is free at venue level** ("The National
Gallery is free to visit", "Mudchute Park and Farm is free to visit", "Headstone Manor: FREE ENTRY", "Admission is free" at the
V&A sites, Tate Britain and Tate Modern, Museum of the Home, Queen Elizabeth Olympic Park, Horniman, Hackney City Farm, London
Museum Docklands, Gunnersbury Museum, RAF Museum, Queen's House, National Maritime Museum, Whitechapel Gallery).
**Several of these also charge for something**: Tate, Horniman, Museum of the Home, Whitechapel and the Maritime Museum have
ticketed exhibitions or experiences, and RAF Museum asks for booking. The honest label is **"Free entry; some exhibitions or
experiences are charged"**, not a bare "Free".

Four matches are a part, an add-on or a false match, and must never label the venue:

| Venue | Stored text | Reason |
| --- | --- | --- |
| The Courtauld Gallery | "the entrance hall and the ticketing hall... will be free to visit" | an area only; the gallery is ticketed |
| Design Museum | "Permanent collection display... is free to visit, located on Level 2" | one display; the rest is ticketed |
| Hatfield Park | "Entrance to The Stable Yard is free of charge" | one area; the house and gardens are ticketed |
| Hyde Park Winter Wonderland | "Unlocks free entry to the event - worth up to £9" | a pass |

False matches that say "free" about something else: Chiltern Open Air Museum and De Havilland ("a carer free of charge"),
Hampstead Heath (mobility buggies "free of charge"), Warner Bros. Studio Tour (cloakroom), RAF Museum (wheelchairs), London Eye
and SEA LIFE (children under 2, a band, not free entry).

## 5. What a reviewed extraction has to handle (from the sample)

1. **More than one price list on a page** (Cutty Sark, London Cable Car, De Havilland, NMM): the claim must say which ticket
   it is and which is the general admission, or stay unknown.
2. **Price changes between readings** (Chiltern £14.50 in June, £17.50 from August): the latest reading governs and the check
   date is shown; a price older than the product's 400-day freshness window is unknown.
3. **Child bands differ and sometimes leave gaps** (5-16, 5-15, 7-16, under 16, 12 and under, under 6 free beside child from
   7): a child outside every band is unknown, never free and never charged at the adult rate.
4. **Family tickets are only usable with their limits** (Museum of Brands: 2 adults and 2 children; the De Havilland snippet
   has none): without stated limits the family route is not offered.
5. **"From" prices and asterisked prices** are minimums or conditional and are labelled so.
6. **Sessions and per-child pricing** (soft play) need a separate model; they are not a general admission.
7. **Free entry** is recorded as `free general entry`, with the paid parts named, never as a flat "free".
8. Source reliability: every sampled page is the operator's own site (including its booking subdomain), so reliability is
   high; the risk is reading the wrong product, not a wrong source. Event pages and party pages carry real prices that do not
   describe a visit.

## 6. Expected usable yield (before anything is built)

| | Venues of 134 | Share | How |
| --- | ---: | ---: | --- |
| Free general entry, labelled with caveats | about 18 | 13% | one human read each; low risk |
| Paid, firm and complete (adult, child band, free-under rule; family rule where stated) | 3 | 2% | could be extracted automatically with a check |
| Paid, plausible after one human decision about which ticket or list applies | about 8 | 6% | Chiltern, De Havilland, Cutty Sark, Cable Car, London Eye, SEA LIFE, Paradox, Discover |
| Session pricing (soft play) | 3 | 2% | needs a separate model; defer |
| **Usable now with review** | **about 26 to 29** | **19% to 22%** | |
| **Usable with no human read** | **about 3, plus at most a dozen free-entry statements the pattern is sure of** | **2% to 11%** | |
| Still "Price not confirmed" | about 105 | 78% | |

So the review-first route would give prices (or confirmed free entry) on roughly one venue in five, and two thirds of that is
free entry. The price filters reappear on free entry alone (18 of 134 is 13%, above the 10% threshold), but **"Under £25"
would then mean "free or a priced venue under £25" and say nothing about the 80% unknown**: the filter sheet should say how many
places the filter can speak about. Family totals (adult plus children plus family-ticket comparison) are computable for about
**11 venues** (the 3 firm and about 8 reviewed), not 26.

## 7. Recommendation (nothing started)

1. Do **free general entry first**: it is the most common, the safest and the most useful to a family choosing a day. About
   18 reviewed claims, each with its caveat text and source, written by the existing approved-claim path.
2. Then the **3 firm paid venues**, as the proof that the calculator in #171 produces a number a parent can trust.
3. Review the 8 plausible ones one at a time; accept only those where one ticket is plainly the general admission.
4. Build no new fetching: every page above is already stored. The extractor should be a proposer (it suggests a claim and
   shows the sentence) with a person approving, consistent with how facilities are done today.
5. Do not display a calculated total for any venue that is not in the reviewed set, as already approved.

What this needs from you: a go for steps 1 to 3 (about 30 reviewed claims, £0, no provider call), and the decision on whether
a Gift Aid / non-Gift-Aid pair counts the standard price as the price (my suggestion: yes, with the other shown).
