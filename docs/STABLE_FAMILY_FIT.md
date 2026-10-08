# Stable Family Fit

Whether a place suits a family does not depend on the day it is read. This note records the rule, every path that used to
break it, what the change did to real numbers, the Excellent-rule proposal (not applied), and the parent-feedback change.

## The rule

> **Family Fit is about the family and the place.** Today's weather, whether the place is open, and how soon it closes are
> *conditions of a day*. They are shown beside the fit, never inside it. They do not rate, rank, caution against or hide a
> place. Once there is a plan for a chosen date, the planner decides what they mean for that date.

Two fields carry the day, and nothing else does: `FamilyMatchResult.today` / `availableToday` (opening state, for "Closed
today · opens tomorrow 10am" on cards and the Today card) and the weather line on the Today card (`day-conditions.ts`).

The one thing that stays a breach is hours that say a place is **never** open to visitors. That is a fact about the place.

## Audit: every path where today leaked into the fit

| # | Path | Was | Now |
| - | --- | --- | --- |
| 1 | `family-match.ts` open-today reason | counted as a positive toward Good / Excellent | removed |
| 2 | `family-match.ts` closing-soon | soft caution that capped a place at *possible* (7.02% of verdicts on the catalogue) | removed from the fit; the Today card still says "Closing soon" |
| 3 | `family-match.ts` shut-today | `+1` positive hack to cancel #1, headline ", but not today" | hack and suffix removed; nothing to cancel |
| 4 | `family-match.ts` weather | reasons ("Indoors, so rain won't spoil it", "…good for it today") counted as venue facts; "rain is forecast" soft caution | removed; `weather` is no longer an input to `evaluateFamilyMatch` |
| 5 | `family-score.ts` `weatherFit` | a tenth of the numeric score; static fallbacks by category when there was no forecast; "Good for today's weather" reason | factor, weight, fallbacks and reason deleted (`FamilyScoreFactors.weatherFit` removed; stored data with the old field is ignored) |
| 6 | `trusted-family-score.ts` | `scoreTrustedWeatherFit`, forecast-dependent environment reasons | deleted; environment is stated as a fact about the place ("Outdoor environment confirmed") |
| 7 | `isVisitableVenue` filter on Home, Explore, Halfway | hid every place shut for the whole day (a Tuesday-shut farm vanished on Tuesday) | `isListableVenue`: only never-open places are left out |
| 8 | Home / Explore / Halfway list loading | each fetched the forecast and waited up to 2.5 s for it before ranking | no forecast is requested for lists at all |
| 9 | `proactive-day-request.ts` | indoor/outdoor preference from the forecast; energy preference from the hour of day | both removed; request is profile-only |
| 10 | `personalise-venues.ts` copy | "Based on …, today's weather, and …" | "Based on …'s ages and …" |
| 11 | Card line (`matchCardReason`) | appended "Open until 5pm" etc. to good matches | the card line is about the family; "Closed today" is added separately by `withClosedLine` |
| 12 | Explore "Open now" filter (`filter-venues.ts`) | n/a | **kept**: an explicit filter the parent chose, not a hidden input |
| 13 | `focused-recommendations.ts` | filters by the provider's open-now flag | **dormant**: no screen calls it (`useFocusedRecommendations` has no caller). Recorded, not changed |

Not touched on purpose: the planner (`day-plan.ts`, `sequencer.ts`, `plan-draft.ts`) reads opening hours for a *chosen*
date, which is exactly where date-specific feasibility belongs.

## Measured impact

Harness: `familypilot/scripts/measure-fit-impact.test.ts.txt` (copy to `src/__tests__/` to run; it is not part of the suite).
Catalogue: the 151 stored destinations (80 reviewed). Eight London homes (N1, E17, SW4, W5, SE10, NW7, BR1, HA1) × five
family compositions (baby + toddler, toddler, school-age, baby, two children) = 40 household/home pairs, 6,040 venue
pairs per condition. Everything is run through the real `personaliseVenue`. The 30-minute drive default is used as in
production today (see the hidden-defaults work, PR A).

Condition → share of the 6,040 pairs whose result changed **relative to a normal open morning**:

| Condition | main (`b9e4186`): verdict | main: score | main: top-10 overlap | this branch: verdict | score | top-10 overlap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| sunny | 0.38% | 57.19% | 0.609 | **0%** | **0%** | **1.000** |
| rain | 0.65% | 55.71% | 0.568 | **0%** | **0%** | **1.000** |
| closing soon | **7.02%** | 0% | 1.000 | **0%** | **0%** | **1.000** |
| finished for the day | 0% | 0% | 1.000 | 0% | 0% | 1.000 |
| shut all day | 0% | 0% | 1.000 | 0% | 0% | 1.000 |

On main, the forecast reordered more than half of every household's top ten (overlap 0.57–0.61), and an evening visit
pushed every Good and Excellent match down to Possible. Both are gone.

**The cost, stated plainly.** Removing "open today" and the weather lines also removes points that were never about the
family, so the absolute verdict mix moves on a normal open morning (the base condition, hours open every day):

| Verdict | main | this branch |
| --- | ---: | ---: |
| Excellent | 25 | 10 |
| Good | 399 | 352 |
| Possible | 2,187 | 2,249 |
| Poor | 864 | 864 |
| Not reviewed | 2,565 | 2,565 |

62 more pairs read Possible rather than Good/Excellent. Those places were reaching Good on a logistics point ("open
today") plus facilities, which is the failure the Excellent proposal below is about. The ranking is almost unchanged
without the forecast: top-10 overlap between main and this branch on the base condition is **0.962** (minimum 0.90 over
the 40 pairs), i.e. what people see at the top of Home is stable; only the labels are more cautious.

## Proposal (NOT applied): what should earn "Excellent"

Today `excellent` needs score ≥ 85, ≥ 4 positives, ≥ 2 facts about the venue, no soft unknowns. "Facts about the venue"
are toilets, baby changing, parking, café and buggy access, which are *visit logistics*. So an Excellent match can be
earned without any evidence that the activity suits the child.

**Measured on the catalogue** (same 6,040 pairs, base condition, this branch):

- 0 of 151 stored destinations carry a published recommended age range. Every Good (352) and every Excellent (10) match is
  therefore logistics-only for the children old enough to take part.
- Of the 10 Excellent pairs: 4 are households whose only child is under 12 months (by the convention below); 6 are
  households with a toddler.

**Proposed rule.** `excellent` additionally requires that every child of 12 months or more is *confirmed for the activity*
(`ChildLens.basis === 'activity'`: the venue's own published recommended ages include them). Nothing is inferred from
category, admission bands, "family friendly" or children's facilities, and no age is invented.

**Measured effect of the proposal:** 6 of 10 Excellent pairs become Good (all the toddler households); the 4 under-12-month
pairs stay Excellent. With zero venues carrying an age range today, Excellent would be unreachable for any household with
a child of 12 months or more until activity-age evidence grows, and reachable for under-12-month households on logistics
alone, which is the loophole this is meant to close.

**Recommendation.** Apply the rule, **and** give infants the same requirement for Excellent only (the 12-month convention
stays for the *gap line*, not for the top badge). The honest consequence is that nobody sees "Excellent" in the beta
until venues have age evidence, and "Good" remains the top badge. That is a defensible launch position ("we say Excellent
only when the place itself says it suits your child"), but it is a ranking-semantics change, so it needs your decision.

## Under-12-month convention (verified, unchanged)

`LOGISTICS_LED_BELOW_MONTHS = 12` is the only definition, in `family-match.ts`, documented in
`FIT_ACTIVITY_VS_LOGISTICS.md`. It decides one thing: whether the "we haven't yet confirmed whether this activity suits X"
line is raised for a child whose only confirmed facts are practical. It cannot create an activity claim: tests assert a
baby with only logistics gets no `Good for Ozzie`, no activity-basis lens, no age wording, and a 13-month-old with the same
facts does get the line (`stable-fit.test.ts`).

## Parent feedback no longer blocks Venue Detail

See `VENUE_DETAIL_LOADING.md` for the mechanism, the measurements, the risk taken and the safest alternative. In short:
`getById` waits for the detail alone; parent reports are read after the real detail is on screen and applied in place;
reports can only lower a verdict, a single report never reaches Family Fit, corroborated reports are labelled
"parent-reported, not confirmed by the venue"; planning does not read them.

### A contradicted fact is not shown as confirmed first (follow-up)

The risk taken above was real: for a venue with a recent report that contradicts a fact, the page drew the venue's own fact
as confirmed (a tick, maybe a higher badge) and up to three seconds later corrected it. **No parent report exists yet**
(`venue_visit_reports`: 0 active rows), so this is about the first one, and the fix is proportionate:

- **The server says whether a correction is possible.** The detail response carries `hasRecentParentReports` (true, false or
  null for "could not tell"): one head-only count of active reports in the last 90 days, run beside the metadata read and
  bounded to 400 ms (`venueHasRecentReports`). It cannot fail or slow the detail beyond that bound; an error is `null`, never
  `false`.
- **Only when it is true**, Family Fit (the badge beside the name and the card) shows a neutral **"Checking recent parent
  reports"** state until the reports arrive: no verdict, no tick, no star, no fact, the height of the card it becomes
  (minimum 330 pt; the worst card in the fixture is 154 pt taller, measured), a direct swap. It is bounded by the reports read's own three second ceiling; after that, or on a failure,
  the venue's own facts are shown exactly as before.
- **Everywhere else nothing changes**: with `false`, `null` or no flag (every venue today, an older cached payload) the page
  draws at once and a report that still arrives corrects it as before. The page, the photograph, the name and every other
  block are never held: only the Family Fit block waits, only for venues with reports.
- **Alternatives considered.** Hold the whole Family Fit block for every venue until reports arrive: puts a wait on every page
  to guard against a case that does not exist yet. Annotate each fact "from the venue's own information": true but it still
  shows a tick that may be withdrawn. Wait for reports on the server before replying: reintroduces the delay this change removed.
- **Residual window, stated.** The flag travels with the detail, which the CDN holds for 5 minutes (plus 10 of stale-while-
  revalidate) and the device for 30. A venue's very first report can therefore still be shown the old way, once, for up to
  about 45 minutes. Cards on Home and Explore deliberately use the venue's own facts only, so a card can still read "Good"
  where the page, after a report, reads "Possible".
- **Verified in a browser** (fixture, simulated latencies, an injected contradicting report): `verify-parent-report-
  consistency.mjs`. A: the contradicted fact is never shown as confirmed and the state swaps directly; B: the ceiling holds at
  3 s with a 5 s read; C: a failing read ends it; D and E: nothing shows without the flag and the page is not held.

## Tests

- `stable-fit.test.ts` (new): the whole fit — order, scores, verdicts, headlines, reasons, cautions, to-check lines, card
  lines — is deep-equal across an open morning, closing soon, finished for the day, shut all day and a different day;
  nothing a parent reads about the fit mentions today, hours or weather; shut places stay listed at the same position;
  never-open places are still excluded; parent-report semantics; wiring of the non-blocking path; the 12-month convention.
- `parent-report-consistency.test.ts` (new, 11): the flag (true / false / null on error, no count, no database and a slow
  read; head-only; 90 days), its place in the detail response, when "checking" shows and when it never does, the bound, and
  that the neutral state draws no verdict or fact.
- `closed-today.test.ts`, `card-closed-status.test.ts`, `family-match.test.ts`, `trusted-family-score.test.ts`,
  `proactive-day-request.test.ts`, `home-loading.test.ts`, `soft-deadline.test.ts`: rewritten to the new contract.
