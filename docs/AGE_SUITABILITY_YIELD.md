# Age suitability: what the stored official pages can actually supply

Measured on 7 Oct 2026 against production, read-only. Nothing was fetched, written or published. This extends the 5 Oct
audit in [AGE_EVIDENCE_CONTRACT.md](AGE_EVIDENCE_CONTRACT.md) to the current corpus, after the evidence-recovery
re-reads, and answers one question: **is there enough explicit activity-age evidence on pages we already hold to justify
building an age producer?**

**No.** One destination in 151 has a sentence that reads as a recommended age for the venue as a whole, and on
inspection that sentence is not safe to publish (see "SEA LIFE" below), so the confirmed yield is **zero**. Nothing was
built to extract ages. The classifier that any future producer would have to pass was found to accept non-age numbers,
and was hardened.

## What counts

Valid: an operator statement that the activity itself suits an age, such as "recommended for ages 3–8", "suitable for
children aged 5+", or "the recommended age of the attraction is children aged 6 and over".

Never evidence, however age-shaped: ticket and admission bands, "under 3s free", family-ticket and membership
definitions, height limits, school and group information, supervision rules, events and sessions, "for all ages" and
"family friendly", and the mere existence of a children's facility. Nothing is inferred from category.

## Denominator

| | Venues |
| --- | ---: |
| Destinations in the catalogue (restaurants and cafés excluded) | 151 |
| with any readable stored page | 108 |
| with a readable page of their own (the only pages a claim can come from) | **100** |

Those 100 hold 293 own-scope pages, every venue read within the 14-day approval window. The other 51 destinations are
bot-blocked, script-only, failed or have no website, so no rule can reach them.

## Method

1. A deliberately loose scan of the latest reading of every own-scope page for anything age-shaped: `age(d) N`, `N–M
   years`, `N+`, `under/over/up to N`, and "suitable / recommended / ideal / designed for …". It returned **212 distinct
   snippets across 54 venues**. Loose on purpose: a rule that misses a form is invisible to a negative result.
2. A second, targeted scan for plain-word suitability with no number ("great for toddlers", "children of all ages").
3. Every snippet read by hand and classified, then run through the existing contract classifier
   (`server/enrichment/_lib/age-evidence.js`) to confirm the two agree.

## Result

| What the page says | Venues | Counts as the venue's recommended age? |
| --- | ---: | --- |
| Sentence that reads as a recommended age for the venue as a whole | **1** | **Not accepted.** SEA LIFE London: "the recommended age of the attraction is children aged 6 and over". Its own site contradicts it, and it sits in a ticket-price note |
| Explicit age range for one part: a playground or play equipment | 2 | No. Shown for that part only. Battersea Park (4–14), Burgess Park (up to 14) |
| Explicit range for one soft-play area, stated in months | 1 | No. Belmont Children's Farm, "6 months to 10 years", which the contract cannot represent in years |
| Explicit range for a session, class, walk, event or package | 9 | No. William Morris Gallery, Flip Out (Brent Cross, Watford, Canary Wharf), Colne Valley, Discover Children's Story Centre, Chiswick House, Beckenham Place Park (junior parkrun), National Maritime Museum (a sensory session) |
| Plain-word audience, no age | 2 | No. Flip Out Watford ("great for young children", "perfect for toddlers"), Babylon Park ("soft play areas for toddlers and kids") |
| Supervision or admission rule for an age | 10 | No. A real, useful fact, but not who the place suits. Kentish Town City Farm, RAF Museum, Paradox Museum, London Eye, Woodside Animal Farm, Flip Out (Brent Cross, Canary Wharf), Diana Memorial Playground, SEA LIFE, Headstone Manor |
| Ticket, free-entry, membership, height, group or school wording | the remainder of the 54 | No |

A venue can appear in more than one row (SEA LIFE has a recommended age and a supervision rule; Flip Out Watford has a
session range and a plain-word audience).

**Realistic recoverable coverage: 0 confirmed venues in 151, from 1 candidate in the 100 whose pages we can read.** Counting every
explicit range for a part or a session as if it described the venue, the ceiling is 13 venues (9% of 151), and doing
that would be wrong: a soft-play range is not a farm's range, and a rule that applied it to the whole place would mark
a visit to the farm as "outside the recommended ages" for a ten-year-old.

