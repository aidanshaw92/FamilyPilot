# Venue profile quality: the standard, where the 134 destinations stand, and the path to 90%

2026-10-08. Numbers come from a read-only measurement of production taken today (served claims, stored pages,
drafts, catalogue), the reviewed data files on main and the open PRs, and from the three pieces of evidence work done
today (Step 1 simulation, detector pilot, Step 2 dry run). The venue-by-venue matrix is
`docs/data/quality-matrix-2026-10-08.csv`.

Everything in §4 and §5 is **projected**, from evidence already in hand; §2 is **measured**. Nothing was written to
production.

## 1. The standard: what makes a profile useful

A parent needs answers to eight questions. Each is a dimension; each has an honest "unknown" state, and unknown is
never read as "no".

| # | Question | Dimension | Evidence that answers it | Unknown state |
| --- | --- | --- | --- | --- |
| 1 | Is this the right place? | Identity | catalogue name, coordinates, category, official website | a venue with no website recorded is flagged, not guessed |
| 2 | When can we go? | Opening | opening hours on the place record, or the venue's own page | "Check opening times" |
| 3 | What can my children do, and does it suit their ages? | Activity | reviewed activity evidence (a permanent provision with a stated age); or the venue's own recommended range; for a park or soft play, a confirmed playground or play area; for a zoo or farm, the visit itself | "We haven't confirmed what suits [name]" |
| 4 | Can I come with a baby and a buggy? | Logistics: pushchair and access | pushchair suitability, step-free or wheelchair access | "Buggy access not confirmed" |
| 5 | Toilets, baby changing, food, parking? | Logistics: facilities | served facility claims, by category (below) | each fact shown as unknown |
| 6 | Accessibility? | Access | wheelchair access, accessible toilet, quiet sessions | unknown |
| 7 | What will it cost? | Pricing | a reviewed admission claim with a current reading (`PRICING_FRESHNESS_POLICY.md`) | "Price not confirmed", with the last known figure dated |
| 8 | Why is it recommended to us? | Reasoning | Family Fit reads 3–6 and the reviewed evidence; it names a child only when evidence covers their age | "Possible for your family" |

Provenance, freshness and confidence sit under every dimension: a fact is served only from the venue's own pages,
within its lifetime (30 days for facilities and access, 90 for environment, 180/365 for prices), and never from a
conflicting or rescoped reading.

**Category requirements.** A free park and a national museum are not judged the same way:

| Category | Core facilities for "ready" | Activity evidence that counts |
| --- | --- | --- |
| Park, common, wood | toilets **or** a playground | a confirmed playground or play area (the visit is the activity) |
| Museum, gallery | toilets, and baby changing **or** a café **or** an accessible toilet | a reviewed permanent provision or programme with a stated age, or the venue's recommended range |
| Zoo, farm | toilets, and a café **or** parking | the visit itself |
| Soft play, trampoline | toilets **or** a café | the play area (with its stated age where given) |
| Attraction | toilets, and baby changing **or** an accessible toilet **or** pushchair suitability | reviewed provision or recommended range |
| Activity centre | toilets **or** a café | the activity's own stated age |

**Tiers.**

- **Recommendation-ready:** identity confirmed, visible to parents (not `ai_draft`), opening known, category activity
  evidence present, core facilities confirmed, and at least three served facts in all.
- **Discoverable but incomplete:** visible, with at least one served fact, missing one or more of the above.
- **Insufficient evidence to recommend:** a draft or provider-only record, or no served fact.

Pricing is not a tier requirement: an honest "Price not confirmed" is acceptable; a wrong price is not.

## 2. Where the 134 London destinations stand today (measured)

| Tier | Destinations |
| --- | ---: |
| Recommendation-ready | **9** (Beckenham Place Park, Burgess Park, Colne Valley, Gladstone Park, Golders Hill Park, Kentish Town City Farm, London Fields, Queen Elizabeth Olympic Park, Rickmansworth Aquadrome) |
| Discoverable but incomplete | **57** |
| Insufficient | **68** (63 `ai_draft`, 2 provider-only, 3 visible with no served fact) |

By category: parks 8 / 22 / 35; museums and galleries 0 / 24 / 15; attractions 0 / 3 / 6; zoos 0 / 1 / 4; farms 1 / 3 /
1; soft play 0 / 4 / 2; activity centres 0 / 0 / 5.

**No museum is ready**, and the reason is one dimension: activity evidence. After today's final review of #183, 11
venues carry a reviewed permanent provision or programme, and none of them is a museum with its logistics also
confirmed. Museums have the facilities (24 are discoverable); what they lack is a reviewed statement of what a child of
a given age can do there.

**Per dimension (of 134):** opening known 106; activity evidence 42; core facilities 42; pushchair or access fact 16;
price published 23; visible 69. Served facts shown today: **205 at 66 venues** (the 195 reported earlier plus today's
pricing and access facts).

## 3. Why they are not ready: pipeline failure versus source scarcity (measured)

Each destination's shortfall was traced to its cause in the stored evidence (matrix column `recovery`):

