# What you personally need to do in Vercel and Supabase, in order

9 October 2026. Everything else is done by me. I cannot read or change Vercel (403) or the Supabase dashboard settings from here.

| # | Where | Action | When | Why |
|---|---|---|---|---|
| 1 | Vercel → family-pilot → Settings → Environment Variables | `GOOGLE_PLACES_PHOTOS_ENABLED` = `false` for **Production and Preview**; then **redeploy** | Now | Stops paid photo calls. Today's ledger still shows 44 photo calls (06:27 UTC), so it is **not** active yet. Tell me when done and I run the canary |
| 2 | Same page | **Recommended:** `GOOGLE_PLACES_DETAILS_ENABLED` = `false` for Production and Preview, in the same redeploy | Now | Your success criterion is "no new paid Place Details calls". One was bought today (06:25 UTC) when someone opened a venue whose stored copy was over 7 days old. With it off, a venue page is served from the stored copy (up to 30 days old) and says it was not refreshed; **the Natural History Museum's stored copy is 28 days old and crosses 30 on about 13 October**, after which its page would say "Live venue details are unavailable" unless Home's search refreshes it first (it usually does, and that is how 8 pilot venues were refreshed this morning). Your call; I would turn it off and watch NHM |
| 3 | GitHub #191 | Approve **merge** of `e2a7a61` (mark ready, merge). Vercel then deploys it to Production by itself | After you read the approval request | Needed before any invitation |
| 4 | Supabase → Authentication → **SMTP Settings** | **Enable custom SMTP** (provider, host, port, user, password, sender on a domain you verified; add the provider's DKIM/SPF DNS records) | After 3 | Otherwise no family receives an invitation (see `END_TO_END_INVITE_TEST.md`) |
| 5 | Authentication → **Rate Limits** | emails per hour: at least 30 | After 4 | Ten invitations plus resets |
| 6 | Authentication → **URL Configuration** | Site URL `https://family-pilot-seven.vercel.app`; Redirect URL `https://family-pilot-seven.vercel.app/**` | After 3 | Invitation and reset links return to the app |
| 7 | Authentication → **Sign In / Providers → User Signups** | *Allow new users to sign up* **off**; *Confirm email* on; *anonymous sign-ins* off; **Email OTP expiry** 86400 | After 3 and 4 | Invitation-only |
| 8 | Authentication → Users → **Invite user** | Your own test address | After 7 | The one end-to-end test |
| 9 | Phones | The checks in `END_TO_END_INVITE_TEST.md` on an iPhone and an Android | After 8 | Real-device pass |
| 10 | Vercel | `EXPO_PUBLIC_CLIENT_ERRORS` = `on` (Production), redeploy | After 9 passes | Crash log during the beta |

Already correct and **not** to be changed: Confirm email is on, anonymous sign-ins are off, Row Level Security is on for every table.

If the first invitation test fails, **Vercel → Deployments → previous production deployment → Instant Rollback**, and tell me what you saw.
