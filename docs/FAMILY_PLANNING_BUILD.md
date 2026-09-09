# FamilyPilot: family planning build and launch guide

Updated 9 September 2026. Product direction explicitly expanded by Aidan in this conversation.

## Purpose

The first place parents go to arrange a plan that works for their family and the families they are meeting. Answer: where can we go, what practical facilities are confirmed, where can we eat, when should each family leave, and can everyone be home for the routines they choose?

One evolving family profile should ultimately power all recommendations. No booking checkout, social feed, public child profiles, invented suitability, or commission-driven ranking.

## Implemented in this update

| Capability | Behaviour | Limit |
|---|---|---|
| Plans tab | Replaces the mock Trips screen; linked from Home | Requires configured live Places for real recommendations |
| Family setup | Town/postcode lookup, ages, buggy, budget preference, drive limit, required facilities | UK lookup; town search needs Google Geocoding |
| Routine-aware scheduling | Multiple daily nap/feed windows, duration and home/out flags; earliest departure and home deadline | Same-day planning; entered times are flexible preferences, not medical advice |
| Shared meeting time | Every family arrives for a common activity; computes their individual departures/returns | Up to six selected families; road return estimates are explicit |
| Fair meeting suggestions | Search from each family's area; satisfy all hard constraints; rank fit and journey fairness | Searches at most 60 candidate places; not exhaustive global optimisation |
| Trusted facility matching | Required toilets, baby changing, parking and buggy access | Unknown requirements exclude; no category-based inference |
| Age suitability | All children must be within a confirmed age range | Infant accompaniment needs evidence; no assumption that toddler suitability covers babies |
| Nearby food | Real nearby restaurants/cafés ranked using confirmed facilities and proximity | No claims about menus, highchairs or allergy safety without evidence |
| Add lunch | Add 45-minute lunch plus transfer allowance; recalculate departures and home times | Directions and return travel estimated; restaurant availability needs checking |
| Saved plans | Save/delete, replan, packing checklist, share summary | Device-local snapshots; recheck before leaving |
| Account | Sign-up, sign-in, recovery, sign-out | Supabase client settings and email delivery required |
| Private cloud backup | Explicit upload and restore, with replace confirmation on restore | Manual backup; not automatic conflict-resolving sync |
| Friend connections | One-use random code, SHA-256 stored token, seven-day expiry, authenticated accept, revoke | Both parents use an account; codes are manually shared |
| Consent | Share ages/preferences/approximate area; optional anonymous home busy windows | Shared data is a snapshot; copied data cannot be recalled |
| Privacy | No routine details or home locations in plan summaries; owner-scoped backups | Existing device profile data remains separate from cloud account |
| Honest photography | Only the venue's supplied photo; unavailable state on failure | No stock image impersonates a venue |

## What was provisioned

The `family_planning_workspaces` migration was applied to the connected FamilyPilot Supabase project. Its checked-in version matches remote migration history: `20260909182317`.

