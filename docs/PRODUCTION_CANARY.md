# FamilyPilot production canary (updated for the post-launch fixes: six tabs, Halfway tab, Families hierarchy)

> Status: **not yet run, blocked.** Nothing in this document has been performed against production by Claude: no production account, invitation or record was created. Two things stop Claude running it, and only the second can be lifted by an instruction: (1) the session Claude works in cannot reach the production host (the egress policy refuses the connection, checked 13 Oct), and (2) it needs two real inboxes and permission to create two production accounts. The synthetic-account journeys, including the shared-plan flow of section 9, are verified against the in-memory fixture (which runs the real handlers) only; that is not a production pass. Production-config neutrality below is a statement about the diff, not about production.

Two synthetic parent accounts, the normal signup, in the existing production project. About 40 minutes. External beta
invitations stay on hold until every section below passes.

**Rules for the whole run.** No service-role key is used, requested or shown anywhere. Nothing in Supabase (policies, auth
settings, SMTP, migrations) or Google (keys, switches, caps) is changed to make a step pass. If a step fails, stop, do not
work around it, go to section 7. Run the two accounts on a **computer** (two browser profiles, or one normal window and one
private window), not on your iPhone, so your real family profile is never mixed with canary data. Your iPhone is for judging
the release afterwards, with your own account.

## 0. Before the merge (re-check at merge time)

The release is two squash merges in this order: **#196** (Meet halfway v2) into `main`, then **#197** (shared plans, one Plans list, Home resume) once #196 is on `main` (#197 is stacked on #196's branch and is retargeted to `main` by GitHub when #196 merges; it then needs a merge of `main` into its branch and a CI re-run before its own merge).

