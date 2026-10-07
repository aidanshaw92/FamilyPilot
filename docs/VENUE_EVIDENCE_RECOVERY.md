# Venue evidence recovery

Branch `feat/venue-evidence-recovery`. Not merged and not deployed. Written 7 Oct 2026.

This work tests one promise: *will this place work for our family with a baby and a toddler?* The question was not
how many fields are filled. It was whether the facts a family needs were already published by the venue and lost
somewhere between the page and the app, and if so, where.

**Where each check ran.** Every check in this document ran locally: unit tests, the replay set, typecheck and the web
build. The production database was used only for read-only aggregate queries and to export the public venue text in
the replay set. No personal records were read. Nothing was deployed, re-queued or written to production, and no Google
or other provider calls were made. The production host cannot be reached from the sandbox, so nothing here was
verified in production.

## 0. Reconciling the claim counts (183, 182, 72, 77)

Four numbers describe the same production table on 7 Oct 2026, and each answers a different question. The before/after
figures in this document use the definitions below throughout.

| Figure | Definition | Value on 7 Oct 2026 |
| --- | ---: | ---: |
| Rows with `status = 'active'` | every active row in `venue_claims`, any field, any venue | **183** |
| Served claims | active rows whose `valid_until` is today or later and whose approver is not the legacy `ai_auto_approved` (the two conditions `isClaimActive` applies before a parent sees a fact) | **182** |
| Venues with a served claim | distinct venues among the 182 | **72** |
| Served core facts on destinations | the 182 restricted to the five fields this work is about (baby changing, toilets, café, parking, buggy access) and to the 151 destinations | **77** (79 across all venues) |

What the other statuses hold: **121 disputed** (quarantined by the subject-scope guard or a source conflict; never
served), **529 superseded** (an earlier reading of the same field, replaced; never served), **0 expired**. Only one
active row is past its `valid_until` (Headstone Manor's buggy rating, an editor's claim from 11 Aug), so there is no
expiry wave: 179 of the 183 active rows were created on or after 1 Oct, during the refresh that followed PR #159.

The due diligence report quotes the 183 figure. A figure of about 73 is the venue count, not a claim count: no
definition over this table yields 73 claims. The report's "claims expire after 60 days" is also not what the code does:
facility, accessibility, SEND and buggy claims lapse 30 days after the reading they came from, everything else 90
(`expiryDate` in `trusted-evidence.js`; `claim-freshness.js` mirrors it).

For the before/after measurement in sections 4 and 6, "before" is the served-core-facts definition, per field and per
venue, on 7 Oct 2026, and "after" is the same query after the reprocessing pass.

## 1. Baseline (production, 7 Oct 2026)

The baseline covers 151 stored destinations: parks, farms, museums, zoos, play and attractions. Restaurants are
excluded. It counts each field once per venue, in the first matching class, read left to right. The figures are dated
and expected to move.

| Field | Confirmed (active claim) | Disputed only | Mentioned on own readable pages, not confirmed | Only on withheld pages (scope) | Own pages read, silent | No website | All pages blocked | All pages failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baby changing | 21 | 8 | 10 | 1 | 63 | 8 | 32 | 8 |
| Toilets | 21 | 7 | 21 | 3 | 52 | 8 | 32 | 7 |
| Buggy access | 5 | 5 | 27 | 5 | 62 | 8 | 32 | 7 |
| Café / food on site | 5 | 0 | 43 | 15 | 41 | 8 | 32 | 7 |
| Parking | 25 | 11 | 38 | 9 | 22 | 8 | 32 | 6 |
| Age (venue-recommended) | 0 | – | 30 mention an age | 16 | 57 | 8 | 32 | 8 |

Other context: 183 active claims, of which 1 has expired; 121 disputed claims.

The figures map onto the gap classes in the brief as follows:

- **No source.** 8 venues have no website.
- **Blocked or unavailable.** 32 have every page blocked. 18 Barnet Council pages, across Sunny Hill, Victoria and Oak
  Hill parks, are Imperva "Pardon our interruption" shells that were stored as readable. Jump In Elstree's ten pages
  are empty JavaScript shells. Burgh House's five pages each hold 15–34 characters.
- **Missed by extraction.** The "mentioned … not confirmed" column. Examples:
  - Brent Council lists "Facilities … Caf&eacute;" for Gladstone Park, and the entity was never decoded.
  - RAF Museum's "All have baby changing facilities" fell outside the only anchor window that was read.
  - Golders Hill Park's "In the Park, you can find: a café" is a list, not a sentence.
  - Belmont Farm's "You can park in the top car park" matched no parking pattern.
  - Flip Out Watford is "buggy-friendly", and no pushchair pattern knew that word.
- **Rejected, disputed, expired or withheld.** 121 disputed claims; the scope-withheld column; 1 expired claim.
- **Wrong source.** 7 parks have a Historic England register entry as their Google "website". For example, Roundwood
  and Broomfield parks were crawled at historicengland.org.uk. Primrose Hill's own page is filed under Regent's Park,
  so its facts cannot be attributed to it alone.
- **Stored but not used.** Approved café claims reached Family Fit's "Café on site" reason but never reached ranking.
  `MatchableVenueFacts` had no café field. Ranking scored only the facts that happened to be known, as a ratio. So a
  venue with nothing confirmed except its toilets scored the same 100 as one with toilets, changing and parking all
  confirmed. A confirmed "no parking" also scored worse than silence.

Wrong values found during the baseline (served today):

- Mayow Park toilets = yes. The page says "The toilets are open Thursday and Sunday, 11am–4pm."
- Sydenham Hill Wood toilets = yes. The quote is about "the nearest Changing Places Toilet … in Dulwich Park".
- Streatham Common parking = no. This was read off the yellow lines on surrounding roads; the same page describes the
  common's own car park.

## 2. Root causes

1. **Improved rules never reach stored venues.** Periodic refresh is capped at 50 a day, and it only revisits venues
   untouched for more than 14 days or near expiry. In the two days after the last extractor release, one venue was
   refetched. Re-extracting from stored text is not a substitute: some stored text predates current cleaning (for
   example, Waterlow Park's navigation "play areas").
2. **HTML entities left encoded.** 239 stored pages across 74 venues carry named entities. Nine spell "Caf&eacute;".
3. **Negation was sentence-wide, and only the first anchor window was read.** Flattened pages turn whole sections into
   one "sentence", so a "not" a paragraph away cancelled a statement. A second mention of the same facility on a page
   was never looked at.
4. **Council facility lists were ignored.** "Facilities: Café Toilets Car park" has no verb for a sentence pattern to
   match.
5. **Gaps in parking phrasing:**
   - A venue's own car park, described in its own words ("you can park in the … car park", "we have a … car park",
     "on-site car park"), was missed.
   - So were explicit negatives ("does not have a car park", "no dedicated parking").
   - Street restrictions ("double yellow lines", "no parking Mon–Sat") were read as the venue having no parking.
6. **Buggy wording was missed.** "Buggy-friendly", "accessible with a buggy" and "plenty of room for buggies" matched
   nothing.
7. **Qualifiers were lost:**
   - A facility open on some days only was read as a plain yes.
   - A neighbour's toilet was read as this venue's.
   - Blue Badge-only bays were read as general parking.
8. **Pages counted as read when they weren't.** Bot challenges, hollow pages and soft 404s were counted towards a
   venue's "usable pages", which ended the crawl before the real pages were tried.
9. **Non-visitor websites.** Historic England entries and a `Welcome.html` website: speculative guesses were built
   inside the file (`Welcome.html/visit`).
10. **Ranking.** See "stored but not used" above.

## 3. What changed

