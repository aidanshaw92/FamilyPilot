# Controlled beta: a staged, reversible plan

> **9 October:** the "two deployments" structure below is superseded. Accounts are disabled on Preview and the project is at the 12-function limit, so the beta is the production deployment, invitation-only, flags off. See [`beta/BETA_OPERATIONS.md`](beta/BETA_OPERATIONS.md). The stage gates, evidence checks and rollback ladder below still hold.

Status: 8 October 2026. A plan, and the checks already run for it. **Nothing in it has been done**: no merge, no production write, no flag, no publication. Each stage ends at a decision that is yours.

Principles: nothing unreviewed is published or merged; every stage can be undone and the undo is written down before the stage starts; the next stage never starts because the previous one ran, only because its gate passed; and a family is never shown a fact, a refusal or a recommendation that a person has not decided.

## Where things stand

| | State |
|---|---|
| Production | `main` at `b74a4c8`. Photos: **still billing** (50 `place_photos` calls on 8 October; the switch is not verified off). Claims: 76 active at the 21 recovery venues, all automatic |
| #189 | Draft. Docs, fixtures, the ten profiles, and **proposed** entries in two shipped data files |
| #190 | Draft, stacked on #189. App code for rules, hours, variable prices, step-free, access concepts, both Fit flags (off), review tooling |
| Evidence | 171 publishable-or-not items; 96 human decisions needed (31 expert, 50 reviewer, 15 low-risk grouped as 13 reads and 2 approvals); none decided |
| Monitoring | Live canaries (cost posture, nearby food, one routes element), the Google usage table, an opening-hours smoke test. **No client error reporting or analytics exists** |
| Limited access | **None built.** Invites in the app connect families to each other; they do not gate who may use the app |

## The structure that makes this reversible

Two deployments share one database. **Production stays on `main`.** The beta is a separate deployment built from the inert-integration branch, with the flags set for the beta only (flags are build-time values, so they differ per deployment). Because `main`'s code ignores rule and hours claims it does not understand (checked below), publishing those claims changes nothing for production and appears only on the beta build. Merging to `main` is the last step, a general release, not a prerequisite for the beta. This assumes a Preview deployment carries the same backend settings as Production (the photo switch is applied to both for that reason); I cannot see Vercel to confirm it, so stage 3 includes loading the alias and checking it reads the same venues.

What this does not isolate: a fact in a field `main` already reads (toilets, café, parking, wheelchair access and so on) is visible on both deployments the moment its claim is written. So fact claims are the one class that reaches production families at once, and are approved with that in mind.

## Stages

Each row: what changes in production, what a beta family sees, the gate that must pass first, and how it is undone.