| Item | Value |
|---|---|
| `main` today | `d836e7c` (#195, 12 Oct). **Rollback target for #196 = whatever Production is serving just before the #196 merge** (record its Vercel deployment id and commit from the dashboard; Claude has no Vercel access to read it). The older `bc19ba5` / deployment 6965864685 in earlier drafts of this document predate #194 and #195 and are not the rollback point |
| #196 head | `38adde1`, CI green: capture, build-and-test, privilege-model, Vercel Preview |
| #197 head | `8ff3084`, CI green on the same four checks |
| Rollback target for #197 | the production deployment created by the #196 merge (record its id after the #196 canary passes) |
| Release is production-config neutral | neither PR changes workflows, `vercel.json`, `api/`, `server/`, packages, migrations or env files. #197 adds a new shape of JSON inside the existing `plan_invites.plan_snapshot` column (no schema change) |
| Merge method | squash, one commit per PR, each revertable in one step |

**Baseline (read-only, taken 12 Oct 07:xx UTC).** `auth.users` 3 (genuine, never touched); `planning_connections` 0;
`plan_invites` 0; `saved_places_backups` 0; `venue_visit_reports` 0; `planning_workspaces` 0. Google ledger: last rows are
9 Oct (discovery 9, details 1, photos 44); none on 10, 11 or 12 Oct.

**Two things to do and save before merging.**
1. Open `https://family-pilot-seven.vercel.app/api/places/status` (free, makes no provider request) and save the whole
   JSON as `status-before.json`.
2. In Supabase's dashboard, Authentication > Users, note the 3 genuine users' emails and ids, so cleanup can prove they are
   untouched.

**Prerequisite that can stop the run.** Supabase's built-in email sender may deliver only to project members. Use two
inboxes you control: `you+fpcanary-a@…` and `you+fpcanary-b@…` (or two addresses of your own). Sign up A first. If the
confirmation email has not arrived in 3 minutes, **stop**: fixing it means changing SMTP, which is your decision, not part
of this run.

## 1. The two accounts

| | Account A | Account B |
|---|---|---|
| Where | browser profile 1 | browser profile 2 (private window is fine) |
| Email | `…+fpcanary-a@…` | `…+fpcanary-b@…` |
| Family name | Canary A | Canary B |
| Home area | E8 (not your home) | SE13 (not your home) |
| Child | "Canary Kid A", age 3 (synthetic date of birth) | "Canary Kid B", age 1 |
| Routines | feed 11:15, nap 13:30 | none |

For each: Welcome > Get started > create the account (password of 10+ characters) > "Check your email" > open the link in
the **same browser** > describe the family. **Expect:** one verification email each, the link signs you in, Home loads.

## 2. Invite, accept, connected state

1. **A:** Families tab (third of six: Home, Explore, Families, Halfway, Plans, Profile) > Add a family > Invite another family > **Friend**. Leave "Also share when naps and feeds usually
   happen" **off**. Copy the link. **Expect:** A's Families tab lists a "Waiting for a reply" row.
2. **B** (signed out, in profile 2): open the link. **Expect:** the invitation shows the family label only, plus the list
   "If you accept, they will see", and no child names, no address, no email.
3. **B:** "Create an account to accept" > verify > describe the family > **Accept and connect**. **Expect:** "Connected".
4. **Both:** Families tab. **Expect:** A shows a card "Canary B's family · Connected"; B shows "Canary A's family ·
   Connected". Each card has **Plan together** and **Meet halfway**. A's "Waiting for a reply" row is gone.
5. **Third window, signed out:** open the same link again. **Expect:** it no longer works (single use).

## 3. Plan together and Meet halfway

1. **A:** on B's card tap **Plan together**. **Expect:** Explore opens with "Planning with Canary B's family · Done".
2. **A:** open any place > Create a plan. **Expect:** "Who's coming" already has Canary B's family selected. Build my plan.
   **Expect:** a timeline with both families' leave and home times, each line tagged confirmed, estimated, suggested,
   reported or unknown.
3. **A:** Halfway tab, or Meet halfway on B's card in Families (either way B is pre-selected). **Expect:** the Halfway tab selected in the bottom bar, the map under a Map/List control with numbered pins that
   match the cards; tapping a card selects its pin and tapping a pin selects its card; each family's journey is its own
   "about N min" line; no score; two shaded areas, never a house. Tap "Plan this day" on a card: the plan opens with both
   families.
4. **B:** repeat from B's side (the Halfway tab). **Expect:** the same kind of answer, with Canary A as the other family.

## 4. Privacy: nothing private without consent

A. **What B sees about A** (B's Families card, then "What I share" on A's side). **Expect only:** first-name label, an area
   word, "1 child", the age, "routines not shared". **Must not appear anywhere in B's browser (while sharing is off):** "Canary Kid A", a date of
   birth, a postcode, a street, A's email, "11:15", "13:30".
B. **The wire.** In B's browser developer tools > Network, open the response of `connections` (GET `/api/planning/connections`).
   **Expect** the `family` object to hold only: label, area, latitude/longitude to two decimals, ages, drive limit, budget
   tier, pushchair, required facilities, relationship, and `routines` empty. **No** `members`, `dateOfBirth`, names, real
   ids, address.
C. **Consent works both ways.** A: Families > A's card for B > **What I share** > turn on "Share when naps and feeds usually
   happen" > **Update what I share**. **Expect (B, after refresh):** B's card now says A shares routines, as **times
   only** and only the ones A keeps at home (the 13:30 nap, labelled "Nap"; the 11:15 feed is not shared), still no child
   name and no real id (`busy-0`). A switches it off again. **Expect:** B's card returns to "routines
   not shared".
D. **Database, read-only** (the Supabase SQL editor, or ask me to run it with the project tool: it uses your project access,
   not a key). For the canary rows only:
   `select owner_snapshot, guest_snapshot from public.planning_connections;`
   **Expect:** exactly one row; both snapshots contain only the allow-listed keys above; coordinates with two decimals; no
   name, date of birth or address.

## 5. Plan saving and reopening under real hosted authentication

1. **A (signed in):** on the plan from section 3, Change lunch to another restaurant, Change arrival, **Save this plan**.
   **Expect:** "Plan saved".
2. Hard-refresh the page. Plans tab. **Expect:** exactly one saved plan; open it; it shows the edited restaurant and arrival.
3. Sign out, sign back in. **Expect:** the plan is still there (note it if not: it is a finding, not a pass).
4. **Edit this plan** > change the restaurant again > Save. **Expect:** still one plan in Plans (updated, not duplicated).
5. Network tab: **Expect** no request carries the plan or the family's routines to the server (plans are on the device;
   only an explicit "Invite a family to this plan" would send one, and this run does not use it).

