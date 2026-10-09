# Minimum viable operational beta (supersedes the "second deployment" idea in `BETA_PLAN.md`)

Status: 9 October 2026. Everything here is either already in code on the draft PRs (flags off, nothing live) or a setting only you can change. **Nothing has been merged, deployed, or changed in production or Supabase.**

## What I found, and what it changed

| Finding (checked, not assumed) | Consequence |
|---|---|
| **There are 2 accounts in production, both confirmed, none anonymous.** Sign-ups are open to anyone who finds the URL; email confirmation is on | Closing sign-ups affects nobody. There are no production families to protect from a beta |
| **Accounts are mandatory** in the app and are **disabled on Vercel Preview** (`refuseOnPreview`) | A "separate beta build" on a Preview URL cannot sign anyone in. The beta has to be the production deployment, or a second Production-grade project |
| Row-level security is on for every table. Venue tables are public-read. User tables (profiles, plans, connections, visit reports) are owner-only | A second build sharing the database adds no user-data risk by itself, but nothing it does would be isolated either: it is the same data, same Google key, same spend. Isolation would have to come from a second Supabase project, which is a larger piece of work than this beta needs |
| Flags (`EXPO_PUBLIC_FAMILY_FIT_V2` and so on) are **build-time** | Production flags stay unset. Nothing about ranking changes for a beta family unless you later set one and redeploy |
| Vercel is at the **12 serverless function limit** | Crash reports go through the existing `api/planning/feedback.js`; no 13th function |
| Supabase "leaked password protection" is **off** (advisor warning) | Turn it on if your plan allows it (it is a Pro-plan feature). Not a blocker; passwords already need 10 characters |

**Decision: the beta is the production deployment, invitation-only, with the new flags off.** One deployment, one database, one rollback.

## Invitation-only access, in order of reliability

1. **Supabase → Authentication → Sign In / Providers → turn off "Allow new users to sign up".** From then on only addresses you create can have an account. A stranger who tries "Create account" now sees: *“FamilyPilot is by invitation for now. If you were invited, choose Sign in, then ‘Forgot password’ with the email address your invitation went to, and set your own password.”* (in code, tested.)
2. **Create each invited family in Authentication → Users → Add user** (their email, tick *Auto confirm user*, any long random password you do not keep). You never see or send a password.
3. Tell the family to open the app, choose **Sign in → Forgot password?**, and use the link in the email. **This path had a hole, now fixed in code:** the reset link signed the person in but nothing asked them to choose a password, so they could never sign in again later. The app now stops on a *Choose your password* screen after any reset or invitation link (`password-recovery.test.ts`). This fix must be merged and deployed *before* the first invitation is sent, or step 3 must be replaced by you setting a password and sharing it out of band.
4. Check *Authentication → URL Configuration*: the Site URL is the production address and `https://<production host>/` is in the redirect allow-list (the reset link redirects to `/`).

To remove a family: delete the user. Their plans and reports are owner-only rows and are removed or orphaned by the account delete (the schema cascades from `auth.users`; confirm once with the first test account).

What this is **not**: a waiting list, invitation codes, or a way for a family to invite another family into the app. Connections between invited families work as they do today.

## Basic client error reporting (off until you set one variable)

- Code: `src/services/monitoring/client-errors.ts`, `src/components/AppErrorBoundary.tsx` (wraps expo-router's error screen), and a branch in `api/planning/feedback.js` (`kind: 'client-error'`), scrubbing in `server/feedback/_lib/client-error.js`.
- **Off unless the build sets `EXPO_PUBLIC_CLIENT_ERRORS=on`** (Vercel Production env var, then redeploy). With it off the app sends nothing.
- What is sent, only for a signed-in person: error kind (render / uncaught / promise), message (300 characters), the first 900 characters of the stack, the route **with ids replaced and no query string**, build id, platform, viewport. Emails, tokens, long ids, coordinates and postcodes are scrubbed even if they appear in a message. The profile, children, plans and page contents are never read.
- Where it goes: **one log line** in the Vercel function log, `client-error {...}`, without the account id. No table, no migration. Search the project's Runtime Logs for `client-error`. At most 5 distinct reports per session, 10 a minute per account.
- Limits, said plainly: it sees crashes and unhandled errors, not "this recommendation looked wrong". Logs are kept for the Vercel plan's retention only (short on free plans), so check them daily during the beta; a table would be the next step if you want history.

## Monitoring (`docs/pilot/beta/monitoring.sql`, all SELECTs; checked against production today)

| Question | Block | Healthy |
|---|---|---|
| Is Google being paid for? | 1 | No `place_photos` / `place_details` rows after the switch. A quiet day is not proof: also run `live-canaries` with `assert_fail_closed=true` |
| Did facts move without my say-so? | 2, 3 | Active claim count unchanged between approved batches |
| Are refusals in force right? | 4 | Every rule has a human approver and has not lapsed |
| Missing venue data | 5 | Baseline today: 168 venues, 79 with a current claim. The number must not fall |
| What did families tell us? | 6 | Every "no" or "difficult" read by a person within two days |
| Who is in? | 7 | Equals the invitations sent (2 today) |

Broken recommendations are the one thing no automatic check sees. For the first families that is a person: each week, ask each family one question (“Was there anything we recommended that surprised you?”) and read their saved plans' headlines with their permission.

## Reversible deployment

| Layer | Undo | Time |
|---|---|---|
| App code | Vercel → Deployments → previous production deployment → **Instant Rollback** | about a minute |
| A flag or `EXPO_PUBLIC_CLIENT_ERRORS` | Unset the variable and redeploy (build-time) | a build |
| Published claims | Set the batch's claims `disputed` with the batch's rollback file (Step 1: `step1/rollback-2026-10-08.sql`, tested on PostgreSQL 16) | a minute |
| Sign-ups | Turn the Supabase toggle back on | seconds |
| Photos | Env var back, redeploy | a build |

Rollback does **not** undo database changes or environment variables; the table above says which tool does. No migration is needed for this beta, so there is no schema to reverse.

## Real-device testing (a person, before the first invitation)

My scripted runs are emulated Chromium at 360 and 393 px (layout and flow, not feel). A person needs to do, on the production URL signed in as a test account:

| Device | Checks |
|---|---|
| iPhone SE or mini, iOS Safari | Safe areas and tab bar; keyboard over Edit Profile and Create a Plan fields; **the password-reset link opens in Safari and lands on Choose your password**; add to home screen |
| iPhone 15, iOS Safari | The same at 393 pt; sheet gestures |
| Mid-range Android, Chrome | Back button; text scaling at 130%; slow 3G; the reset link from Gmail's in-app browser |

Journeys: invitation email → set password → profile with two children of different ages → Home → a venue → Create a Plan for a date → Save → close the app → reopen the plan; a household with a mobility aid; a household that needs buggy access at Discover; the Natural History Museum on 9 October; sign out and back in. Write down anything that surprises, not only what fails. I have no devices; **this is the one item nobody has done.**

## Not done, deliberately

No waiting list, no analytics, no push, no second Supabase project, no table for crash reports, no change to scoring or ranking, no production write.
