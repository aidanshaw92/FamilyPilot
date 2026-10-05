# Accounts and connected families

Every FamilyPilot user has an account. The journey is:

```
Welcome → Get started → Create account (email + password) → verify email → describe the family
        → "Who do you plan days out with?" (optional) → Home
```

Someone arriving from an invitation link takes the same path with the link carried through it, and accepts at the end.

## Decisions (and why)

| Question | Decision | Why |
| --- | --- | --- |
| Which auth method? | Supabase Auth, **email + password**, address confirmed by link | It is what the project already runs (`@supabase/supabase-js` is already the client, and the connections API already authenticates each call with `auth.getUser(token)`), needs no new vendor, and a parent can do it in a minute. A magic-link-only flow was rejected: it cannot be finished on a phone that opens the email in a different app than the browser tab. |
| Is it skippable? | No. A signed-out visitor can see Welcome, the account screens, an invitation landing and About, nothing else. | "Mandatory account creation" is the brief. Deep links to a tab, a venue or a plan go back to Welcome (or to sign-in for someone who has already set up a family on this device). |
| What does the account hold? | An email address and a password hash, in Supabase Auth. Nothing else. | Children's names, dates of birth, routines and the home area stay on the device (the existing `familypilot-family-v1` store). No sensitive child information is uploaded to create an account. |
| Verification | Supabase "Confirm email" ON. "Check your email" shows the masked address, a 30 second resend cooldown and "I've verified". Following the link in the same browser signs the person in by itself. | A verified address is what makes an invitation or a connection trustworthy. Without it anyone could register as anyone. |
| When there is no auth backend | `accountRequired()` is `isSupabaseConfigured`. A build with no Supabase URL/key (local, the fixture server, CI) behaves exactly as before accounts. | Every visual and behavioural check keeps running with no backend. A deployed build always has Supabase configured, so `disabled` never reaches a parent. |

### Supabase Auth: the exact dashboard actions (owner action; nothing here can be done from the repository)

Verified-email accounts are mandatory (owner decision). **Do not switch "Confirm email" off to make testing easier.** The test suite does not need it off: CI and the browser verifiers run against an in-memory GoTrue fixture, never the real project.

Where: Supabase dashboard → the FamilyPilot project → **Authentication**.

| # | Page | Setting | Value |
| --- | --- | --- | --- |
| 1 | Sign In / Providers → **Email** | **Enable Email provider** | On |
| 2 | Sign In / Providers → Email | **Confirm email** | **On** (this is the verification requirement) |
| 3 | Sign In / Providers → Email | **Secure email change** | On (default) |
| 4 | Sign In / Providers → Email | **Minimum password length** | **10** (the app already refuses fewer than 10 characters; this makes the server agree) |
| 5 | Sign In / Providers | **Allow new users to sign up** | On |
| 6 | Sign In / Providers | **Allow anonymous sign-ins** | **Off** (the connections API rejects anonymous users; leaving it off removes a way to mint throw-away accounts) |
| 7 | **URL Configuration** | **Site URL** | `https://family-pilot-seven.vercel.app` |
| 8 | URL Configuration | **Redirect URLs** (allow-list) | `https://family-pilot-seven.vercel.app/**` |
| 9 | URL Configuration | Redirect URLs, **only if** you want to test real sign-up on a Vercel Preview | `https://family-pilot-*-aidanshaw92s-projects.vercel.app/**` (matches the per-deployment and per-branch preview hosts; the current PR #159 preview is `family-pilot-git-claude-familypilo-a833f0-aidanshaw92s-projects.vercel.app`). See the note below before adding it. |
| 10 | **SMTP Settings** | **Custom SMTP** | Configure before launch (Resend, Postmark, SES or similar; sender such as `accounts@<your domain>`). Supabase's built-in sender is for trying things out: it only delivers to project members and is limited to a handful of emails an hour, so real parents would not receive verification links. |
| 11 | **Rate Limits** | Defaults | Leave. The app also enforces a 30 s resend cooldown. |
| 12 | **Email Templates** → Confirm signup | Optional | FamilyPilot voice. Keep the `{{ .ConfirmationURL }}` link. |

What the app sends: `emailRedirectTo = <window.location.origin>/`, so the redirect must be allow-listed for every origin that is allowed to create accounts, otherwise Supabase falls back to the Site URL and the person lands on production.

Notes:

* **Previews and accounts (row 9).** There is one Supabase project. A sign-up on a Preview creates a real account in it, so add row 9 only if you deliberately want that. Without it, a Preview build with the Supabase variables set will send verification links to the production site, and with the variables unset (below) the Preview simply has no accounts, which is also zero-spend and zero-risk. Previews must keep Places disabled either way; accounts do not call Google.
* **Vercel environment variables.** The client reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable/anon key, never the service-role key). Production needs both or `accountRequired()` is false and accounts silently disappear from the deployed app. The server needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the connections API. The Vercel integration available to this session could not list project environment variables (403), so this has **not** been verified from here: check Vercel → Project → Settings → Environment Variables, or run `node familypilot/scripts/verify-client-config.mjs` against the production URL.
* **CAPTCHA (Authentication → Attack Protection).** Do not enable it yet: the client has no CAPTCHA widget, so turning it on would block every sign-up. It is a candidate for a later slice if account abuse appears.
* **Leaked-password protection** (Attack Protection) is plan-dependent; turn it on if the plan offers it.
* No credentials are stored in this repository and none were invented for this change.

