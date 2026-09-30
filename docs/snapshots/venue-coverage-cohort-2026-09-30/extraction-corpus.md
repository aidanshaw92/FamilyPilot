# Extraction corpus: the fresh cohort pages that produced no facts

The fixed input for the extraction workstream. Every row is a real stored `venue_source_evidence` row
from the 2026-09-30 cohort run, named by id so the classification is auditable and cannot drift.

## The predicate, written down once

A row is in this corpus when all of these hold, as stored:

```sql
retrieved_at > '2026-09-30 15:52:00+00'
and familypilot_place_id in (the frozen 18)
and fetch_status in ('ok','fetched_truncated')
and subject_scope in ('venue_own_subtree','venue_named_page')
and jsonb_array_length(coalesce(extracted_evidence,'[]'::jsonb)) = 0
```

That yields **39 rows**: 6 with empty `extracted_text` and 33 with substantive text. The earlier
"47 usable pages" figure conflated these two populations and is superseded.

## Classification (to be filled from the stored text, not from the URL)

1. **true zero** — page genuinely contains none of the ten core family facts;
2. **explicit fact missed** — wording clearly supports a core field, extractor missed it;
3. **ambiguous** — family wording present but does not justify a claim. Stays unknown;
4. **content extraction failure** — fetch succeeded but the useful page content never reached
   `extracted_text`;
5. **eligible but irrelevant** — venue-owned page with nothing to say about venue intelligence.

## Class 4 is already established: 6 empty shells

All Crossrail Place Roof Garden, all `ok`, all `len(extracted_text) = 0`, all with an empty page title.
This is why the venue has "6 usable pages" and serves nothing.

| id | url |
| --- | --- |
| `4179cb6a` | canarywharf.com/arts-events/crossrail-place-roof-garden/ |
| `2efead2f` | …/faq |
| `eb0aa3d0` | …/families |
| `2cb5a157` | …/family |
| `f4fb19fa` | …/facilities |
| `1d020bbd` | …/accessibility |

**Consequence for the crawl metric:** these six satisfied the usable-page target as though evidence had
been obtained. An evidence-bearing-page rule is needed — see below.

## The 33 substantive zero-fact pages

`vocab` is the facility/accessibility vocabulary actually present in the stored text.

| Venue | id | url | len | vocab |
| --- | --- | --- | --- | --- |
| Belmont Children's Farm | `04fc7c88` | belmontfarm.co.uk/fun-farm-soft-play-venue | 7999 | — |
| Belmont Children's Farm | `9f8601b4` | belmontfarm.co.uk/contact | 8000 | — |
| Golders Hill Park Zoo | `d5ee5224` | cityoflondon.gov.uk/…/golders-hill-park-zoo | 4488 | cafe |
| Hanwell Zoo | `636e31cd` | hanwellzoo.co.uk/accessibility/ | 2292 | accessib |
| Hanwell Zoo | `69644dc4` | hanwellzoo.co.uk/plan-your-day/ | 2634 | accessib |
| Hanwell Zoo | `c380b216` | hanwellzoo.co.uk/booking-form/ | 1419 | accessib |
| Hanwell Zoo | `5b420d9d` | hanwellzoo.co.uk/schools/book-a-visit/ | 1619 | accessib |
| Hanwell Zoo | `4e98abaf` | hanwellzoo.co.uk/contact/ | 1493 | accessib |
| Hanwell Zoo | `ea1752b0` | hanwellzoo.co.uk/ | 1201 | accessib |
| Hyde Park Winter Wonderland | `7f2741c8` | …/getting-here/ | 7391 | buggy, car park, accessib, cafe |
| Hyde Park Winter Wonderland | `fbbadfda` | …/tickets-guide/ | 3229 | accessib |
| Hyde Park Winter Wonderland | `7b01ed90` | …/family-fun-day/ | 4005 | accessib |
| Hyde Park Winter Wonderland | `65e382c5` | …/contact-us/ | 4463 | accessib |
| Hyde Park Winter Wonderland | `abd6882f` | hydeparkwinterwonderland.com/ | 3743 | — |
| London Cable Car | `3d8cf357` | londoncablecar.ventrata.site/en | 4974 | wheelchair |
| London Cable Car | `d9782277` | …/frequently-asked-questions | 2357 | — |
| Mudchute Park and Farm | `4c72b474` | mudchute.org/ | 3525 | — |
| Mudchute Park and Farm | `fbf5e649` | mudchute.org/plan-your-visit/faq | 5193 | cafe |
| Mudchute Park and Farm | `0769690c` | mudchute.org/plan-your-visit/opening-times | **59** | toilet |
| Rowans Tenpin Bowl | `f5cd6981` | rowans.co.uk/family-bowling/ | 3083 | — |
| Rowans Tenpin Bowl | `9d728b8f` | rowans.co.uk/ | 2290 | — |
| Rowans Tenpin Bowl | `0675e84c` | rowans.co.uk/book-childrens-party/ | 746 | — |
| The Courtauld Gallery | `6f245581` | courtauld.ac.uk/gallery/plan-your-visit/ | 7946 | car park, accessib |
| The Courtauld Gallery | `470f50cc` | …/eating-drinking-and-shopping/ | 7046 | accessib, cafe |
| The Courtauld Gallery | `47350d63` | courtauld.ac.uk/gallery/ | 6751 | accessib |
| The Courtauld Gallery | `591c0db0` | …/bloomberg-connects/ | 4148 | accessib |
| The Courtauld Gallery | `b55e0e26` | …/ticketing-support/ | 1765 | accessib |
| The Graffiti Tunnel | `562d8a7f` | leakestreetarches.london/gettinghere | 7994 | car park, accessib |
| The Graffiti Tunnel | `56f7de49` | leakestreetarches.london/ | 6104 | — |
| Thorpe Park | `fa4626b1` | …/accessibility-information/ | 7937 | wheelchair, accessib |
| Thorpe Park | `73726892` | …/accessibility-information/rider-requirements/ | 3147 | accessib |
| Thorpe Park | `bcec00ce` | …/opening-times/ | 1278 | accessib |
| Thorpe Park | `df021f70` | thorpepark.com/plan-your-visit/ | 1724 | accessib |

