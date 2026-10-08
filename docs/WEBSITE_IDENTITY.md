# Website identity: which stored pages are a venue's own

2026-10-08. Code change plus a dry run against an export of every stored page.

- No page was fetched, no Google request was made, and nothing was written to production.

## The problem

A fact may only come from the venue's own pages (`ELIGIBLE_SCOPES`). Whether a page is "own" was decided once, at
fetch time, from the stored website's path, so three kinds of true facts were withheld.

| Cause | Example | Effect |
| --- | --- | --- |
| A trailing language or front-page segment read as a section | Madame Tussauds' website is `madametussauds.com/london/en/`, its visitor pages are `/london/plan-your-visit/...` | "There is no parking onsite" and "You are unable to bring a buggy into the attraction" withheld |
| The venue's visitor pages live on a second host, or beside the stored page | Crystal Palace Park (trust domain stored, park site is `crystalpalacepark.org.uk`); Dulwich Park (stored website is the map page of the friends' site); Primrose Hill (its own Royal Parks page sits under The Regent's Park's section) | playground, toilets, accessible toilets, parking withheld |
| An operator suffix in the venue's name | "Walthamstow Wetlands, London Wildlife Trust" needed `london`, `wildlife`, `trust` in the URL | the reserve's own page never counted as named |

## The change

All in `server/enrichment/_lib/source-identity.js` and `official-source-overrides.js`.

1. **Trailing segments.** `en`, `en-gb`, `uk`, `home`, `index.*`, `default.*` and `welcome.*` are dropped from the end of a
   stored website before comparison.
   - Only trailing segments, and only these words, so a real section (`/docklands`) is never widened.
2. **Reviewed official roots** (`OFFICIAL_ROOTS`). There are three, each with the stored page that showed it and a
   check that no other catalogue venue sits at or beneath it:
   - Crystal Palace Park → `crystalpalacepark.org.uk/`
   - Dulwich Park → `dulwichparkfriends.org.uk/`
   - Primrose Hill → its Royal Parks page
3. **Primary name.** Name tokens come from the part before a comma, dash or bar.
4. **Rejected rule, kept out deliberately.** "A host that names the venue and carries no other catalogue venue is wholly
   its own" looked right for Dulwich Park.
   - The dry run showed it also claims chain sites (`askitalian.co.uk`, `nandos.co.uk`, `wahaca.co.uk`) for one branch.
   - So whole hosts are only ever granted by review (rule 2).
5. **Provenance and review.** `scripts/rescope-evidence.mjs` re-decides stored rows.
   - It is a dry run by default. A write needs `--write` and `RESCOPE_CONFIRM=yes`.
   - It writes only rows that become eligible, unless `--include-narrowing` is passed.
   - Each written row keeps its old verdict: `subject_scope_reason = "rescoped_2026_10 from <old>: <reason>"`.
6. **Rescoped pages are never auto-approved.**
   - `auto-approve` refuses facts from a rescoped row (`excludeRescoped`), and reconciliation will not let one refresh,
     contradict or withdraw a claim.
   - Their facts still appear in the venue's draft, so a person approves them.
   - Why: the dry run surfaced a venue-hire room's "Dedicated toilet facilities" (Crystal Palace Park) and a "Recent
     posts" teaser (Dulwich Park) among the newly eligible facts.

## Dry run (2,212 stored rows, export of 8 Oct 2026)

| | Rows | Venues |
| --- | ---: | ---: |
| Verdict changes | 102 | |
| Become eligible | 64 | 9 |
| Of those, carrying a high-confidence fact | 28 | 6 |
| Lose eligibility (reported, not written by default) | 35 | 6 |

Of the 35 narrowing rows:

- 33 are Historic England register pages of five parks that already start from their council page
  (`official-source-overrides.js`). They are correctly not visitor pages and back no served claim.
- 2 are Hatfield Park's opening-times page (outside London), which backs two served parking claims.

