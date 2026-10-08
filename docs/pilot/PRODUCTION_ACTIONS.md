# Production actions that need your approval

Status: 2026-10-08. **Nothing on this page has been done.** No production claim has been written, no job queued, no cron changed, no paid provider called, by this work. Read-only checks were made against production at the end of the session and are stated with what they do and do not prove.

## 1. Step 1: the stored-page re-extraction (reading window: Museum of the Home closes 10 October 00:36 UTC)

**Superseded detail: [`step1/FINAL_GATE.md`](step1/FINAL_GATE.md) is the execution gate.** It lists the four withdrawals with quotations, the Colne Valley correction, the four re-quotes, the 21/19/18-venue comparison, the snapshot check, the no-network argument, the post-run checks (`step1/post-run-checks.sql`) and a tested rollback (`step1/rollback-2026-10-08.sql`). The earlier reconciliation is in `STEP1_RECONCILIATION.md`.

**Recommended: 18 venues.** Frameless, Tate Modern and Chiswick House are left out because their only effects are a weaker quotation replacing a stronger one, or a weak new quotation. Result: **16 facts added, 1 corrected (Colne Valley parking), 4 withdrawn, 1 harmless re-quote, 88 active claims afterwards.**

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
  'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y',
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
]);
```

Expected return 18; a second call returns 0. **Not executed. I am stopped until you authorise it.**

## 2. Google photographs: switching new paid requests off

**You approved disabling new paid photo requests. It is not done and I cannot do it from here:** this session's Vercel connection lists no team and no project, so I can neither read nor change the environment. I will not report it as off until the live check below passes.

What production shows (read-only, `google_places_usage`): **339** `place_photos` calls on 7 October, **91** on 6 October, **none yet recorded on 8 October** (the last row written today is the 03:00 discovery sync). The absence today is not evidence the switch is on; it may only mean no one has opened a venue yet.

**Exact steps (about five minutes):**

1. Vercel, the FamilyPilot project, **Settings, Environment Variables**.
2. Add `GOOGLE_PLACES_PHOTOS_ENABLED` with value `false`, ticking **Production** and **Preview**. If it already exists, edit it rather than adding a second.
3. **Deployments**, the latest production deployment, **Redeploy** (an environment variable only takes effect on a new deployment).
4. Verify, not assume. In GitHub, **Actions, live-canaries, Run workflow** on `main` with `assert_fail_closed = true`, `posture_profile = production`, `verify_client_config = true`, `expect_off = photos`. It must finish green.
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
