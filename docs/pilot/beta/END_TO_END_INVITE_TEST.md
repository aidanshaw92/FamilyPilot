# The first invitation: one end-to-end test, to an address you control

9 October 2026. Run **after #191 is merged and deployed to Production**, and before any family is invited. Preview deployments cannot be used: accounts are deliberately disabled on Vercel Preview builds, so the only place this flow can be tested is Production, which is why it uses an address you control and a throwaway account.

## Order (the order matters)

1. **#191 deployed.** (Reason: the old app cannot handle an invitation link: it signs the person in with no password.)
2. **Supabase → Authentication → SMTP Settings: Enable custom SMTP.** Any transactional provider (Resend, Postmark, SendGrid, Brevo, Amazon SES) with a verified sending domain (or a verified single sender address if the provider allows it). Needed: host, port (465 or 587), username, password/API key, sender name and a sender address on the verified domain; set the DKIM/SPF records the provider gives you so mail does not land in spam. Without this, Supabase's built-in email only reaches members of your Supabase organisation and is limited to a few messages an hour, so **no family would get an invitation**. Then set the rate limit for emails (Authentication → Rate Limits) to at least 30 an hour.
3. **Authentication → URL Configuration:** Site URL `https://family-pilot-seven.vercel.app`; Redirect URLs `https://family-pilot-seven.vercel.app/**`.
4. **Authentication → Sign In / Providers → User Signups:** *Allow new users to sign up* **OFF**; *Confirm email* ON; *Allow anonymous sign-ins* OFF. **Email OTP expiry:** 86400.
5. **Invite: Authentication → Users → Invite user**, enter your own test address (a plus-address of your own mailbox works, for example `you+fp-test@yourdomain`).

## What to check, on your phone, in this order

| # | Check | Pass looks like |
|---|---|---|
| 1 | The email arrives | In the inbox (not spam) within a minute, sender name FamilyPilot, one clear link |
| 2 | Open the link on the phone | Lands on **Choose your password**, with no way past it |
| 3 | Short password | "Use at least 10 characters" |
| 4 | Valid password | Saved; moves on to describing the family |
| 5 | Finish onboarding, open Home, a venue, **Create a plan**, **Save**, reopen it | Works; the Natural History Museum and Discover show their usual detail |
| 6 | Profile → **Sign out** | Signed out |
| 7 | **Sign in** with the password | In, and the plan is still there |
| 8 | Sign out, **Forgot password**, use the emailed link | Lands on Choose your password; the new password works, the old one does not |
| 9 | Open the same email link a second time | "That link has expired or has already been used…", no session |
| 10 | A second browser or phone that you did not invite: **Create account** with another address | "FamilyPilot is by invitation for now…"; nothing created (check Authentication → Users shows no new row) |
| 11 | One of the two existing accounts signs in | Works, is not asked to choose a password |
| 12 | Repeat 1 to 7 on an iPhone in Safari **and** an Android phone in Chrome | The real-device pass; also try the link from the mail app's in-app browser |

If anything fails: **Instant Rollback** (Vercel → Deployments → the previous production deployment) and tell me what you saw. A failed invitation leaves one test account, which you can delete in Authentication → Users.

## What I do once you say it passed

Delete or keep the test account as you choose, turn `EXPO_PUBLIC_CLIENT_ERRORS=on` on (you set it, then redeploy), publish the approved wave-1 batch only on your authorisation, and prepare the first five invitations.