| Cause | Destinations | What it means |
| --- | ---: | --- |
| **A. The stored own pages hold more than is served** | **53** (41 discoverable, 12 insufficient) | re-read with v6 rules, rescope, or a person reviewing a family or access page already in the store |
| **B. More official pages are needed** | **23** (13, 10) | the stored pages are the venue's but thin; a family, access or facilities page (or a visitor-guide PDF) exists on the site and was not reached |
| **C1. Blocked or refused site** | **34** (2, 32) | 14 of these are the detector false positive the pilot proved; the rest are real 403s, shells and 404s |
| **C2. Pages stored but none usable** | **9** (1, 8) | wrong recorded website (a moved council URL, the Historic England register), an empty page, or another venue's pages |
| **D. No official website recorded** | **6** | Tooting Commons' council page is known; the others (Boston Manor Park, Streatham Vale Park, Kingston Museum, Platform 9¾, Troubadour Wembley Park) need a source found by a person |
| Ready | 9 | |

So **85 of the 125 non-ready destinations (68%) are pipeline or source-routing problems**, not scarcity: A, C1's false
positives and C2. Genuine scarcity is D plus the refusing sites in C1 (British Museum, Kew, National Portrait Gallery,
Postal Museum, Willows, Paddington Rec, Jump In, AirHop, Crossrail Place, three Barnet parks): about 20.

## 4. The pilot: 13 destinations, baseline and prepared outcome (projected from evidence in hand)

The pilot was chosen to cover each cause and category. Every "after" fact below is quoted from a page already read
(stored, or read once by the detector pilot from a GitHub runner); none has been written.

| Destination | Category, cause | Baseline (served) | Evidence found | After, if approved | Tier after | Review |
| --- | --- | --- | --- | --- | --- | --- |
| Museum of the Home | museum, A | 0 facts, draft | "Step-free access is available to the Museum and to our galleries." (27 Sep) | wheelchair access; leaves draft | discoverable | none (automatic, Step 1) |
| Cutty Sark | museum, A | 1 | "accessible cubicles in both the men's and the women's toilets"; "main toilets are next to the cafe" | +toilets, +café | discoverable | none (Step 1) |
| Colne Valley Regional Park | park, A | 6, one wrong | "There are two carparks run by Bucks County Council" | parking no → yes; a marketing "outdoor" withdrawn | ready (stays) | none (Step 1) |
| Sydenham Hill Wood | park, A | 3, one off-site | "nearest Changing Places Toilet … in Dulwich Park" | accessible toilet withdrawn; +wheelchair access | discoverable | none (Step 1) |
| Madame Tussauds | attraction, A (identity) | 0 | own pages were scoped to the operator: "no parking onsite"; "unable to bring a buggy"; "baby-changing facilities located at regular points" | +4 facts | discoverable | person approves 4 (Step 2) |
| Walthamstow Wetlands | attraction, A (identity) | 0 | the reserve's own page: toilets, accessible toilet, baby changing, café, paid parking, wheelchair access | +7 facts | discoverable | person approves 7 (Step 2) |
| Crystal Palace Park | park, A (identity, stale) | 0 | playground, public toilets, Changing Places toilet (11 Sep) | +3 after one fresh read | discoverable | person approves 3 |
| Science Museum | museum, C1 false positive | 0, draft | homepage readable (4,605 chars) once the rule is fixed | a crawl of its visit pages | discoverable at least | exception only |
| Natural History Museum | museum, C1 false positive | 0, draft | `/visit.html`: toilets, café on first read | +2 on first read, more from access page | discoverable | exception only |
| London Zoo | zoo, C1 false positive | 0, draft | homepage readable (1,994 chars) | a crawl of its pages | discoverable | exception only |
| Holland Park | park, C1 false positive | 0, draft | council page: toilets, café, accessible toilet, playground on first read | +4; playground gives activity | **ready** if opening known | none |
| The British Museum | museum, C1 genuine refusal | 0, draft | HTTP 403 interstitial on every page | nothing from the website | insufficient | needs another official source |
| Royal Botanic Gardens, Kew | park, C1 genuine refusal | 0, draft | HTTP 403 interstitial | nothing from the website | insufficient | needs another official source |

**Measured on the pilot:** facts recoverable 16 + 1 correction (Step 1, automatic) + 14 (Step 2, reviewed) + 6 on first
read of three fixed sites = **37**; incorrect or unsupported claims rejected: 7 withdrawn (Step 1) + 4 declined (Step 2) +
1 conflict (Paradox) = **12**; destinations moving from insufficient to discoverable: 7 of 11 non-ready; to ready: 1
(Holland Park, if its hours are known); human review: 14 approvals and 4 declines in one sitting; Google cost: **0**;
collection cost: 36 page reads from a runner, about 70 seconds.

**What the pilot says about the method.** It works where the venue publishes and lets us read; it adds nothing where
the site refuses, and it does not manufacture activity evidence: of the 13, only Holland Park reaches "ready", because
a park's playground is its activity. Museums will keep stalling at "discoverable" until activity evidence is reviewed
at scale (§5, phase 3).

## 5. The path to 90% (projected)

90% is 121 destinations. From the matrix, the sequence that gets closest without lowering any rule:

| Phase | What | Mechanism | Google | Review | Ready after (projected) |
| --- | --- | --- | ---: | --- | ---: |
| 0 (now) | | | | | 9 |
| 1 | Step 1, Step 2, detector merge and Step 3 refetch of 14 wrongly blocked venues; corrected URLs for 9 C2 venues | stored pages + `refetch_official`; no crawl beyond known sites | 0 | ~25 facts, one sitting | **15–20** (A/C1 parks and farms whose playground or café confirms; most museums stay discoverable) |
| 2 | Deeper official pages for the 53 A and 23 B venues: family, access, facilities pages and visitor-guide PDFs, via the existing link finder plus a PDF reader | `refetch_official` with a wider page budget; PDF text extraction (new) | 0 | exceptions only (~2 per venue) | **45–60** |
| 3 | Activity evidence at scale: an extractor for "permanent provision + stated age" sentences (the audit found such statements at ~40 venues), every candidate reviewed by a person before it names a child; opening hours from official pages for the 28 without any | new extractor; review queue | 0 | ~80 items, 4–6 hours | **80–95** |
| 4 | The refusing sites (British Museum, Kew, NPG, Postal Museum, Willows and the others): official PDF guides on other hosts, accessibility guides (e.g. AccessAble pages the venue links to), operator-supplied data | new source types, each reviewed for licence and identity | 0 | per venue | **95–105** |
| 5 | The 6 with no recorded website, and opening hours only Google has for some parks | a person finds the source; Place Details for the few with no official hours ($0.02 each) | ≤ 30 calls | per venue | **100–110** |

**Honest ceiling: about 75–80% (100–108) from official sources that can be read, within the rules.** The last 10–15%
is venues that refuse automated reading, publish nothing usable, or have no site; reaching 121 there means either an
operator relationship (a data feed or a one-off answer, which is a different strategy and not the default) or
accepting "discoverable" for them. **90% is not realistic without new source types; 75–80% is, and every venue in it
would carry real, dated, source-backed facts.** The defensible target is therefore: 100+ ready, every other destination
discoverable with honest unknowns, none insufficient except where the source genuinely does not exist.

## 6. Scaling to 600–800 venues without a manual catalogue

The pipeline already has the shape; each row names what exists and what phase 2–3 adds.

| Need | Exists today | To add |
| --- | --- | --- |
| Automated, permitted source discovery | official website per venue; link finder for visit/access/family pages; `OFFICIAL_ROOTS` overrides | council-directory and operator-site patterns (Royal Parks, City of London, boroughs) so a park's page is found without a person; PDF guides |
| Source-specific extraction | rules v6 for nine facility and access fields; pushchair and environment extractors | activity-and-age extractor (reviewed); opening-hours extractor; navigation-menu rejection (the QEOP "Parklands and playgrounds" quote shows menus still pass) |
| Provenance and timestamps | every claim: URL, quotation, reading date, expiry, approver, draft id | unchanged |
| Confidence and contradiction | high-confidence only; conflicts withheld; own page withdraws its own claim | unchanged |
| Category-aware quality scoring | this document's tiers (computed offline today) | compute in the API and show the tier in the internal review screen |
| Exception-based human review | review screen; rescoped and age facts never auto-approved | a queue ordered by venue tier impact: what one approval would move to "ready" |
| Scheduled freshness | hourly `refresh_venue_data`, 50 venues/day, 7–15 days before expiry; verified running (24/24 today, 0 failed) | report the queue's daily yield so a silent zero is noticed |
| Safe expiry and replacement | 30/90/180/365-day lifetimes; replace-in-one-transaction; grace only on transient failure | unchanged |
| Source failure detection | fetch status and HTTP status stored (#181 adds the status); detector pilot workflow | a weekly report: venues whose latest reading is blocked, by cause |
| Cost monitoring and controls | `google_places_usage`; fail-closed posture canary; photos switch | a hard daily cap in code for Place Details (today only the scheduler bounds it) |
| Rollback and auditability | statuses, never deletes; rescoped reason tags | unchanged |

**Operating cost at 700 venues (projected).** Fetching: 0 (own websites, runner or Vercel egress). Google: Place
Details only when a place record is older than 14 days and a job regenerates it; capped by the scheduler at 50 venues a
day; at $0.02 a call the worst case is ~$30 a month, and the no-Google replenisher (`docs/sql/replenish_without_google.sql`)
takes it to 0 for refreshes. Human review: one-off 1–2 exceptions per venue at 3–5 minutes each, so roughly 60–100
hours to bring 700 venues through phases 1–3, then 2–4 hours a month as facts expire and sites change. No venue is
contacted as a matter of course.

## 7. What is not in this document

- No production write, cron change or paid call: the commands are in `STEP1_REEXTRACT_GATE.md`,
  `STEP2_RESCOPE_PACKAGE.md` and `PRODUCTION_RECOVERY_PLAN.md`, each waiting for approval.
- No venue import. Phase 2 of `CATALOGUE_PILOT_PLAN.md` stays deferred until phases 1–3 above show new venues can
  become ready economically.
