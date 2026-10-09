# Production actions that need your approval

Status: 2026-10-08. **Nothing on this page has been done.** No production claim has been written, no job queued, no cron changed, no paid provider called, by this work. Read-only checks were made against production at the end of the session and are stated with what they do and do not prove.

## 1. Step 1: the stored-page re-extraction (deadline 10 October 00:36 UTC)

**Approval-ready: [`step1/APPROVAL.md`](step1/APPROVAL.md).** It holds the 17-venue command, the Colne Valley withdraw-only statement (nothing is published about parking there), the four withdrawals, the 87 expected active claims, the 16 additions, and the rollback. The supporting analysis is `step1/FINAL_GATE.md`. **Not executed; waiting for your explicit instruction.**

## 2. Google photographs: switching new paid requests off

**You approved disabling new paid photo requests. It is not done and I cannot do it from here:** this session's Vercel connection lists no team and no project, so I can neither read nor change the environment. I will not report it as off until the live check below passes.

What production shows (read-only, `google_places_usage`, checked 8 October 22:30 UTC): `place_photos` calls were **116** on 5 October, **91** on 6 October, **339** on 7 October and **50** on 8 October (last written 15:14 UTC). **Paid photo requests are still being made.** The switch is not on.

**Exact steps (about five minutes):**

1. Vercel, the FamilyPilot project, **Settings, Environment Variables**.
2. Add `GOOGLE_PLACES_PHOTOS_ENABLED` with value `false`, ticking **Production** and **Preview**. If it already exists, edit it rather than adding a second.
3. **Deployments**, the latest production deployment, **Redeploy** (an environment variable only takes effect on a new deployment).
4. Verify, not assume. In GitHub, **Actions, live-canaries, Run workflow** on `main` with `assert_fail_closed = true`, `posture_profile = production`, `verify_client_config = true`, `expect_off = photos`. It must finish green. **Baseline already taken:** I ran exactly this against production on 8 October at 23:16 UTC (free, no provider request; [run 25](https://github.com/aidanshaw92/FamilyPilot/actions/runs/37858462476)). The step "Assert the target is fail-closed for every paid Google scope" **failed**, which is the expected result while photos are on, and shows the check can tell the difference. After your change the same run must pass that step.
5. Tomorrow, `select * from google_places_usage where sku = 'place_photos' order by usage_day desc limit 3;` should show no new calls dated after the redeploy.

With photographs off the app shows its own placeholders (checked in the earlier fallback render). Nothing in this branch depends on photographs.

## 3. Step 2: the website-identity rescope

Separate and unexecuted. `docs/STEP2_RESCOPE_PACKAGE.md` stands as written; this branch neither changes nor depends on it.

## 4. Publishing anything the pilot proposes

Not requested and not done. If you decide to, these are the separate approvals, in the order I would take them:

| What | How much | Mechanism | A person must decide |
|---|---|---|---|
| Facts that passed the gate and every independent check | 38 claims (29 in production's own automatic field list) | Claims, written by the pilot's path | Optional: they need no one, but are not published until you say |
| Facts a person has approved | 35 more claims | Claims | The 74 decisions left after parking, merging and deferring (`REVIEW_REDUCTION.md`) |
| Venue rules | 28 | `rules.<id>` claims, only from a `human:` approver | Each one |
| Official opening hours | 16 | `hours.<id>` claims, only from a `human:` approver | Each one |
| Age-specific activity data, admission data | 10 and 6 (+7 held) | Code, by pull request | The pull request |

Nothing automatic can create a rule or an hours reading; the production projection drops any that an automatic approver wrote.