## Decision

- **No age extractor, no new claim shape, no re-extraction.** One venue does not justify a producer, an approval path
  and a re-read of the catalogue, and the venues with ranges mostly state them for a session or a part.
- **SEA LIFE's "6 and over" is not published and no data was changed.** If a person later wants an age on that venue,
  `minRecommendedAge` and `maxRecommendedAge` are already claim fields with an editor-approved path, but the live page and
  the venue's other pages would first have to be read together by that person (see below).
- **The wording is the fix.** Every recommendation is unaffected by missing ages in data, so the change that matters is
  to stop presenting logistics as activity fit and to say plainly that the age is unconfirmed (see the semantic contract
  in `family-match.ts`).
- **What would change the answer:** crawling activity, "plan your visit" and family pages the discovery step does not
  pick today (new fetching), or an operator-level age page for chains such as Merlin. Neither is cheap, and neither is
  assumed here.

## SEA LIFE London: why "6 and over" is left unknown

Inspected from the stored original page (`https://www.visitsealife.com/london/plan-your-visit/information/faqs/`, read
1 Oct 2026, scope `venue_own_subtree`) and the venue's other stored pages. The live site cannot be reached from the
sandbox and was not bypassed.

1. **The sentence is explicit about "the attraction"**: "Please note, children under the age of 2\* go free but the
   recommended age of the attraction is children aged 6 and over." Read alone it would qualify.
2. **Its context is a ticket-price note, not a statement of who the aquarium is for.** It opens "Please note", carries an
   asterisk on the free-entry age, and sits beside the under-2s-go-free rule and "effective from 20 July 2023". The stored
   text is flattened, so the question it answers is not recoverable; the surrounding wording points to child pricing.
3. **The same site says the opposite.** The aquarium's own Accessibility Guide (stored, same scope): "SEA LIFE London Aquarium
   is suitable all children of all ages." Its home page: "entertain and educate visitors of all ages." A search summary of the
   venue's help centre (not read directly, so unverified) reports a third audience, "families with children aged 4 to 10".
4. **The venue's own pages invite babies**: under-2s are admitted free, baby changing is in every toilet, buggies are
   welcome throughout.

Two official statements about the same venue disagree (6 and over versus all ages), and the one that qualifies is
tucked into a pricing note. The evidence rules everywhere else in this codebase say a conflict becomes unknown, and that
is applied here: **age suitability for SEA LIFE stays unknown.** Nothing is written to production. A producer built later
must also compare statements across a venue's pages before accepting any, not only classify one sentence at a time.

## Safety findings, fixed

The contract is the gate any future producer must pass, and nothing wires it to publication. Checking it against the
corpus showed it would have accepted all of these as recommended ranges. Each is now rejected and pinned in
`age-evidence-contract.test.ts`:

| Sentence | Was read as | Now |
| --- | --- | --- |
| "Best for a visit of 2 to 3 hours" | ages 2–3 | rejected, a duration |
| "Recommended for 4 people per table" | age 4 | rejected, a head count |
| "Ideal for groups of 10 to 20" | ages 10–20 | rejected, no age marker |
| "Suitable for riders over 1.2m" | age 1 | rejected, a height |
| "Designed for guests 90cm to 140cm tall" | age 90 | rejected, a height |
| "Family ticket: recommended for 2 adults and 2 children aged 3-15" | age 2 | rejected, a ticket definition |
| "Our school workshops are suitable for children aged 5 to 11" | ages 5–11 | rejected, a school programme |
| "Recommended for adults aged 18 and over" | age 18 | rejected, an adult audience |
| "…accommodates children from 6 months to 10 years" (a play area) | up to age 6 | rejected: months are not rounded into years |
| "Under 3s free. Recommended for children 3 and over to pay the child price" | age 3 | rejected, a price rule |

The extractor the worker actually runs emits no age field for any age-adjacent sentence, which a test now pins.

## Reproduce

The scans are read-only SQL over `venue_source_evidence` joined to `place_records` (latest reading per page, fetch
status `ok`, `cached` or `fetched_truncated`, own-scope subject, at least 200 characters of text), matching the
patterns above. The classification is in `age-evidence-contract.test.ts` and `evidence-recovery-rules.test.ts`.
