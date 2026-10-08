# Production actions that need your approval

Status: 2026-10-08. **Nothing on this page has been done.** No production claim has been written, no job queued, no cron changed, no paid provider called, by this work. Read-only checks were made against production at the end of the session and are stated with what they do and do not prove.

## 1. Step 1: the 21-venue re-extraction (window closes 10 October)

The approved gate is `docs/STEP1_FINAL_GATE.md` (on `docs/step1-final-gate`, PR #187). It is unchanged.

**Does production still match the gate? Yes, checked read-only just now:**

| Gate's assumption | Production now |
|---|---|
| 76 active claims on the 21 venues, all automatic | 76 active, all `source_evidence_auto_v2` |
| The five claims to be withdrawn or corrected are active | All five active (`24a699e3…`, `eabed57d…`, `37cf3fa6…`, `be6f2b75…`, `e7f221fa…`) |
| No job has run for these venues | 168 jobs in total, none created in the last 48 hours, none open |
| No v6 draft exists | 0 drafts from `official-source-rules-v6` |
| Scheduler has used today's slot | Unchanged: the newest claim anywhere is checked 7 October; nothing is queueable before 24 October |

So the dry run in the gate is not invalidated. One claim on the list (Tate Modern parking, created 7 October) predates the gate and is inside its 76.

**What it does, concisely:** re-reads the stored pages of 21 venues with extractor v6 (no website fetched, no model, no Google). **18 facts added, 1 corrected (Colne Valley parking: no → yes), 4 withdrawn (Sydenham Hill Wood accessible toilet; QEOP parking and free parking; Whitechapel free parking), 17 re-quoted with the same value, 54 untouched.** Withdrawn means back to unknown; nothing is deleted.

**The command** (Supabase SQL editor; expected return 21; a second call queues 0):

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

Checks, undo and the five claim ids are in the gate. **I am stopped here until you say go.**

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
| Facts a person has approved | 35 more claims | Claims | The 99 held items, with the review page |
| Venue rules | 28 | `rules.<id>` claims, only from a `human:` approver | Each one |
| Official opening hours | 16 | `hours.<id>` claims, only from a `human:` approver | Each one |
| Age-specific activity data, admission data | 10 and 6 (+7 held) | Code, by pull request | The pull request |

Nothing automatic can create a rule or an hours reading; the production projection drops any that an automatic approver wrote.
