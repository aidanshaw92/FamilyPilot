# Invitation, password and recovery: verified in a real browser against real Supabase Auth

9 October 2026. **Nothing in production Supabase was read, written or changed for this.** I could not test against your hosted project without creating real accounts in it, so I ran the same open-source auth server Supabase hosts (GoTrue, `github.com/supabase/auth` at `ce9a8ee`, built from source) on a local database, configured the way production is meant to be, with email going to a local SMTP sink and every link in it followed in Chromium (390×844) exactly as a person would. The build under test is the #191 candidate. Script: `familypilot/scripts/verify-real-auth.mjs`; harness: `familypilot/scripts/real-auth/` (`gotrue.env.sh`, `proxy.mjs`, `smtp-sink.py`).

## Result: 40 of 40 checks pass (after fixing two blockers the test found)

| # | Your step | Result |
|---|---|---|
| 1 | An administrator invites a family | Pass. The invitation API (what **Authentication → Users → Invite user** calls) succeeds with public sign-ups **off** |
| 2 | The family opens the invitation link | Pass. The email carries a `type=invite` verify link; following it signs the person in and lands in the app |
| 3 | The user is required to choose a password | Pass. "Choose your password" is shown; going to `/`, or a deep link to a tab, does **not** skip it; a short password is refused ("Use at least 10 characters"); Back is hidden |
| 4 | The password is saved | Pass. The account records `password_set = true`; the step never shows again |
| 5 | Sign out | Pass |
| 6 | Sign back in | Pass. Wrong password refused ("That email and password don't match"); chosen password works |
| 7 | Password reset works again | Pass. "Forgot password" gives the same message whether or not the address exists; the link lands on "Choose your password"; the **new** password works and the **old** one no longer does |
| 8 | Expired, reused and invalid links fail safely | Pass for all four: invitation reused; reset link reused; reset link past its expiry (aged in the database); made-up token; forged token in the address bar. Each lands on **Welcome back** with "That link has expired or has already been used. Sign in, or choose 'Forgot password' and we will send a new one."; no password screen, no session, no page error |
| 9 | An uninvited user cannot register | Pass. The API returns `422 signup_disabled`; the app says "FamilyPilot is by invitation for now…"; no account row is created |
| 10 | Existing accounts remain accessible | Pass. An account created before sign-ups were closed signs in with a real session, is not asked to choose a password, and can still reset its password |

## Two real blockers this found (both fixed on the branches)

1. **An invitation link did not require a password.** Last time's fix only handled the *reset* link (a `PASSWORD_RECOVERY` event). Supabase's invitation link signs the person in with no such event, so an invited family would have been in the app with a password nobody knew. Now an account that was invited and has no `password_set` record is held on the step, including after a reload.
2. **A used or expired link dropped the person on Welcome with no explanation** (Supabase reports it only in the address bar). The app now reads it and says so on the sign-in screen.

Also corrected: the "by invitation" message told people to use Forgot password; it now says to open the invitation link first.

## Exact Supabase settings (please do not change anything until you have read the SMTP item)

| Where in the dashboard | Setting |
|---|---|
| Authentication → Sign In / Providers → **User Signups** | **Allow new users to sign up: OFF** (tested: invitations and recovery still work) |
| Same page | **Confirm email: ON** (already); **Allow anonymous sign-ins: OFF** (already) |
| Authentication → URL Configuration | **Site URL:** `https://family-pilot-seven.vercel.app` (an invitation sent from the dashboard returns to the Site URL). **Redirect URLs:** `https://family-pilot-seven.vercel.app/**` (the app sends reset links back to `/`) |
| Authentication → Emails → Invite user, Reset password | The default templates work as tested (they use `{{ .ConfirmationURL }}`). Do not remove that variable |
| Authentication → Sign In / Providers → Email → **Email OTP expiry** | Set to **86400** (24 hours). Default is one hour, which is short for a family who opens the email in the evening. An expired link is safe (tested), just annoying |
| Authentication → Rate limits | Leave the defaults |
| Authentication → Password security | Leaked-password protection on if your plan allows it |

### The one thing I cannot verify and think is the most likely real problem: email delivery

Supabase's **built-in email service only delivers to members of your Supabase organisation** and is heavily rate-limited (a few messages an hour). The two existing accounts work, but they are probably yours. **Invitations and reset links to ten unrelated families will not arrive unless Authentication → SMTP Settings has a custom SMTP provider enabled.** Please check that page; if "Enable custom SMTP" is off, setting one up (any transactional email provider, free tier is plenty for 30 families) is a prerequisite, and I would then send one real invitation to an address you control before inviting anyone. I cannot see that setting from here.

### Known limits of this test

- It used the open-source auth server at today's version; the hosted service may be a version behind, and I have not seen its dashboard.
- A corporate or phone mail scanner can open a one-time link before the family does, which then reads as "already used". The app says what to do (Forgot password), and that path was tested, so this is a nuisance not a lockout.
- Email delivery and real devices are outside this test (see above, and `BETA_OPERATIONS.md`).
