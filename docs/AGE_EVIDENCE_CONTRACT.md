# Age suitability: the evidence contract and what the existing cohort can supply

Re-measured on the current corpus on 7 Oct 2026, with the contract hardened against non-age numbers: [AGE_SUITABILITY_YIELD.md](AGE_SUITABILITY_YIELD.md).

Status: PR #159, not merged. Existing official evidence only (the venues' own stored pages); no new data, no new
fetching, no spend, nothing written to production. Read-only queries on 5 Oct 2026 over the **138** browsable venues.

## The contract (executable: `server/enrichment/_lib/age-evidence.js`, pinned by `age-evidence-contract.test.ts`, 11 tests)

A statement may be treated as a fact about who a venue is for only if **all** of these hold:

1. **Source.** The venue's own pages: `official_website`, `visitor_info`, `family_page`, `faq_page`,
   `accessibility_page`. Never a parent report, a provider category, or another venue's page.
2. **Scope and fetch.** `subject_scope` is `venue_own_subtree` or `venue_named_page`, fetched cleanly.
   `sibling_unverified`, `organisation_ancestor` and `other_catalogue_venue` are quarantined, as everywhere else.
3. **Shape.** One complete sentence, quoted, that is one of:

| Kind | Example from the cohort | May do | Needs a human |
| --- | --- | --- | --- |
| `door_policy` | "Suitable for under 16s only" | the only kind that may exclude | **yes** (30-day lifetime, `AGE_POLICY.md`) |
| `supervision_rule` | "Children aged under 8 years old must be accompanied by an adult at all times" | be shown as a fact; never excludes (it admits the child) | no |
| `recommended_range` | "the recommended age of the attraction is children aged 6 and over" | rank and explain; never excludes | no |
| `facility_range` | "This playground is suitable for children 4 to 7, 8 to 14 years old" | shown for that part of the venue, not as the venue's range | no |
| `qualitative` | "great for young children" | a lead for wording, never a number | no |

4. **Never evidence, however age-shaped:** ticket and price bands ("Child (4-17): £11", "under 3s go free": a price
   band is not suitability); programmes (workshops, classes, sessions, events, parties, camps, walks); marketing
   ("for all ages", "for everyone"); group sizes ("20+ people"); job or volunteer ages; a sentence the extractor cut
   off ("aged 3 – ["). A clause that mixes the two is judged clause by clause ("under 2s go free **but** the recommended
   age is 6 and over" is a price and a recommendation).
5. **Parents cannot produce age evidence.** A visit report has five fields (baby changing, buggy, toilets, parking,
   café); there is no age field, `validateReport` rejects any other key, and the classifier refuses `parent_report`
   as a source. A parent's "it suited my 3 year old" has nowhere to go and does not become a range.
6. **Category is never an age.** No "park = all ages", "soft play = toddlers", "museum = children". "Hackney City
   Farm is a city farm" classifies as no statement.

## What the existing 138-venue cohort can genuinely supply

Of 138 venues, 93 have a cleanly fetched page of their own; the other 45 cannot be read at all (no website, a
Cloudflare wall, 404, timeout). 41 venues have any age-shaped number on those pages. Replaying the contract over every
age-shaped sentence:

| Outcome | Venues | Share of 138 |
| --- | ---: | ---: |
| Age-shaped wording found at all | 41 | 30% |
| of which **rejected** (price bands, events, marketing, group sizes, cut-off text) | 30 | 22% |
| **Supervision rule** (venue-level fact) | 8 | 5.8% |
| **Recommended range** (venue-level) | 1 | 0.7% |
| Facility-level range (a playground) | 2 | 1.4% |
| Door-policy **candidate**, needs a human | 1 | 0.7% |
| Qualitative audience only | 1 | 0.7% |
| **Any usable official age statement** (union) | **11** | **8%** |

By name: supervision rules at Kentish Town City Farm (under 8), Royal Air Force Museum (under 11), Paradox Museum
(under 14), London Eye (15 and under), Woodside Animal Farm (under 16), Flip Out Brent Cross (5 to 12) and Flip Out
Canary Wharf (under 5), and SEA LIFE London Aquarium (15 and under); SEA LIFE is also the one venue whose own pages
state a recommended range (6 and over); playground ranges at Battersea Park and Burgess Park; one "under 16s only"
candidate at Flip Out Watford, which sits inside a party-package listing and so needs a human to decide whether it
describes the venue.

**Door policies: effectively none.** Nothing in the corpus refuses a child entry outright, so there is nothing that
should exclude a venue for any family.

## Conclusions

* **About 92% of the cohort stays unknown for age, and honestly so.** Most pages that mention ages mention prices.
  Venue age advice is rarely published, and where it is it sits in programmes. A venue's category is not a substitute.
* **The one robust yield is a different fact.** Supervision rules (8 venues) are real, official and useful to a
  parent (it decides whether an older child can go alone, and how a 7-year-old is looked after) but they are not an
  "age range", and the product has no field for them. Using them would mean a new claim type; that is a feature, not
  a release-candidate change, and is listed as a post-merge option.
* **Recommended ranges: 1 venue.** Not worth a producer by itself. A producer would be worth building only if age
  sources were broadened (activity and "plan your visit" pages), which needs new fetching and is out of scope here.
* **Nothing here is wired to publication.** The contract is a classifier plus tests: no claim is written, no draft
  approved, no production row touched, no data bought. Family Fit continues to say nothing about ages where no range
  exists.
