# Vercel deployments: what hit the daily limit, and what is switched off

15 October 2026. **Nothing here changes production.** `vercel.json` gains a `git.deploymentEnabled` map that stops Vercel building a Preview for named branches that do not need one. No plan is upgraded and no paid service is used.

## What happened

On 14 October at 21:29 UTC Vercel refused a build with `api-deployments-free-per-day` ("more than 100", retry in 24 hours). Counted from the repository's GitHub Deployments records (one per Vercel build; `gh api repos/.../deployments`):

| | Deployments |
|---|---:|
| 24 hours before the refusal | 148 (144 Preview, 4 Production) |
| 14 October, UTC day | 146 |
| 8 and 9 October | 82 and 64 |

Every push to any branch is a build, and the free plan allows 100 a day. A release day needs that allowance for a production deploy and at least one Preview rebuild, so the limit is a risk to the recovery, not only a nuisance.

## Where the 148 came from

Each deployment's commit was attributed to the remote branch it sits closest to the tip of. That is a heuristic (a merge commit can sit on several branches), so read the counts as close, not exact.

| Branch group | Deployments | Note |
|---|---:|---|
| `data/open-data-fetch` | 46 | A throwaway branch: a GitHub runner reads public sources and **commits its results back**, so every job built twice (my push, then the runner's) |
| `data/open-data-inputs`, `-diagnostic`, `-regions`, `-regions-2` | 4 | Same kind of branch, one each |
| `docs/licensing-and-retention` 11, `docs/open-data-dry-run` 5, `docs/soft-play-recovery` 3, `docs/catalogue-expansion` 1 | 20 | Documentation and review packs only |
| `main` (production) | 4 | Never to be switched off |
| Functional and tooling branches (`feat/open-data-dry-run` 11, `feat/catalogue-recovery` 9, `feat/recovery-review-tooling` 7, `preview/tranche-a` 6, `feat/explore-paged` 6, `perf/boot-web` 5, `release/tranche-a` 5, `feat/open-licence-sources` 5, `fix/map-compliance` 5, and 14 others) | 74 | Stay deployable |

## What the change does

```json
"git": {
  "deploymentEnabled": {
    "data/open-data-fetch": false,
    "data/open-data-inputs": false,
    "data/open-data-inputs-diagnostic": false,
    "data/open-data-inputs-regions": false,
    "data/open-data-inputs-regions-2": false
  }
}
```

- **Exact names, no patterns.** Vercel matches these keys with minimatch, and any branch not named defaults to *deploy*. A pattern such as `data/*` or `data/open-data-*` could one day catch a venue-data release branch, so none is used. A test (`vercel-branch-rules.test.ts`) fails on any glob character, on any value other than `false`, and on any change to the list that is not made in the test as well.
- **Stays deployable:** `main` and so production; Explore (#203) and its stacked branches; Optional Lunch (#201); the Tranche A Preview and release candidate; the reconnect screen; all `feat/`, `fix/`, `perf/`, `release/` and `preview/` branches; every other `data/` branch, including any future release.
- **Not affected:** GitHub Actions. Workflows run on pushes and pull requests regardless of Vercel. The only workflow that reads a Preview deployment is `opening-hours-live-smoke.yml`, which runs on pull requests touching `server/places/lib/google-places.js` (none of the switched-off branches does); the other Preview-reading workflows are manual and take a URL.
- **Not an Ignored Build Step.** Vercel counts builds cancelled by an ignore command against the quota. A branch switched off here is never deployed, so there is no deployment to count.

## How it was checked

1. `node scripts/check-vercel-branch-rules.mjs` lists the branches on `origin` (159 when this was written) with the real minimatch Vercel uses: the first commit switches off only the five named branches (154 still build), the second commit nine (150 still build), `main` builds, and every rule is an exact name that matches a branch.
2. The vitest file above pins the list and asserts that production, every functional branch and plausible names for future venue-data releases (`data/venue-release`, `data/tranche-c`, `release/tranche-c`, `data/open-data-release` and so on) are not caught, and that near-miss names (`data/open-data-fetch-2`) are not either.
3. **On Vercel itself**, on the throwaway branch, which carries the same setting: the same setting was committed to `data/open-data-fetch` (the busiest branch) and a control commit carrying the same `vercel.json` was pushed to an unlisted branch, nine seconds apart, at 06:58 UTC on 15 October.
   - The **unlisted branch built**: Vercel posted a status within 3 seconds, created a deployment, and finished in about 3 minutes (success). So the setting does not stop an unlisted branch building, which is what keeps `main`, Explore, the Preview and the rest deployable.
   - The **listed branch produced nothing**: no Vercel status, no GitHub deployment record and no check run, checked again three minutes later. Before this change every push to that branch produced a deployment (46 in the 24 hours before the refusal).
   - Because the throwaway branch's commits are skipped, so are the results commits the runner pushes back, which is where half of its cost came from.

## Limits, stated plainly

- Vercel reads this setting from the commit being pushed. A branch created before this change lands needs the setting in its own history to be switched off (merge `main` into it, or add the file). New branches inherit it from `main`.
- I cannot see the Vercel dashboard's usage counter, so I cannot read the daily number from the project's side. What I can show is that a switched-off branch produces no GitHub deployment record, no Vercel status and no check run, i.e. no deployment exists to be counted. Vercel also lifted the refusal sooner than its message said: a build was accepted at 06:58 UTC on 15 October, about 9.5 hours after the 21:29 UTC refusal, and the exact rule it uses to count is not documented.
- Switching off the five data branches alone takes the 24-hour count from 148 to about 98, just under the limit. The second change in this pull request (documentation-only branches, an optional second commit) takes it to about 78. Batching pushes does the rest.
- A switched-off branch gets no Preview URL. These branches have none worth opening.
- If a branch listed here ever needs a Preview, remove its line in a small pull request.

## Pushing less, without Vercel settings

Batch commits and push once; do not push a branch only to re-run a check; a PR branch should not be re-pushed to refresh a description (use the API). A release day should start with a day's allowance unspent.