| # | Stage | What changes | What a beta family receives | Gate before the next | Undo |
|---|---|---|---|---|---|
| 0 | **Stop the spending** | `GOOGLE_PLACES_PHOTOS_ENABLED=false` (Production and Preview) and a redeploy. Yours to do in Vercel | Photographs are replaced by the app's own placeholders. Nothing else | The `live-canaries` run is green with `expect_off=photos`, and a later day's `place_photos` count shows no new calls | Set the variable back and redeploy |
| 1 | **Step 1 recovery** | One function call queues a stored-page re-read of 18 venues (`step1/FINAL_GATE.md`). No network, model or Google call | Corrected and added facts at 18 venues outside the pilot ten, e.g. wheelchair access at 9 venues, Colne Valley parking now yes, a wrong "accessible toilet" at Sydenham Hill Wood removed | The post-run checks pass; 88 active claims; no `place_details` usage | `step1/rollback-2026-10-08.sql`, tested |
| 2 | **Final evidence review** | Nothing | Nothing | Expert pack and reviewer pack each run and timed by a real person; the reviewer catches at least 3 of 4 hidden controls; all 96 decisions made; **you decide the 5 whole-venue closures and core-visit restrictions** | Nothing is published; a decision is withdrawn by a later line in the audit trail |
| 3 | **Beta build** | Create the inert branch (`scripts/pilot/inert-integration.sh`: all #189/#190 code, none of the proposed shipped data) and deploy it as a protected alias with the beta flags. #189 and #190 stay draft | Nothing new yet for a family with no mobility aid (see "One behaviour that is not inert") | Home output identical to `main` for 11 households in 2 evidence states (done); full suite green except the 3 "after build" checks; the 360 and 393 px journeys pass on the alias | Delete the alias |
| 4 | **Claim and rule approval** | Approved items only, one class per approval, each with its own rollback: (a) facts, (b) `rules.*` with a `human:` approver, (c) `hours.*`, (d) reviewed activity and admission data as pull requests onto the beta branch | (a) new facts on Venue Detail; (b) a whole-venue closure refuses that date, e.g. the Natural History Museum on 9 October; a pushchair restriction refuses a household that needs buggy access and warns one that brings a buggy; "Before you go"; (c) the venue's hours beat the provider's when they differ, said openly; (d) "For children" and prices | Per class: a parity check (only the intended rows changed), the scenario journeys pass, a person looks at each affected Venue Detail | Per class: set the rows disputed; data pull requests are reverted |
| 5 | **Flags** | On the beta build only: `EXPO_PUBLIC_FAMILY_FIT_V2=conflicts`, later separately `score` | `conflicts`: a venue the planner would refuse for a family's own non-negotiables is listed after the others, never as the top recommendation. `score`: recommendations that count what is confirmed for this household and ignore how much a website says | Your approval of each; the regression suite; the access-concepts and evidence-neutrality tests; for `score`, widened reviewed age coverage (see blockers) | Unset and redeploy the alias |
| 6 | **Monitoring and a way in** | Canaries scheduled; a daily read-only check of claims and usage; the access option chosen | n/a | A named person checks daily during the beta and holds the rollback files | n/a |
| 7 | **Real-device testing** | Nothing | Nothing | Pass on the device list below by a person, with notes | n/a |
| 8 | **Invite families** | Give 5 to 10 invited families the beta address | The beta build as of the stage reached | Two weeks without a stop signal, and no family reporting a wrong refusal or a wrong fact | Take the alias down |
| 9 | **General release** | Merge the inert branch to `main`, then (separately) turn flags on for production | Everyone gets what the beta had | Beta results, and your decision | Revert the merge; unset flags |

### What a family receives, cumulatively (beta build)

| After stage | Venue photos | Facts at the 18 recovery venues | Pilot ten: facts and rules | Closures refuse dates | Fit ordering | Recommendations |
|---|---|---|---|---|---|---|
| today | Google photos (billing) | as before | automatic claims only | no | as today | as today |
| 0, 1 | placeholders | corrected | unchanged | no | as today | as today |
| 3 | placeholders | corrected | unchanged | no | as today | identical to `main` |
| 4a to 4c | placeholders | corrected | reviewed facts, rules and hours for the ten | yes, where a person approved a rule | as today | as today, with the new facts shown |
| 4d | placeholders | corrected | plus "For children" and prices | yes | as today | wording changes where reviewed activity evidence covers a child (checked: headlines and reasons change for households with young children) |
| 5 (`conflicts`) | placeholders | corrected | same | yes | confirmed conflicts last | same venues, different order for affected households |
| 5 (`score`) | placeholders | corrected | same | yes | evidence-aware | different top fives (`FAMILY_FIT_V2.md`) |

## What has already been checked for these stages

- **Stage 3 is inert.** With the five files back to `main`'s version, `src/__tests__/main-parity.analysis.test.ts` produced output byte-identical to `main` for 11 households in two evidence states (headline, reasons, to-check lists, cautions, factors, score and order for each of the ten venues). With the two proposed data files left in, the output differs: reviewed activity evidence changes what Home says even with every flag off, which is exactly why those entries wait for review. The full suite passes on that branch except the three static-route checks that need a build.
- **Main ignores rule claims it does not understand.** Projecting a `rules.*` and `hours.*` claim with `main`'s code returns only the known fields and does not throw, and the claims table has no constraint on the field key. So no migration is needed, and publishing claims before the code is merged would be harmless but invisible. The order above still puts the code first.
- **No new claim type needs a schema change.** The `venue_claims` table accepts any key; the server changes in #190 are four files (+197 lines).

## One behaviour that is not inert

#190 adds a step-free requirement for a household with a wheelchair or mobility-aid user. In the day planner an unconfirmed wheelchair claim is carried as "check" (the plan builds, with the gap named). In `planVenue`, which the recommendation and Meet Halfway paths use, a required fact that is unknown makes the venue ineligible, as it already does for a must-have toilets, parking or buggy access. So on the beta build, a mobility-aid household sees only venues with a confirmed wheelchair claim in those paths. That is consistent with how required facts have always worked there, and it contradicts "unknown stays unknown". **Decision for you:** gate it behind the `conflicts` flag, or make `planVenue` carry unknown as a check for this one need. I recommend the second, and I have not changed it.

## Limited availability (stage 6): the options

The app has no access control. Your call, in order of how much I would trust them:

| Option | How | Cost and limits |
|---|---|---|
| A. Vercel password protection on a beta deployment | A separate project or alias with protection on; invited families get the password | Needs the right Vercel plan. The beta flags (stage 5) live on this deployment only, so production stays off. I cannot verify it from here |
| B. Unlisted URL | An unguessable preview alias, `noindex` | Not access control: anyone with the link is in. Fine for 5 to 10 families you know; add `X-Robots-Tag: noindex` in `vercel.json` (a small change I have not made) |
| C. An in-app allowlist | Code: a code or invite needed to open the app | The right answer before any public beta. Not built |

I recommend A if your plan allows it, otherwise B for the first ten families only.

## Real-device testing (stage 7)

Done by a person on devices. My scripted runs use emulated Chromium at 360 and 393 px and prove layout and flow, not feel.

| Device | What only a device shows |
|---|---|
| iPhone SE or mini (375 or 360 pt wide), iOS Safari | Safe areas and the bottom tab bar, keyboard covering inputs in Edit Profile and Create a Plan, add-to-home-screen |
| iPhone 15 (393 pt), iOS Safari | The same at the common width; sheet gestures |
| A mid-range Android phone, Chrome | Back-button behaviour, text scaling, slow network |
| One tablet or large phone | Nothing overflows sideways |

Journeys: create a profile with two children of different ages; Home; a venue; Create a Plan for a date; Save; reopen the saved plan; Meet Halfway with a connected family; a household with a mobility aid; a household that needs buggy access at Discover; the Natural History Museum on 9 October. Record anything that surprises the family, not only what fails.

## Monitoring and rollback (stage 6)

| Signal | How | Threshold to stop |
|---|---|---|
| Paid Google calls | `google_places_usage` daily; `live-canaries` with `assert_fail_closed` | Any `place_photos` or `place_details` after stage 0 |
| Facts changed unexpectedly | A read-only count of active claims and a fingerprint of ids at the venues touched | Any difference from the expected set after a stage |
| A refusal that looks wrong | A daily list of rule claims in force with their expiry (rules expire after 30 days) | A rule that should have lapsed, or a refusal a family reports |
| Broken screens | Families' notes, and a manual smoke on the preview after each deploy | Anything blocking a journey |
| Cost posture drift | `live-canaries` weekly | Any scope that should refuse accepting |

No client error reporting exists. For ten invited families that is manageable if they can message someone; it is not enough beyond that. Adding it is a product and privacy decision I have not taken.

Rollback ladder, fastest first: unset a flag and redeploy; set a claim class disputed; revert a merge commit; run `step1/rollback-2026-10-08.sql`; take the beta deployment down. Each is written before its stage and none needs me.

## What I need from you, and what I will not do without it

| Decision | Stage |
|---|---|
| Set the photo switch and run the canary | 0 |
| Authorise the Step 1 command (18 venues) | 1 |
| Name the expert and trained reviewer, and decide the 5 refusing items yourself or delegate them in writing | 2 |
| Authorise creating and deploying the beta build | 3 |
| Authorise each claim class and each data pull request | 4 |
| Approve `conflicts`, later `score`, each separately | 5 |
| Choose A, B or C, and the family list | 6, 8 |
| Decide how a mobility-aid household's unknown wheelchair access should behave in `planVenue` | before 3 |
| Approve merging to `main` and turning flags on in production | 9 |
