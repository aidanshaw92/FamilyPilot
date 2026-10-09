# Route to a 20–30 family beta: execution plan

> **Updated 9 October (afternoon):** see the checklist at the very end, which supersedes the tables below where they differ. New since the first version: invitation links required a password (found and fixed, 40-check browser test against real Supabase Auth); the Step 1 package is now 17 venues with a guarded rollback; wave 1 of the review is nine cards; publishing batches are built and rehearsed; the likely real blocker is **email delivery** (custom SMTP).

9 October 2026. Nothing below has been executed in production. Draft PRs #189, #190, #191 stay draft; nothing is merged or deployed.

## 1. Already complete (built, tested, pushed)

- **Step 1 approval document**, exact SQL (17 venues, one function call, no network, no Google), the scoped Colne Valley withdrawal, expected claims, tested rollback: `step1/APPROVAL.md`.
- Three-state accessibility across Home, Explore, Venue Detail, Create a Plan, saved plans (9 claim combinations, tested); Fit v2 scoring **off** and unchanged.
- Inert integration branch (#191): 3363/3363 tests with the build, Home output byte-identical to `main` with flags unset, Figma checks identical.
- Reviewer workflow: delegation model, plain-language guide, two ready packs (31 expert cards; 67 reviewer cards with 4 hidden controls), timing and audit-sample scoring.
- Beta ops code (flags/settings off): invite-only message, **choose-a-password step after a reset link (a real gap, fixed)**, crash reporter, daily monitoring SQL, rollback table, device protocol.
- Ten-venue journey passing at 360 and 393 px including save and reopen.

## 2. Must be complete before inviting anyone

| # | Item | Who | Blocking because |
|---|---|---|---|
| 1 | Photo switch + redeploy, then my canary | you, then me | Photos still billing (50 calls on 8 Oct) |
| 2 | Step 1 run (A then B) and post-run checks | you authorise, I run | Corrects 17 venues' facts; **deadline 10 Oct 00:36 UTC** |
| 3 | Merge #191 and deploy | you approve | The invite path (choose-a-password) and error reporting do not exist on production |
| 4 | Supabase: sign-ups off, invited accounts created, redirect URL checked | you | Without it anyone can sign up |
| 5 | **The review: 31 expert cards (5 are yours) + 67 reviewer cards** | you, an expert, a trained reviewer | Until closures, restrictions and hours are decided, a plan can send a family to a closed museum with no flag |
| 6 | Publication batches for approved items, one class at a time, each with a rollback | you approve each | Makes item 5 reach families |
| 7 | Real-device pass (iPhone and Android) | a person | Nobody has done it |
| 8 | First reset-link test with a real account | you or me with you | Proves invite path end to end |

## 3. Blockers I can clear without you

Done or doable now: refresh #191 after any change (done today), monitoring and docs (done), score each returned review file and build the audit trail, run the canary after the photo switch, run Step 1's post-run checks, prepare each publication batch and its rollback, fix any defect devices or families find, keep the three PRs current. **The review and the real devices are the two things I cannot do for you.**

## 4. Decisions only you can make

1. Authorise Step 1 (Run A, then Run B) before 10 Oct 00:36 UTC.
2. Set the photo env var and confirm the redeploy.
3. Name the expert and a trained reviewer, or tell me to route those packs to you; decide the five refusing items yourself or delegate each in writing.
4. Approve merging #191 (inert) and deploying it.
5. Supabase dashboard actions in `beta/BETA_OPERATIONS.md`, and the invitation list.
6. How `planVenue` treats an unknown wheelchair claim (I recommend "check", as the day planner does).
7. Each publication batch; later, each flag.

## 5. Smallest safe sequence

1. Photo switch → redeploy → canary passes. (also unblocks the cost question)
2. Step 1 Run A → Run B → post-run checks ~30 minutes later.
3. Send the review packs (expert first: it contains the five refusing decisions). Meanwhile merge #191 and deploy with flags unset; Supabase sign-ups off; create **one** test account and walk the reset-link path on a real iPhone and an Android phone.
4. Score the returned reviews; publish approved facts, then rules, then hours (separate approvals; each rollback ready).
5. Re-run the ten-venue journeys against production; read the monitoring SQL.
6. Invite the first families (below). Turn on `EXPO_PUBLIC_CLIENT_ERRORS=on` with the first invitation.

## 6. Targets

**First 10 families (two weeks).** Realistic, not aspirational:

- at least 8 of 10 reach a saved plan unaided; every one who does reopens it;
- **zero** family-reported wrong refusals and zero wrong "confirmed" facts left unfixed for more than two days (one is a stop signal);
- no blocking defect open more than 48 hours;
- zero paid Google photo or details calls; zero unexplained claim changes;
- crash log read daily; a weekly "anything surprising?" question answered by at least 7 of 10.

**Then 20–30 families** only if the above held for the full two weeks, in batches of 5–10, with the same checks at each batch. Anything that fails stops the next batch, not the beta.

## 7. Expanding from 10 to 50 destinations

All of: (a) at least three timed review sessions with at least two reviewers, tier mix and control results recorded, so time per decision is measured before it is forecast; (b) reviewers catch at least 3 of 4 hidden controls and the second-reader sample agrees; (c) the five-decision refusal route has been used once end to end with a delegate; (d) no unresolved wrong-fact report from the ten; (e) Step 1 and at least one publication batch have been rolled back once in rehearsal; (f) seven consecutive days of zero paid photo calls; (g) 8 of the 10 pilot venues stay recommendation-ready as their evidence expires (rules lapse in 30 days; the daily check shows this). Not before.


---

## Checklist: what still prevents inviting the first family (9 October, afternoon)

**Needs you (decisions or dashboard actions)**
1. [ ] Authorise Step 1: Run A, then Run B (`step1/APPROVAL_PACKAGE.md`). Deadline 10 Oct 00:36 UTC.
2. [ ] Set `GOOGLE_PLACES_PHOTOS_ENABLED=false` in Vercel Production and Preview, redeploy, tell me. (I cannot read or set Vercel from here: 403.)
3. [ ] Decide the five (`DECISION_SHEET_FIVE.md`) or nominate a delegate; they are decided together with Discover's pushchair exception.
4. [ ] Approve merging and deploying #191 at `77431e2` (`beta/MERGE_READINESS_191.md`).
5. [ ] **Check Supabase → Authentication → SMTP Settings: is custom SMTP enabled?** If not, invitations to families will not arrive (built-in email only reaches your own organisation's members). Then the settings in `beta/AUTH_VERIFICATION.md`: sign-ups off, Site URL, redirect URL, OTP expiry 24h. **Do these after the deploy in item 4**, not before: the old app cannot handle an invitation link.
6. [ ] Name a person for the real-device pass (iPhone and Android) and for the expert cards.

**Needs a person, not you**
7. [ ] Real-device pass (`beta/BETA_OPERATIONS.md`). I have no devices.
8. [ ] Wave 1: the nine cards (`RECONCILIATION_171.md`): your five plus Discover's exception plus the three hours conflicts (an expert).

**I do after your go-ahead**
9. After item 2: run `live-canaries` (`assert_fail_closed=true`, `posture_profile=production`, `expect_off=photos`, `verify_client_config=true`) and check the usage ledger.
10. After item 1: `post-run-checks.sql` ~30 minutes after Run A.
11. After item 8: build the wave-1 batch (`publish-batch.cjs`), show you `manifest.json`, and run it only on your authorisation; verify; rollback ready.
12. After items 4 and 5: send **one** real invitation to an address you control and walk the whole path on a phone before inviting any family.

**Already done and verified**: items in `beta/MERGE_READINESS_191.md`, `beta/AUTH_VERIFICATION.md`, `PUBLISHING_PROCESS.md`, `RECONCILIATION_171.md`.

**Not blockers** (can follow the first families): review waves 2 and 3, Family Fit v2, more venues, custom invitation emails.

**Ongoing cost to plan for**: rules lapse after 30 days; the pilot's rules need a re-read and re-approval about monthly while the beta runs.