Narrowing is therefore not written by default. It is a separate decision, because writing it would withdraw those two
claims.

### Newly eligible facts (deduplicated), and my review

| Venue | Fact | Stored words | Read | Review |
| --- | --- | --- | --- | --- |
| Crystal Palace Park | playground yes | "the Dinosaur Playground encourages children to discover..." | 11 Sep | true; reading too old, needs a fresh read |
| Crystal Palace Park | accessible toilet yes | "...seating areas and accessible toilets." | 11 Sep | true; needs a fresh read |
| Crystal Palace Park | toilets yes | "close to: Main public toilets, Changing Places toilet" | 11 Sep | true (the venue-hire "Dedicated toilet facilities" line is not) |
| Dulwich Park | parking yes | "Parking is available inside the College Road entrance..." | 1 Oct | true |
| Dulwich Park | free parking no | "Parking charges will commence from 24th February 2020." | 1 Oct | true |
| Dulwich Park | playground yes | "Dulwich Park Playground has re-opened!" (a "recent posts" teaser) | 1 Oct | true, but the excerpt is weak; prefer a fresh read of a facilities page |
| Madame Tussauds | parking no | "There is no parking onsite but there are numerous car parks near..." | 1 Oct | true |
| Madame Tussauds | buggy access difficult | "You are unable to bring a buggy into the attraction..." | 1 Oct | true |
| Madame Tussauds | baby changing yes | "Please ask a member of staff for the nearest baby changing facilities" | 1 Oct | **reject**: does not say it is on site |
| Madame Tussauds | quiet sessions yes | "Read more about our quiet sessions here." | 1 Oct | true |
| Primrose Hill | playground yes | "Primrose Hill Playground improvement works are now complete" | 7 Oct | true |
| Tooting Commons | playground yes | "...large grass areas, a children's playground..." | Oct | true |
| Walthamstow Wetlands | toilets, accessible toilet, baby changing, café yes | "Facilities: Visitor centre, Bird hides, Toilets, Shop, Cafe/refreshments, Picnic area, Accessible toilet, Baby changing facilities" (the reserve's own page) | 27 Sep | true |
| Walthamstow Wetlands | parking yes, free parking no | "Paid parking is available at the reserve" | 27 Sep | true |
| Walthamstow Wetlands | wheelchair yes | "The Engine House and main concrete pathway ... accessible for wheelchair users" | 27 Sep | true |
| Walthamstow Wetlands | outdoor; quiet sessions | an event page ("outdoor storytelling session") | 27 Sep | **reject** as venue facts (event descriptions) |

**Result:** 17 true facts at 6 venues; 4 rejected.

- **Destinations with at least one displayed fact:** +5 (Crystal Palace Park, Madame Tussauds, Primrose Hill, Tooting
  Commons, Walthamstow Wetlands).
- **Improved:** Dulwich Park gains parking.
- The audit's estimate for this route was 13 venues and 17 facts. The facts match; the venue count is lower because
  several of the audit's "true facts withheld" were scope problems this rule set correctly leaves alone:
  - London Museum Docklands: the all-sites families page;
  - the V&A sites: the step-free line read as buggy access;
  - Mayow Park and Mudchute: withdrawn by reconciliation, not by scope.
  The last two are extraction cases (see the extraction pilot).

## What applying it needs (your approval)

1. Merge this PR.
2. Pause the enrichment cron, then run `RESCOPE_CONFIRM=yes node scripts/rescope-evidence.mjs --write`. This writes 64
   rows' scope and nothing else.
3. Run `reextract` for the 9 venues. Their drafts will carry the facts above, and none can be auto-approved.
4. A person approves the 17 true facts in the internal review screen and declines the 4 rejected ones.

**Timing.** Auto-eligible readings must be under 14 days old.

- Crystal Palace Park's stored readings are from 11 September, so its facts need one `refetch_official` read of the
  park's own site first (no Google).
- The others were read between 27 September and 7 October, so a review in the next week can use them as stored.
