# Production actions that need your approval

Status: 2026-10-08. **Nothing on this page has been done.** No production claim has been written, no job queued, no cron changed, no paid provider called, by this work. Read-only checks were made against production at the end of the session and are stated with what they do and do not prove.

## 1. Step 1: the 21-venue re-extraction (reading window closes 10 October)

The approved gate is `docs/STEP1_FINAL_GATE.md` (PR #187). **The two earlier simulations (16 added / 1 corrected / 7 withdrawn, and 18 / 1 / 4) are reconciled row by row in [`STEP1_RECONCILIATION.md`](STEP1_RECONCILIATION.md)**, using the real `main` code over the 161 stored pages, in production's page order, with a network guard (0 attempts). The corpus was filtered in the first run and pages were listed in URL order in both; "80 active claims" was an arithmetic slip (production holds 76).

**Result: 18 facts added, 1 corrected (Colne Valley parking: no → yes), 4 withdrawn (Sydenham Hill Wood accessible toilet; QEOP parking and free parking; Whitechapel free parking), 4 re-quotes with the same value (two are a trailing space), 67 untouched.** Withdrawn means back to unknown; nothing is deleted. Active claims at the 21 venues afterwards: 76 − 5 + 19 = **90**.

Same 21 ids as the gate (checked mechanically); stored pages only; no crawler, model, Google or other paid call; only automatic claims can be touched; a second call queues 0. Two quotations that get weaker (Frameless, Tate Modern) have a 19-venue **Option B** in the reconciliation. I recommend the 21-id command you approved.

**The command** (Supabase SQL editor; expected return 21; a second call returns 0):

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
  'fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI',
  'fp-osm-679119297','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8',
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
]);
```

Monitoring (about 30 minutes later, read-only, I run it): every `reextract` job `completed` with no `last_error`; one `official-source-rules-v6` draft per venue with `evidenceMode = 'stored'`; exactly five named claims no longer active; 90 active; `google_places_usage` for the day unchanged. Undo statements for withdrawals, the correction, additions and re-quotes are in `STEP1_RECONCILIATION.md` §5. **I am stopped here until you say go.**

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