### Leads worth reading first, stated as hypotheses not findings

- **Thorpe Park `fa4626b1`**, 7 937 chars of an accessibility guide containing "wheelchair", zero facts.
  The strongest class-2 candidate in the set.
- **Courtauld `470f50cc`**, an "Eating, drinking and shopping" page containing "cafe", zero facts. A
  `cafe` pattern does exist (`evidence-extractor.js:78`), so this is a pattern that is not firing rather
  than a missing field. Worth knowing that `familyFacilities.cafe` is served for **1 venue in 134**.
- **Belmont `04fc7c88` / `9f8601b4`**, 7 999 and 8 000 chars — at the `extractRelevantParagraphs` cap —
  with **no facility vocabulary at all**. When no chunk scores, that function falls back to
  `text.slice(0, maxChars)`, so the cap may be full of raw head-of-page boilerplate. Likely class 4 with
  a different mechanism from the Crossrail shells.
- **Mudchute `0769690c`**, 59 chars containing "toilet". Probably too short to form a sentence the
  matcher will accept: class 2 or 3, and the boundary between them is the interesting part.
- **Hanwell Zoo**, six pages all matching only "accessib" — likely nav-chrome "Accessibility" links
  rather than statements, i.e. class 3 or 5. A caution against treating the word as a signal.

## The evidence-bearing-page rule, to be decided in the extraction PR

An `ok` page with empty or near-empty `extracted_text` must not count as a usable page, satisfy the
six-usable-page target, or appear as an extraction failure. But the rule cannot simply be "short text
fails": Flip Out's `environment` fact comes from a page **title**, and `verifiedBundleForVenue` already
requires `r.extractedText` to be non-empty, which would discard a title-only fact.

So the rule needs to distinguish:

- **empty shell** — no readable body text *and* no usable title → not evidence-bearing;
- **title-only evidence** — no substantive body but a title that carries a fact → evidence-bearing for
  the fields that legitimately read titles.

None of the 6 Crossrail shells has a title either, so both classes are separable on this corpus.

## Scope for the extraction PR

Improve extraction only for **explicitly demonstrated** missed statements from the rows above. Unknown
stays unknown. Positive and explicit-negative cases for toilets, baby changing, parking / free parking,
accessible toilet, wheelchair access, pushchair / buggy, café, playground, indoor / outdoor. **No** visit
duration and **no** recommended ages in this PR. Rerun the frozen 18 offline; success is served-to-parent
fields increasing, not extractor test count.
