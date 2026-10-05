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

### Supabase project settings required (owner action, once)

1. Authentication → Providers → Email: **Confirm email = on**.
2. Authentication → URL Configuration: **Site URL** = the production origin; **Redirect URLs** allow-list = the production origin and each Vercel preview origin (`https://*.vercel.app` pattern if wanted).
3. Authentication → Rate limits: leave the defaults; the app additionally rate-limits resend by a 30 s cooldown.
4. (Optional) Authentication → Email templates: set the "Confirm signup" and "Reset password" copy to FamilyPilot's voice.

Nothing in this change applies a migration or touches the production project.

## Code map

| Concern | File |
| --- | --- |
| Email/password validation, error classification and copy | `src/services/account/credentials.ts` |
| create / sign in / resend / reset / sign out | `src/services/account/auth-service.ts` |
| Signed-in state, the single `accountRequired()` rule | `src/stores/auth-store.ts` |
| Account screen (create, sign in, verify, forgot) | `app/(onboarding)/account.tsx` |
| Route guard: signed-out people stay on the allowed set | `useAccountGuard` in `app/_layout.tsx` |
| Entry routing (signed out → Welcome/sign-in, signed in → setup/Home, pending invite pickup) | `app/index.tsx` |
| Invite step | `app/(onboarding)/invite.tsx` |
| Recipient landing and accept | `app/invite/[code].tsx` |
| Pending invite held across the account round trip | `src/stores/pending-invite-store.ts` |
| Invite client | `src/services/planning/connection-invites.ts`, `connection-snapshot.ts`, `invite-links.ts`, `share-invite.ts` |
| Server | `api/planning/connections.js` |
| "Add another family" | `src/components/planning/ConnectedFamiliesPicker.tsx`, `PlanDraftForm.tsx` |

## Connected families

A connection is two accounts that have agreed to share a deliberately small snapshot so that a plan can work around both families.

### The invitation

* Created by a signed-in parent: **partner**, **family or friend**, or **a link to send anywhere**. Nobody is asked for an email address or a phone number.
* The link is `/invite/<code>`. The code is **256 bits of randomness**, shown once; only its **SHA-256 hash** is stored (`planning_connections.token_hash`). A leaked database cannot be turned back into working links.
* It is **single use** and **expires after 7 days**. The second person to open a used link, or anyone opening an expired one, gets "this invitation can't be used", and the preview endpoint answers `{ valid: false }` with nothing else.
* The link itself carries no name, email, child or postcode (asserted in `verify-account-journey.mjs`).

### What is visible, and when

| Moment | The other person can see |
| --- | --- |
| Opening the link, signed out | The inviter's **first name** only ("Sam's family invited you…") and the consent terms. Served by an unauthenticated `GET /api/planning/connections?preview=<code>` that returns `{ valid, inviter: { label } }`. |
| After accepting | The snapshot below, and only the snapshot. |
| Never | Addresses, children's names or birthdays, email, routines, the full profile. |

The snapshot (`snapshotForSharing`, pure and unit-tested) is: the family's **first name**, the home area **rounded to about a kilometre**, the **ages** of the children (not names or dates of birth), drive limit, budget tier and the facilities they need. It is shown to the recipient **before** they accept, in their own consent screen, and either side can disconnect later.

### Recipient journey

1. Open the link: preview, consent terms.
2. Not signed in → **Create an account to accept** (or sign in). The code is parked on the device (`pending-invite-store`) and survives the email round trip.
3. Verify the email, describe their own family, then the app returns to the invitation and offers **Accept and connect**.
4. Accept: both families now appear in each other's "Your connected families". The code is consumed; a second use fails.

### Using a connection

Create a plan → **Add another family** opens the picker: the families already connected (one tap to add them to the plan, as a chip) and **Invite someone new** (partner / family / friend → a fresh link). Pending invitations are counted, never listed with detail.

"Partner" is a **connected person, not a shared household**: two parents still each have their own account, family profile and saved places; connecting lets a plan use both families' needs. A true shared-household model (one family, two adult accounts) is a larger change and is listed as an owner decision.

## Verification

* `src/__tests__/connection-invites.test.ts` (11) and `account-and-invite-links.test.ts` (10): token entropy, hash-only storage, expiry, single use, preview exposes the label only, snapshot rounding and field allow-list, listing, removal.
* `scripts/verify-account-journey.mjs` drives the whole journey in a real browser against `dist-auth` with the in-memory GoTrue-compatible fixture (`scripts/fixtures/fixture-accounts.cjs`) and a fake Supabase admin (`fake-supabase-admin.cjs`): validation errors, "Check your email", an unverified "I've verified" is refused, the emailed link signs in, family setup, the invite step creates partner and family links, Home; then a second browser opens the link signed out, creates an account, describes a family and accepts; the used link no longer previews; the owner's Create a plan lists the connected family and offers to invite someone new. **31 of 31 checks pass.**
* A defect this found and fixed: a signed-out deep link to a tab route looped forever (the guard redirected to `/`, which resolves back into the tabs). The guard now sends people to Welcome or sign-in directly and only once per route.

Build note: the auth-enabled bundle needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at export time and `expo export --clear`, because Metro caches the inlined env.

## Not done, and why

* Social sign-in (Apple, Google): adds a vendor and App Store rules; the email path is complete without it.
* A shared-household model: a separate decision (see above).
* Phone/SMS verification: paid per message.
* Applying any Supabase setting or migration to production: owner action.
