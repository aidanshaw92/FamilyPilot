# PR #191 (inert integration): verified merge candidate

9 October 2026. Candidate: `pilot/integration-inert` @ `77431e2`, draft, based on `main` `b74a4c8`. **Not merged, not deployed.** Awaiting your approval of exactly this commit.

## Verified on this exact commit

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | clean |
| Full production build (`expo export`) | succeeds |
| Full test suite, with the build present | **3383 of 3383 pass**, including the three static-route checks that need a build |
| **Flags off preserves today's recommendations** | Home output for 14 households × 2 evidence states (headline, reasons, to-check lists, cautions, factors, score and order for each venue): **byte-identical to `main`** (115,757 bytes, `cmp` equal) |
| **No unreviewed pilot data in the shipped bundle** | The 218 proposed pilot strings (our paraphrases and the stored quotations, from the two proposed data files and the 99-item review queue) are searched for in all 58 bundle files: **0 found**. Positive control: 42 of 49 strings from `main`'s own data file *are* found by the same scan, so the scan works. `src/data/` is identical to `main`. No `EXPO_PUBLIC_FAMILY_FIT_V2` flag text is present (unset flags compile away) |
| **No production data changes on deployment** | The diff against `main` has **no migration, no `vercel.json` or cron change, no seed or build step that writes**. Changed server files only read claims (`claims-store`, `consumer-projection`, `official-hours`, `venue-rules`) and change nothing until a rule or hours claim exists. The one changed API function is `feedback.js`: a new branch that logs a scrubbed line and writes nothing |
| **Invitation, password and recovery** | 40 checks in a real browser against real Supabase Auth (GoTrue): `AUTH_VERIFICATION.md` |
| Choose-password screen | Seen in the browser (`03-choose-password`), at 390 px, on this candidate |
| CI on the PR head | `privilege-model` green; `build-and-test` and `capture` were still running when I wrote this. I will report them before you decide |

## What this PR changes for a family (everything else is identical to `main`)

1. An invited family must choose a password before using the app (new screen); used or expired links say so and point to Forgot password.
2. A stranger who tries "Create account" (once sign-ups are off in Supabase) sees the invitation-only message.
3. A mobility-aid household's *unknown* wheelchair/step-free access is "needs checking" in Meet Halfway and the single-venue planner (it excluded the venue before). A confirmed no still refuses.
4. Rules and hours the app already knows how to read can start to apply **only after** a person-approved batch is published (nothing is published by merging).
5. Crash reports exist but send nothing unless a build sets `EXPO_PUBLIC_CLIENT_ERRORS=on`.

## Crash reporter: privacy, authentication, rate limiting, abuse

| Question | Answer (tested: `client-error-reporting.test.ts`, `client-error-endpoint.test.ts`) |
|---|---|
| Can it carry a child's name, parent name, family name, home area or postcode? | The device replaces every name in the profile, the home location and the account email (and each word of them) with `[private]` **before** sending, whole words only; the server then scrubs emails, tokens, long ids/keys, coordinates, postcodes and dates again |
| A date of birth? | Any date shape (`2024-06-15`, `15/06/2024`, `15 June 2024`) becomes `[date]` on the server |
| Tokens, invitation codes, venue ids in the route? | The route is sent without the query string, and what follows `/venue/`, `/restaurant/`, `/invite/` or a venue/uuid id is replaced with `[id]`; long key-like strings and JWTs are replaced |
| Home address? | The app never holds one (area or postcode only), and both are scrubbed as above |
| Who may send? | A signed-in, non-anonymous account only (same check as the other feedback calls). Unsigned, anonymous or unknown token: 401 |
| What is stored? | Nothing. One log line, `client-error {…}`, without the account id. Allow-listed fields only; a report cannot add fields |
| Rate limiting and abuse | 5 distinct reports per session on the device; the server logs at most 10 a minute per account **per function instance** (best effort, enough to stop a loop filling the logs; each report is capped at about 1.5 KB). Because accounts are invitation-only the abuse surface is the invited families |
| Residual risk | A name the family never typed into the profile (a friend's name in a plan title, for example) is not known to the scrubber. Messages are generic error text in practice, and the report holds no plan content, but this is the one case I cannot rule out |

## Beta safeguards on the shared production database (Priority 7)

| Safeguard | Verified how | Result |
|---|---|---|
| Invitation-only authentication | Real GoTrue, sign-ups off | Invitations and recovery work; strangers refused (`AUTH_VERIFICATION.md`). **Pending: the hosted dashboard settings and custom SMTP** |
| Row-level security | Production policies read (read-only) | All five user tables have RLS on. `planning_workspaces` and `saved_places_backups`: owner-only policies for `authenticated`, no `anon` grant. `planning_connections`, `plan_invites`, `venue_visit_reports`: RLS on with **no policy and no grant to `anon` or `authenticated`**, so only the server functions can touch them. Venue tables are public-read |
| Isolation between accounts | The same policies and grants rebuilt on a throwaway database, two users (`scripts/real-auth/rls-isolation.sql`) | **14 of 14**: B sees none of A's rows, cannot update, delete or insert as A; cannot read the three server-only tables at all; a signed-out visitor reads nothing; A's rows are unchanged afterwards |
| Family profiles and children | The profile (names, dates of birth, postcode) is device-only: the earlier network-inspection run read every request body to the auth and planning backends across sign-up, sign-in and invitations and found none of them. The only cloud copy is the **opt-in** backup button, which writes to the owner-only table above | Isolated by design and by policy. Nothing about children reaches another account: connections carry a first-name label and rounded area only (`safeSnapshot`, tested) |
| Error reporting without sensitive data | Tests above | See table |
| Rollback of code | Vercel Instant Rollback (previous production deployment) | Not tested from here: I have no Vercel access (403 on deployments and env). It is a documented, standard action, and no migration is involved so nothing needs reversing in the database |
| Rollback of published data | `rollback.sql` per batch | Rehearsed: 14 checks (`PUBLISHING_PROCESS.md`); Step 1 rollback tested |
| Controlled access to pilot features | Flags are build-time and unset; the pilot data files are not in the bundle | Nothing pilot-only is reachable. Rules and hours exist only as claims, and only a `human:` approver's claims are used |
| Google API usage monitoring | `monitoring.sql` block 1; canary workflow | Ready. **Photo switch not yet confirmed** |
| Working recommendations and saved plans | 3383 tests; Home identical to `main`; the ten-venue journeys passed at 360 and 393 px incl. save and reopen (`SCENARIO_RESULTS.md`) | Pass |
| Real-device compatibility | — | **Not done: I have no devices.** A person must run the protocol in `BETA_OPERATIONS.md` |
