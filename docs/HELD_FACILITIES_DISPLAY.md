# Showing the playground, accessible toilet and wheelchair facts we already hold

2026-10-08. Code only.

- No data was written, no page fetched, no Google request made.
- The coverage counts are read-only queries against production claims.

## What was wrong

The server serves `familyFacilities.playground`, `accessibility.accessibleToilet` and
`accessibility.wheelchairAccessible` from approved claims, but no screen drew them:

- Family essentials had no rows for them.
- Family Fit read none of them, and told every family with a wheelchair user "Step-free and wheelchair access still to
  be checked", even where the venue had answered.
- Explore could not filter on them.

## What changes

| Surface | Change | What it never does |
| --- | --- | --- |
| Venue Detail, Family essentials | New rows: **Wheelchair access** (Accessible / Not accessible), **Accessible toilet** (On site / None on site), **Playground** (On site / None on site; "On site, ages not stated" where the venue states no ages) | infer any of them from buggy access, toilets or the category; a reviewed "no" is shown, never hidden as unknown |
| Venue Detail, the unknown line | Wheelchair access and accessible toilet are listed as still to confirm only for a family with a child who uses a wheelchair or mobility aid; playground only for a family that said they need one | lengthen the line for everyone else |
| Family Fit | For a child who uses a wheelchair or mobility aid: venue says yes → a logistics reason ("Wheelchair accessible, the venue says, for Quillon"), plus the accessible toilet if confirmed; says no → a concern; unknown → still to check, as before | read buggy access as wheelchair access; treat an accessible toilet alone as wheelchair access |
| Family Fit, must-haves | "Playground" as a must-have is answered by the claim: yes, no or still to check | — |
| Family Fit, everyone else | **Nothing.** A playground adds no reason, no named child and no change of verdict | count a playground as activity suitability (it has no ages); see `EXCELLENT_ELIGIBILITY.md` |
| Explore filters | "Playground" and "Wheelchair accessible", confirmed places only | match an unknown |
| Home | Nothing new on the card. Home's ranking changes only for the two families above | — |

## Coverage, 134 London destinations (production claims, 8 Oct 2026)

Counted the way the app serves them:

- active claims, in life, not legacy auto-approved, not disputed;
- venue not in `ai_draft`.

| | Before | After this PR |
| --- | ---: | ---: |
| Destinations showing at least one confirmed fact on Venue Detail | **55** | **68** |
| Displayed confirmed facts | 116 | 185 |
| Newly displayed | | playground 30, accessible toilet 29, wheelchair yes 9, wheelchair no 1 (Hyde Park Corner) |
| Destinations whose page read "Not confirmed yet" for everything and now shows a fact | | 13 (e.g. Diana Memorial Playground, Brockwell Park, Kensington Gardens, Battersea Park) |

This is the audit's route 1 exactly: 55 venues improved, 69 facts. The rest of the projected rise to 82 needs the
website-identity and extraction work, both of which change production data and need approval.

### Two things these numbers depend on

1. **63 of the 134 destinations are `ai_draft`.** Nothing about them is served, whatever their claims say: their latest
   draft was never approved.
2. **185 of the 248 served claims expire on 31 October 2026** (59 venues). They are 30-day facility claims from readings
   at the start of October, and no refresh has run since 5 October.
   - Without a `refetch_official` pass (the venue's own site, no Google), most of what this PR shows disappears again
     in three weeks.

## Verification

- **Unit tests:** `held-facilities.test.ts` (14).
  - projection;
  - rows yes/no/unknown;
  - nothing inferred from buggy, toilets or category;
  - the Diana case;
  - a playground changes no verdict, reason or named child;
  - the playground must-have;
  - wheelchair yes/no/unknown for a mobility-aid child;
  - buggy access never stands in;
  - families without a mobility aid hear nothing;
  - the Explore filters.
- **Updated:** `family-essentials.test.ts`. Full suite: 2,884 passed.
- **Browser:** `scripts/verify-held-facilities.mjs` (fixture, zero spend, every provider host aborted), 34 checks at
  360, 393 and 430. Two new detail-only fixture venues: "Playground Only Park" and "Access Facts Museum".
- **Regression, on this branch's build:** product-coherence, home-fit (36/36), explore-clearance, venue-detail-loading,
  parent-report-consistency, onboarding-flow all pass.
- **Not run here:** families-action, which arrives with #170.