Nothing in this change applies a migration or touches the production project.

"Partner" is a **connected person, not a shared household**: two parents still each have their own account, family profile and saved places; connecting lets a plan use both families' needs. Shared household ownership and synchronisation are explicitly **not** part of this work (owner decision): each parent keeps a device-only family profile, children's dates of birth and routines are never uploaded because an account exists, and a connection carries only the consented snapshot below.

## Verification

* `src/__tests__/connection-invites.test.ts` (11) and `account-and-invite-links.test.ts` (10): token entropy, hash-only storage, expiry, single use, preview exposes the label only, snapshot rounding and field allow-list, listing, removal.
* `scripts/verify-account-journey.mjs` drives the whole journey in a real browser against `dist-auth` with the in-memory GoTrue-compatible fixture (`scripts/fixtures/fixture-accounts.cjs`) and a fake Supabase admin (`fake-supabase-admin.cjs`): validation errors, "Check your email", an unverified "I've verified" is refused, the emailed link signs in, family setup, the invite step creates partner and family links, Home; then a second browser opens the link signed out, creates an account, describes a family and accepts; the used link no longer previews; the owner's Create a plan lists the connected family and offers to invite someone new. **31 of 31 checks pass.**
* A defect this found and fixed: a signed-out deep link to a tab route looped forever (the guard redirected to `/`, which resolves back into the tabs). The guard now sends people to Welcome or sign-in directly and only once per route.

Build note: the auth-enabled bundle needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at export time and `expo export --clear`, because Metro caches the inlined env.

### What a connection carries (and what verify-account-qa proves)

The client builds the snapshot itself (`src/services/planning/connection-snapshot.ts`) and sends only: first-name label ("Alex's family"), an area word (a postcode is cut to its outward part, a street address to its neighbourhood), latitude/longitude rounded on the device to about a kilometre, children's **ages**, drive limit, budget tier, pushchair yes/no, needed facilities, the relationship label and, only if the person ticks it, home-time windows. The server re-applies the same allow-list and rounding. Before this change the client posted the whole planning shape (exact coordinates, the typed home text, routines); the server discarded the extras but they had still left the device, and `verify-account-qa.mjs` caught it.

The one place the full postcode necessarily travels is `/api/planning/location`, the stateless postcode-to-coordinates lookup (it forwards to postcodes.io, touches no database and stores nothing).

`scripts/verify-account-qa.mjs` (QA of: new account, email verification, returning sign-in, wrong password, sign-out, signed-out deep link, expired invitation, expired row shown as expired with Remove, live row with Cancel, cancelled link dead at once, accepted invitation, reused invitation, a third person opening a used link, declined ("Not now", link stays usable), an existing connected person, Add another family; plus an inspection of every request body sent to the backend: no child name, no date of birth, no full postcode stored or shared, no `members`/`routines`/profile, children as ages only) passes in full.

## Not done, and why

* Social sign-in (Apple, Google): adds a vendor and App Store rules; the email path is complete without it.
* A shared-household model: a separate decision (see above).
* Phone/SMS verification: paid per message.
* Applying any Supabase setting or migration to production: owner action.