- `planning_workspaces`: private JSON planning backup, keyed by authenticated user ID; SELECT/INSERT/UPDATE/DELETE ownership policies.
- `planning_connections`: server-only invitation and consented snapshot records; no direct anonymous or authenticated table access.
- No existing venue data or user accounts were deleted.
- A transaction test created temporary test owners and backups, verified owner isolation and direct connection denial, and rolled the test data back.
- Security advisor reports no-policy INFO for `planning_connections` by design: this is a server-only table with privileges revoked. See [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## What Aidan needs to enable

### 1. Configure Vercel for the existing project

In the project's environment settings, add/check these for Preview and Production, then redeploy the reviewed branch. Do not paste private keys into chat or commit them.

| Variable | Where to obtain it | Exposure |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project API URL | Public client configuration |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Connect/API keys: publishable key | Public client key; protected by RLS |
| `SUPABASE_URL` | Same project API URL | Server |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | Supabase secret API key | Server only; never EXPO_PUBLIC |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Maps credentials, with Geocoding and supported journey API enabled | Server only |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Places credentials | Server only |
| `PLACES_PROVIDER=google` | Already specified in vercel.json | Server |

The existing app supports the legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` as a fallback, but publishable is preferred. Web APIs use the same deployment origin. Native builds also need absolute `EXPO_PUBLIC_PLANNING_API_URL`, `EXPO_PUBLIC_PLACES_API_URL`, and `EXPO_PUBLIC_CONTEXT_API_URL`, ending in their `/api/...` paths.

A full UK postcode can use Postcodes.io without a Google geocoding key. Town lookup deliberately fails with an actionable message instead of substituting Bushey. Google billing/API availability still needs checking in the owner's account. The existing journey provider uses the legacy Distance Matrix API; new Google projects may need a migration to Routes before reliable provider journeys work. Fallback times remain estimates.

### 2. Configure Supabase authentication

- Enable email/password sign-in and email confirmation.
- Set the Site URL to the intended FamilyPilot domain.
- Add the exact test and production `/trips` URLs to allowed redirects for password recovery.
- Configure a reliable email sender for real parent testing. Test confirmation and recovery with two controlled accounts.
- Confirm the publishable key belongs to the same project as the server service key.
- Do not disable confirmation or RLS to make a failing flow appear to work.

Official references: [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 3. Build a trustworthy launch-area catalogue

The inspected database had 17 cached place records, 15 venue metadata rows and 12 claim rows. Those counts do not mean 17 fully verified recommendations. There were many draft/evidence records awaiting or requiring review.

For an initial Bushey/Watford/Elstree pilot, prioritise 20–30 genuinely useful places plus nearby food. Each recommended place needs official evidence for its important facts: age range, baby changing, pushchair access/terrain, toilets, parking, setting and current visiting information. Review existing drafts in the enrichment console. AI drafts must not automatically become trusted facts.

For each claim retain source URL, excerpt, checked date, expiry/recheck policy, reviewer and yes/no/unknown status. A parent's report is a lead for review, not an automatic override. Do not mark unchecked facilities as confirmed just to increase results.

### 4. Run an actual parent pilot before public launch

Use two controlled accounts and at least two real devices. Complete setup, create a routine, connect by code, create a shared plan, add lunch, save, refresh, restore on another device, recover a password and disconnect. Check place opening hours and journey reality against the plan. Start with a small invited group, then collect structured parent feedback.

The code has not undergone browser/device end-to-end QA in this turn. A successful export and unit test suite are not equivalent to that test.

## Acceptance cases for release

1. A place with unknown baby changing cannot appear when any family requires it.
2. Every child is covered by the confirmed suitability range.
3. No proposed absence overlaps a required home routine; an impossible plan explains the no-match result.
4. Each family's outbound and return travel is within its limit, including asymmetric returns.
5. A late start today cannot yield a departure in the past.
6. Adding lunch recalculates and may reject a previously feasible plan.
7. A connected parent's data is only visible after valid one-use invitation acceptance.
8. User A cannot select, overwrite or delete user B's private workspace.
9. Revoked/expired invitations cannot be accepted; simultaneous accepts cannot both succeed.
10. Changing inputs marks existing results stale until recalculated.
11. Saved plans retain their date and timing; summaries omit home coordinates, child ages and routine details.
12. Missing providers, auth configuration and unknown venue facts show honest states rather than demo recommendations.

## Remaining work before calling this production-ready

- Automatic cross-device synchronisation and conflict resolution; unify planning family settings with the existing profile rather than maintaining an initial imported planning copy.
- Refresh consented friend snapshots and availability without needing a fresh connection; reconnect/revoke currently works with snapshots.
- Verify venue and restaurant opening windows for the actual visit date, holiday exceptions, booking availability and closure notices. Current UI explicitly requires confirmation.
- UK-time-zone-aware scheduling for travellers; the current clock is the device's local clock and the feature is UK-focused.
- Traffic-aware, directional journeys for the actual departure and return time; migrate legacy Google API if the project cannot use it.
- Weather/heat/rain alternatives using verified weather. The fabricated Home weather fallback was removed; missing weather is now unavailable.
- App-wide account deletion/export and retention controls, appropriate privacy notice and consent review, rate limiting/CAPTCHA/abuse monitoring, production error monitoring and backup recovery tests.
- Broader accessibility/SEND/dietary requirements with factual per-field evidence; no generic 'safe' or diagnosis-based suitability claims.
- Structured accessibility and usability testing on phone/tablet/desktop, slow networks, enlarged text and assistive technologies.
- iOS/Android signing, deep-link configuration, store listings and store review if distributing native apps. This update produces the web app, not a submitted App Store release.

## Product priorities after the pilot

1. One-tap repeat plans and a 'leave by' reminder that parents explicitly enable.
2. Explainable rainy-day alternative that preserves routines and both families' requirements.
3. Collaborative proposal/acceptance for a plan, without creating a social feed.
4. Evidence-backed restaurant needs: highchairs, children's menus, buggy space, quiet areas.
5. Parent 'report a changed facility' flow routed to review; preserve factual history.
6. Calendar export and share links containing only public plan information.
7. Personalised packing based on chosen activity and confirmed weather.

No feature should add false certainty. Success means parents can decide confidently with less effort, not that every search returns three options.

## Verified results

- 308 tests across 31 suites passed after serialising shared fixtures.
- Application type check passed.
- Web export passed with 47 routes.
- Server endpoint JavaScript syntax checks passed.
- Database owner-isolation transaction passed and was rolled back.
- Live Vercel configuration and browser/device interaction remain unverified. Vercel connection was confirmed, but its callable tools were not exposed in this session at the time of saving.

## Verification commands

From `familypilot/`:

- `npm run typecheck:app` — checks application code; excludes legacy test source and the separately executed Deno edge function.
- `npm test -- src/__tests__/planning.test.ts src/__tests__/day-request-matcher.test.ts src/__tests__/proactive-day-request.test.ts`
- `npm run build:web`

The original `npm run typecheck` is retained. Its remaining diagnostics concern pre-existing test typings and Deno runtime declarations; they are not silently suppressed. Browser tests and real account/provider integration remain a release gate. Legacy enrichment suites share filesystem fixtures; test files now run serially to prevent cross-suite corruption. Run route tests after the web export completes, not concurrently with it.
