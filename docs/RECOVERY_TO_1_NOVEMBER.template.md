# Recovery before 1 November: the plan, the dates, and the fallbacks

14 October 2026. Written so that nothing here needs a decision from you until the first batch is ready for your review. **Nothing has been imported, migrated, deployed or paid for.** No Google request has been made.

## Why there is a date

Every stored Google row is hidden from Explore and Meet halfway 30 days after it was fetched (`MAX_AGE_DAYS`). 105 of the 149 rows were fetched on 8 and 9 October, so **from 7 and 8 November the app serves almost nothing** unless the venues come from somewhere else. 1 November is the last day to choose a fallback and still have a week to carry it out.

## What is built and tested

| Piece | State |
|---|---|
| Independent-identity reader (#208, merged, inert) | Registry files empty; nothing served |
| Two more sources the reader accepts: OS Open Greenspace (OGL) and Wikidata (CC0), each in its own file, with credit and map rules | On `feat/open-licence-sources`, tested; not in a pull request |
| Batch selector and the review pack (`REVIEW.md`, a sample of 20, exceptions, coverage) | Built, tested, run on the real extract |
| `apply-review`: your name onto the entries, into the registry, nothing written without `--write`, no OpenStreetMap entry without `--odbl-cleared` | Built, tested |
| Simulation of the days around 8 November with the real reader | Built, run (below) |
| Licence notices on the About screen | Built, tested; same branch |
| Opening-hours speed fix | On `perf/opening-hours-formatters`; the first card at 3,309 entries went from 16.2 s to 4.9 s on a phone-class profile |
| Paged catalogue read | On `feat/explore-paged`; not used by the app until after your iPhone review |

## What the first batch gives

{COVERAGE}

## What Explore would serve, day by day

{SCENARIOS}

Reading the table: **S0** is what happens if nothing is done. **S1** is tranche A alone, with each category switched to the independent files only where they have at least as many venues as Google had. **S2** adds the OpenStreetMap tranche. **S3** and **S4** add the one-off Google refresh (below). S3 and S4 drop on 7 December because a refresh buys 30 days once.

## The dates

| Date | What | Who |
|---|---|---|
| Now | Review pack ready: `docs/recovery-batches/2026-10-14/REVIEW.md` (sample of 20, exceptions, coverage) | you |
| Within a day of your decision | I apply your review to a branch with your name (`apply-review`), run the full suite and the phone-profile measurement, and open the pull requests you ask for. I merge and deploy nothing | me |
| By about 20 October | You merge tranche A and the speed fix. Entries are served only where no fresh Google row covers them, so this is safe to do early | you |
| By about 27 October | **Decision point for the OpenStreetMap tranche:** the ODbL build steps (the About notice is built; a licence file beside `osm.json` remains) and the two judgments in [ODBL_ASSESSMENT.md](ODBL_ASSESSMENT.md), optionally with the OSMF's answer | you |
| By about 29 October | Category switch for the categories where the independent files are at least as large as Google's. Registry and `cutover.json` change in one release | you and me |
| **1 November** | If a compliant route is still blocked, the fallback choice below | you |
| 7 and 8 November | The 79 rows of 9 October and the 26 of 8 October leave the catalogue | |

## If a compliant route is still blocked on 1 November: your choices

| Choice | Venues served on 8 Nov | Cost | What it is |
|---|---:|---|---|
| **Tranche A only** | {S1_1108} | Nothing | Compliant today: no ODbL, no Google. Loses soft play, farms and activities |
| **Tranche A and B** | {S2_1108} | Nothing | Needs the ODbL steps done; the largest and most useful set |
| **One-off Google refresh, once, 7 November** | 147 until 6 December, then 0 | **US$2.98 to US$3.73** (149 Place Details requests, no photographs) | Buys 30 days. List-only (never on the map). **Not compliant on its own:** it stores Google names and addresses again, which the Maps terms do not allow even for 30 days ([GOOGLE_RETENTION_AUDIT.md](GOOGLE_RETENTION_AUDIT.md)). Needs your written approval, a restricted key, a quota of 160 and a US$5 budget alert |
| **Tranche A plus the refresh** | 226 until 6 December | US$2.98 to US$3.73 | Keeps soft play, farms and activities for 30 more days while B is cleared |
| **Do nothing** | 0 | Nothing | The app shows no venues from 8 November |

The cost is exact for the request count: 149 requests at the Enterprise Place Details rate. Google's price list gives US$20 per 1,000 and our cost notes use US$25, so US$2.98 to US$3.73; Google's monthly free allowance may make it US$0. I could not read the current price list from this environment, so budget the upper figure. September's bill was £104.11, caused by CI, not by this; the refresh is 149 requests.

## What I need from you, in order

1. Review the sample and exceptions in `REVIEW.md` and tell me which tranche you approve, with any entries to drop.
2. Say whether to open the pull requests (the speed fix, the registry code, the batch tooling, the paged read stacked on #203).
3. By about 27 October: the OpenStreetMap tranche, go or no-go, after reading [ODBL_ASSESSMENT.md](ODBL_ASSESSMENT.md); and whether you want me to send the OSMF the one drafted message.
4. Whether the 45 venues that continue only through OpenStreetMap are worth a private alias map, or should come back as new venues (saved ones re-saved).
5. Still open from before: approve Google retention step 1 (revoke public read of `place_records`); delete the four `data/open-data-inputs*` branches; the two-account production canary; your iPhone review of #201 and #203.

## Rollback

Nothing here is applied. Once applied: the registry files are empty-able (a revert of the registry commit), `cutover.json` is a list that can be emptied, and the reader serves Google rows again for any category not on it. The speed fix is a revert of one commit.