## 6. Clean-up: only the synthetic data, nothing genuine

Identify the canary data by exactly these: the two canary emails; and, for connections, `owner_id`/`guest_id` equal to
those two user ids (baseline was 0 connections, so any row is the canary's).
1. **A and B:** Families > **Disconnect** (confirm). **Expect:** both lists empty. This deletes the connection row.
2. **Supabase dashboard > Authentication > Users:** delete **only** the two canary users, one at a time, checking the email
   in the dialog. Their connections and plan invites are removed by the database's own cascade. No SQL delete is used.
3. **Verify (read-only):** `auth.users` is 3 again with the same 3 emails and ids you noted; `planning_connections`,
   `plan_invites`, `saved_places_backups`, `venue_visit_reports`, `planning_workspaces` are all 0.
4. **Browsers:** sign out and clear site data in both canary profiles (the canary family lives only there).

## 7. Detecting failure, and rolling back

**Stop and treat as a failure if any of these happens:** a signup or confirmation email does not arrive; an invitation cannot
be created or accepted; a state on a Families card is wrong; any item in section 4 is exposed; a saved plan is lost or
duplicated; a page shows an error or a blank screen; the Google check in section 8 shows any increase in photos, journeys or
probe.

**Watching.** Vercel > the project > Logs, filter status 5xx and path `/api/planning/*` during the run. Supabase Logs for
errors (I can read these with the project tool on request). After the merge, confirm the Production deployment is "Ready"
and main's CI is green before starting.

**Rollback (about one minute, no data migration involved, because this release changes no schema).**
Vercel > Deployments > the production deployment `bc19ba5` (6965864685) > ⋯ > **Promote to Production**. Then confirm the
site is the old build. Afterwards revert the squash commit on main with a GitHub "Revert" pull request (only after you
approve it). Connections made during the canary keep working under the old build. Then run section 6.

## 8. Google spending controls unchanged

1. **No code path changed:** the diff against main touches nothing under `api/`, `server/`, workflows, `vercel.json`,
   packages or env files, and the new screens add no Google call (Meet halfway is a database read; lunch uses the free
   OpenStreetMap lookup).
2. **Posture:** after the run, open `/api/places/status` again and save as `status-after.json`. **Expect:** the
   `placesBudget` object is identical to `status-before.json` (scopes allowed, caps, atomic cap, ledger requirement).
3. **Ledger (read-only):** `select usage_day, scope, sku, calls from public.google_places_usage order by usage_day desc;`
   **Expect:** photos, journeys and probe unchanged. Discovery or details may rise only if the stored cache had expired and
   only by a normal amount (a cold search is up to 9 units, as in the 9 Oct rows); anything else is a failure.
4. **Optional, free:** GitHub Actions > "Live canaries against a Preview build" > Run workflow on main with
   `assert_fail_closed` on and `posture_profile` = `production`. Set `expect_off` = `photos` only if the photo switch is
   already off in Vercel; otherwise record the posture and change nothing.

## 9. Shared plans between the two accounts (needs #197 deployed; run after sections 2 to 6)

Why this is its own section: accounts and invitations are refused on Preview deployments, so the shared-plan flow can only be
proven on production, after #197 is merged and deployed. Accounts A and B are still connected from section 2.

1. **A:** Families > B's card > **Meet halfway** > **Plan this day** > **Save & send to Canary B's family**. **Expect:** "Plan
   saved", then "Sent to Canary B's family · waiting for a reply", and no second send offered. A's Plans lists the plan with the same status.
2. **B:** Home. **Expect:** a row "Canary A's family invited you · Review" above the recommendations. Open it (or Plans > the
   invitation card). **Expect:** the whole day is readable (leave, arrive, stops) with **Accept** and **Decline**.
3. **Privacy, on screen and on the wire (B's browser).** The page must not contain "Canary Kid A", "E8" as a postcode, A's
   email, "11:15", "13:30" or the word "nap". In Network, the response of GET `/api/planning/plan-invites`: `plan_snapshot`
   has `v: 2`, `kind: "day"` and none of those strings, no `imageUrl`, and `routineInsights` / `homeAfter` empty.
4. **B:** **Accept**. **Expect:** "You're going. It's in your plans". Plans lists it under Coming up as "From Canary A's family
   · you're going"; Home now shows it as "Up next". Hard-refresh, then sign out and back in: still there.
5. **A:** Plans. **Expect:** "Canary B's family accepted". Refresh and sign back in: unchanged.
6. **Second plan:** A builds and sends another. **B: Decline.** **Expect:** A sees "Canary B's family declined" on that plan only
   (the first still says accepted); nothing was added to B's plans.
7. **Disconnecting.** A: Families > Disconnect. **Expect:** both lists empty; any invitation still waiting is gone from both
   (the database deletes invitations with the connection); B keeps the plan they accepted as their own copy, which holds
   nothing private (step 3). B's Plans and Home still load with no error. A's plan stops showing a status. Then change
   permissions on a fresh connection if you want (section 4C) and confirm nothing from step 3 changes.
8. Clean-up is section 6 unchanged: the two canary users' deletion removes their invitations by cascade.

**Stop** if: Save & send is missing or errors; the invitation does not reach B within a refresh; any string in step 3 appears;
accepting does not put the plan in B's Plans; a refresh or sign-in loses a plan or duplicates one; any page is blank or errors.

## Result

Pass only if sections 2 to 6, 8 and (for the release containing #197) 9 all pass. Then your own iPhone: open the production site in Safari, sign in with your own
account, and judge the real experience. Invitations to outside families stay on hold until you decide, after the iPhone check.

## Addendum: what the follow-up release changed that the canary should confirm

* **Six tabs** in this order, each opening its own screen: Home, Explore, Families, Halfway, Plans, Profile. Halfway opens on its answer once one family is chosen (B is the only family, so it is chosen for you), with the map above the cards.
* **Families** shows connected families and "Waiting for a reply" first, then (only while you are planning with a family) the Plan together card, then a compact household summary. Account, backup and device data are in **Profile** (section "Your data").
* **Plans** (with #197) is one list: Invitations waiting on you first, then Coming up, Past and Earlier plans; "Plan another day" is below them. **Home** leads with a waiting invitation or the next plan.
* **Plan with a nap.** In section 3 step 2, give A's profile a nap at 13:00 and build a day that is still out then: the plan should say "This plan doesn't fit a routine yet" with "Keep it as planned", never a green "home before…" line on its own.
* **Family Fit grades** (docs/FAMILY_FIT_GRADING.md): with a 3-year-old and a baby on the profile, Golders Hill Park should read
  "Likely good for Sloane…" (Good) or Excellent, with the playground named as an inference (bulb) and "We've confirmed N of M
  details" under it; a museum with nothing child-specific on record should read "Possible fit" with the exhibits named as the
  check; a place with a confirmed obstacle for your family should read "Not recommended" with the reason.
* Section 8 is unchanged: this release touches no `api/`, `server/`, workflow, `vercel.json`, package or migration file.