Every change is in the extractor and discovery code that the worker already runs. Approval rules are unchanged:

- high confidence;
- official source type;
- eligible subject scope;
- a reading under 14 days old;
- a conflict becomes unknown.

The changes, by file:

- **Entity decoding.** `evidence-text-utils.decodeHtmlEntities` is shared by the HTML stripper and the extractor.
  Decimals in quotes are no longer deleted by the selector cleaner, so "2.13m by 1.4m" no longer becomes "2 by 1".
- **`evidence-extractor.js`:**
  - Every anchor occurrence is read, up to six windows.
  - Negation is scoped to the statement (240 characters or fewer, otherwise −60/+100 around the match).
  - Schedule closures ("Closed: Monday") are not read as negation.
  - Day-restricted facilities ("every Saturday", "open Thursday and Sunday", seasonal) stay unknown.
  - "Being refurbished / out of order" negates.
  - Heading-style facility lists are read for café, toilets and parking, with negation, nearby, off-site and
    navigation checks.
  - Own car park, explicit no-car-park and street-restriction rules are added.
  - Blue Badge-only parking stays unknown.
  - A neighbour's facility is excluded through off-site adjacency ("nearest", "walking distance").
- **`pushchair-evidence.js`.** Explicit buggy access ("buggy-friendly", "accessible with a buggy", "plenty of room for
  buggies") is now *good* at high confidence. Fold rules ("must be folded") are *mixed*. An optional buggy park ("if
  you wish to leave your buggy") is no longer a limitation.
- **`html-text-extractor.js`.** Imperva challenge markers are recognised, and `isBotChallengeText` is new. Café and
  food-and-drink links rank in discovery.
- **`evidence-pipeline.js` and `trusted-evidence.js`.** A page only counts as read if it is readable: not a bot
  challenge, and real text after title chrome is stripped. A page whose text is word for word one already read (a soft
  404) is recorded in `duplicatePages` and does not count.
- **`official-source-overrides.js` (new).**
  - Eight parks whose Google website is wrong or missing now point to their operator's page: Clissold, Roundwood,
    Broomfield, Brockwell, Belair, Walpole, Tooting Commons and Boston Manor. Each was reviewed by hand, and the source
    is cited in the file.
  - Historic England register entries are no longer treated as visitor websites.
  - An override also means Place Details is not called to find a website.
- **`source-discovery.js`.** A website that is a document is guessed from its folder.
- **Ranking (`trusted-family-score.ts`, `venue-facts.ts`).** Facility scoring now weights what matters to the family:
  - toilets 1, café 0.6, parking 0.8;
  - free parking 0.3, counted only on top of confirmed parking;
  - baby changing 1.2, only when the youngest child is under four.

  A confirmed yes earns full weight, an unknown half, a confirmed no a fifth. More relevant confirmed evidence now
  ranks a venue higher. Unknown sits exactly in the middle and is never treated as yes or no. The café fact now
  reaches ranking. Venue Detail, Family Fit and the Create a plan journey are visually unchanged. They already show
  confirmed facts as reasons and missing ones as "check before you go", and they now receive more of them.

Not changed: age. The age contract classifier exists, but no producer publishes venue-recommended ages. The replay set
holds one genuine published age (SEA LIFE, "recommended age … 6 and over"). Building a producer for a single example
would be speculative. Editorial suitability remains separate and unaffected.

## 4. Validation on real excerpts

**The replay set.** `familypilot/src/__tests__/fixtures/evidence-replay/` holds real sentences from 88 venues' own
pages: the latest reading of each, exported read-only on 7 Oct 2026, with URL, scope, source type, date and status. The
active and disputed claims for the same venues are stored alongside. `familypilot/scripts/replay-evidence-corpus.cjs`
runs the production extractor and bundle merge over them; use `--detail` for every gained or lost fact with its quote.
"Publishable" means one non-conflicting value at high confidence. The other approval gates are tested where they live.

| Field (88 venues) | Served today | `main` extractor on the same text | This branch |
| --- | ---: | ---: | ---: |
| Baby changing | 23 | 26 | 26 |
| Toilets | 21 | 24 | 31 |
| Café | 5 | 24 | 35 |
| Parking | 25 | 25 | 36 |
| Buggy access | 5 | 4 | 10 |
| Free parking | 12 | 12 | 15 |

The middle column is important: some of the gain needs only a refetch with the extractor already on `main` (see root
cause 1). The rest needs this branch.

- **Venues with three or more of the five core facts:** 9 → 24. **Venues with none:** 39 → 23. Core facts held:
  79 → 138.
- **66 facts gained, each with its quote.** None of them reverses a confirmed value. The two changes of value are
  corrections, each pinned in the test with its reason: Streatham Common parking (yellow lines → its own car park) and
  SEA LIFE buggy access (two of its own pages now agree on *excellent*).
- **3 facts withdrawn on purpose:**
  - Mayow Park toilets (open two days a week);
  - Sydenham Hill Wood toilets (the toilet is in Dulwich Park);
  - Mudchute parking: its pages say both "visitor parking is not available on site" and "a small visitors car park",
    so it is withheld as a conflict.

The fixtures pin what must be recovered, and what must not:

- `evidence-recovery-replay.test.ts` covers 21 recovered statements with their words, the look-alikes that must stay
  unknown, a no-flip check and pinned counts.
- `evidence-recovery-rules.test.ts` covers each rule and its negatives.

## 5. The launch set

These are the 30 destinations nearest Mill Hill. Of the 150 values (30 venues × 5 core fields), **11 are served
today and 31 will be publishable after deploy and refetch**. Twelve of the 30 have no readable text of their own
(blocked, bot-challenged, JavaScript-only or wrong website). No extractor change can help those.
[venue-verification/VERIFICATION_QUEUE.md](venue-verification/VERIFICATION_QUEUE.md) has the venue-by-venue table and
the queue. It includes:

- the email: [venue-email-template.md](venue-verification/venue-email-template.md);
- the answer record: [answers-template.csv](venue-verification/answers-template.csv).

## 6. Getting the rules to the catalogue without a crawl and without Google

Root cause 1 (improved rules never reach stored venues) is fixed on this branch by reading what is already stored,
rather than by fetching it again:

- **Two job modes that never ask Google.** `reextract` re-reads the latest stored reading of each of a venue's pages
  with the current extractor and no network of any kind. `refetch_official` re-crawls the website the catalogue
  already knows. Both run through the ordinary approval pipeline (`reviewEvidence`, `reconcileSourceClaims`,
  `approveDraft`) with every gate unchanged. The API reads the mode from the queue row
  (`automation-store.getAutomationJobMode`), because the edge worker forwards only a `regenerate` boolean.
- **Google is off by construction, not by setting.** `ensurePlaceDetails` takes `googleAccess: 'disabled'` and returns
  the stored row before any request exists. This is independent of `ENRICHMENT_DETAILS_REFRESH_DAYS` and of the budget
  gate's environment flags, which stay as they were. `evidence-reprocess.test.ts` proves it against a control: the same
  stale, websiteless row asks Google on the ordinary path and never on the disabled one, and a whole gather in
  `refetch_official` touches only the known website.
- **Provenance is untouched.** `verifiedBundleForVenue` carries each stored row's `retrievedAt`, scope and fetch status
  through unchanged, so a claim produced by re-extraction is dated from the reading and lapses when that reading would
  have. A page read 15 days ago yields nothing. Nothing in the path writes a date.
- **Idempotent.** An approval that would re-create an identical active claim (same value, source, quote, reading date,
  expiry and approver) is a no-op (`claims-store.createApprovedClaim`). Before this, every re-read superseded and
  re-inserted the same fact: 529 superseded rows behind 183 active ones.
- **Traceable.** Every draft records `model = EXTRACTOR_VERSION` and `source_context.{evidenceMode, extractorVersion,
  googleAccess, jobId}`. A claim's `approved_from_draft_id` therefore says which run and which rules produced it, and a
  withdrawal in the same run is a `disputed` row whose `updated_at` falls in the run.
- **Repeatable after any future extractor change (gate 6).** `EXTRACTOR_VERSION` in `evidence-extractor.js` is bumped
  when the rules change. `select enqueue_reextract_jobs('<version>')` (or `POST ?action=enqueue-reprocess`) queues a
  `reextract` job for every destination whose newest draft was made by an older version and whose stored pages are
  still inside the approval window. It touches the queue only; the every-minute worker does the reading. No crawl is
  triggered by a deploy.

The migration is `familypilot/supabase/migrations/20261007150000_reextract_job_modes.sql`.

**v4 (same day).** Reviewing every claim the v3 production pass created or withdrew found one rule gap: "Accessible car
parking: There are twelve parking spaces for disabled visitors, accessed via Park Street" read as general parking. It
published Tate Britain's parking as `yes` and, on Tate Modern's page, conflicted with the true "There are no parking
facilities at Tate Modern", withdrawing it. v4 treats parking stated *for* disabled or Blue Badge visitors, and an
"Accessible car parking" heading, as restricted parking (unknown), in sentences and in facility lists, while a reserved
subset of a general car park ("108 places including 6 reserved for blue badge holders") keeps the general parking.
`enqueue_reextract_jobs('official-source-rules-v4')` re-reads the stored pages; nothing is fetched.

### Production run

Recorded in section 9 once done. The order is: deploy; `enqueue_venue_enrichment_jobs('reextract', <5 canary ids>)`;
inspect the claims those five produced and withdrew; `enqueue_reextract_jobs('official-source-rules-v3')` for the rest;
then `refetch_official` only for destinations with no eligible stored reading inside the window.

## 7. Staff answers (still a decision)

The claims schema has no source type for a venue's emailed or phoned answer. See the queue document.

## 8. Limitations

- **All results are measured locally.** The replay uses each page's stored text. A live refetch reads today's page,
  which may say more, less or something different.
- **Hampstead Heath** now gets toilets from its own page's section about Golders Hill Park, which is part of the Heath.
  That is correct, but the quote describes one area of a large site.
- **Rules that leave true facts unknown:**
  - Disabled or accessible toilets phrased as "disabled toilets … on site" (Flip Out Watford) are not counted as
    toilets.
  - A facility list that is not introduced by a heading is not read.
  - Both rules were left strict on purpose.
- **Overrides are hand-maintained.** Eight entries, each checked against the council's own site on 7 Oct 2026.
- **Ranking.** The weights are product judgement, not fitted to data. Tests pin the ordering they produce, not the
  numbers.
- **Not inspected on a device here.** The journey was checked through a clean web build (`npm run build:web -- --clear`)
  and the synthetic fixtures, with no provider calls:
  - `verify-dynamic-content`: realistic fixture, 43/43.
  - `verify-product-coherence`: realistic fixture, all passed. It is written for that scenario only: on the sparse
    fixture no venue is confirmed to lack baby changing, so its "ruled out" check cannot hold there.
  - `verify-create-plan-journey`: sparse fixture, 153/153. This verifier is written for unreviewed venues. On the
    realistic fixture, its first venue has reviewed parking, so its one "parking is reported as unconfirmed" check
    does not apply there.

  A build without `--clear` reused Metro's transform cache from an earlier account-QA build. That cache had a
  fixture Supabase URL baked in, so the app opened on sign-in and every verifier failed. Clear the cache before
  running the verifiers.

  Your Step 1 iPhone review is still outstanding and is separate.

## 9. Production results

To be filled in after the deploy and the reprocessing pass, using the section 0 definitions.
