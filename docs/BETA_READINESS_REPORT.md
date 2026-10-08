# Private beta readiness: 20 to 30 London families

Written 2026-10-07 from code on main plus four open PRs (#168 to #171), read-only database queries and a local browser
fixture. **I have not used the app on a phone, and the production host cannot be reached from this environment.** Where a
claim rests on the fixture or on code I say so.

## Verdict

**Ready with limitations, conditional on three things you control:** merge #168 and #169 (without them the product still
penalises places over a travel limit nobody set, and rates a place differently with the weather), switch off or hard-cap photographs at Google, and confirm the production account and Google configuration (I cannot read Vercel from here). Without those it is
**Not ready**. With them, the honest description of the beta is: *London-wide in intent, thin in coverage; recommendations
are practical rather than activity-specific; no prices yet.*

## Where each area stands

| Area | Status | Evidence |
| --- | --- | --- |
| **Family Match correctness** | Fixed in #168 and #169 (not yet merged). Fit no longer moves with weather, opening state or closing time (0% change across 6,040 pairs, was 7% of verdicts and 56% of scores). No false 30 minute limit (2,280 of 6,040 pairs carried a "too far" caution; Poor fell 864 to 24). | tests 2,825 / 2,835; `STABLE_FAMILY_FIT.md`; `HIDDEN_DEFAULTS_AND_PROFILE_FIELDS.md` |
| **Fit is about the activity?** | **Weak, and cannot improve without data.** 0 of 151 venues carry a published age range, so every Good (352) and Excellent (10) match is logistics-only for children old enough to take part. The sentences are honest (Looks promising, never "Good for Sloane" without evidence) but not much more informative than a facilities list. | `STABLE_FAMILY_FIT.md` section "Excellent" (decision needed) |
| **Performance** | Venue Detail now needs only its detail request: 0.28 s with a 4 s feedback read or a 9 s forecast (was 3.1 s and 1.6 s). Home no longer fetches a forecast. Simulated latencies on a local fixture; production not measured. | `verify-venue-detail-loading.mjs` |
| **Personalisation / onboarding** | Four screens plus an optional routines step for babies and toddlers, both optional steps read "Skip for now"; nothing optional is invented; car, equipment and memberships hidden until used. Existing devices migrate once (30 / "moderate" read as unset). | #169; onboarding verifier passes |
| **Pricing** | **Nothing to show.** 0 of 168 venues have a price; honest "Price not confirmed" with a link to the venue's site; Explore price filters hidden (they could only empty the list). Calculator and rules built and tested (#171). Reliable data needs a reviewed extraction (staged plan). | `PRICING_COVERAGE_AUDIT.md` |
| **Catalogue** | 151 destinations in London, **57 fully usable** (reviewed with website, photo and hours). Missing categories (playgrounds, swimming/leisure, libraries, nature). Thin: outer south (1), outer east (2), south of the river centre (6). Duplicates: one three-listing cluster. | `CATALOGUE_COVERAGE_AUDIT.md`; Phase B proposal awaits approval |
| **Connected Families** | Reachable from Home and Explore by a labelled action (#170); accepted and pending told apart; same consent and privacy as before. Verified in the auth-enabled fixture, **not in production** (production Supabase client config unverified from here). | `FAMILIES_ACTION.md`; 69 auth-journey checks |
| **Spend** | Production Google is on. Photographs dominate: 339 requests on 7 October (about 170 photographs; each is two Google requests). **The usage table does not explain the reported £100 charge, so it is a lower bound.** The application cap is a best-effort guard, not a hard global cap, and the photo endpoint is public; only a Google Cloud quota is a hard cap and none is verified. Recommendation: switch new paid photograph calls off until one is. Two active database cron jobs can call Google. | `GOOGLE_PHOTO_SPEND_VERIFICATION.md`, `PROVIDER_SPEND_AUDIT.md` |
| **Product quality** | Two broken interactions found and fixed (price filters returning nothing; filter copy saying the profile default was 30 minutes). Others fixed: "today's weather" copy, closed-today hiding places, hidden restaurant "Any" limit, plan sheet remembering a suggested time as a choice. | PR descriptions |

## The nine questions, for a parent

| Question | Answer today |
| --- | --- |
| Can I set up quickly? | Yes after #169: name and area, household (skippable), children's birthdays, how they get around. |
| Do I find relevant places across London? | Only where the catalogue is dense. A family in the thin outer areas will see few. |
| Does it tell activity from logistics? | It never claims the activity suits a child without evidence; but there is no evidence yet, so it mostly says "practical". |
| Are unknowns shown honestly? | Yes ("Price not confirmed", "we haven't yet confirmed whether this activity suits...", parent reports labelled). |
| Are costs clear? | Not available. Clear that it is not available. |
| Does it avoid restrictions I never chose? | After #169, yes. Before, no. |
| Can I connect another family? | Yes, findable from Home and Explore (#170), if production accounts are configured. |
| Are plans realistic? | The planner works for a chosen date and time with routines, journeys and opening hours; no costs in plans yet. |
| Can I change preferences easily? | Yes: Edit Profile, with No limit / No preference chips. |

## Prioritised blockers to inviting the families

1. **Merge #168 and #169, in either order** (adjacent-line conflicts in three files; I will resolve on request). *You.*
2. **Photo spend.** Switch new paid photograph calls off now; re-enable only after a Google Cloud daily quota (suggest 200
   new photographs a day, about $35 to $52 a month) is set and checked, and the unexplained £100 is reconciled against Google's
   SKU report (`GOOGLE_PHOTO_SPEND_VERIFICATION.md`, exact steps in section 8). *You.*
3. **Verify production configuration** (I cannot): Supabase client keys in the production build
   (`node familypilot/scripts/verify-client-config.mjs <url>`), and the Vercel caps. *You.*
4. **Choose beta households in dense areas, or approve the catalogue pilot** (Phase B, 60 to 80 places from open datasets,
   £0). Without one of these, an outer-south or outer-east family will have a poor first session. *You.*
5. **A real-device pass** of the journey below. Nothing I verified ran on a phone. *You.*
6. **Decide the "Excellent" rule** (proposal and measured impact in `STABLE_FAMILY_FIT.md`). It changes what the top badge
   means; until decided it is reachable on logistics alone. *You.*
7. Not blockers, but say them to the families: no prices yet; fit is practical, not yet activity-specific.

## iPhone test list (what I could not do)

Fresh install: onboarding to Home in under two minutes; Home shows places beyond 30 minutes with no "over your limit"; tap a
card: Venue Detail shows the name and photograph at once and the rest within a second or two; "Closed today" appears on a shut
place without changing its position; the "Families" pill on Home and Explore, at the smallest and largest iPhone you have, and
with the larger text setting on; Families screen: add a family, create an invite, accept it on a second phone, see Connected
and Waiting; Create a plan with the connected family; Edit Profile: set and clear the journey limit and budget; relaunch and
confirm nothing reverts; rotate and background the app mid-load.

## What this programme did not do

No merges, no bulk import, no Google call, no change to quotas or settings, no database write. Open PRs: #168 (stable fit,
non-blocking feedback), #169 (defaults, onboarding, profile), #170 (Families), #171 (pricing foundation); audits in the docs PR.
