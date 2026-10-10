# Beta evidence release, 9 October 2026: what was done and what was verified

Founder approval: GO, 9 Oct 2026 (controlled release of the 28-claim batch and the pricing/activity code). Nothing beyond that approval was changed.

## Production actions (in order)
1. **PR #193** opened from `data/beta-pricing-zoo-science` at `697763e`; CI: build-and-test, privilege-model, capture (visual regression on the fixture, no Google spend) and Vercel preview all green.
2. **Claims batch applied** to production as one guarded transaction: `claims/apply.sql` from `pilot/working-product` at `6de3395` (sha256 `68853d9c…`). Result: **28 active batch rows**. Independent check: an md5 digest over every stored field of the 28 rows (`6bcd2458e41cfdbb3852f1324c19eb30`) matches the digest of the rows parsed from the approved file. Provenance as approved: 15 rows `human:aidan` (founder-reviewed), 13 rows `source_verified_ai_v1` / `ai_assisted_source_verification` (AI-assisted, not human-reviewed, not a passed control check).
3. **PR #193 merged** at the approved head (`expectedHeadSha` enforced) as `bc19ba5`; its tree is identical to `697763e`. Main CI green after the merge.
4. **Vercel production deployment** of `bc19ba5`: "Deployment has completed" (16:34 UTC).
5. **Google spending posture canary** (`live-canaries.yml`, production profile, `expect_off=photos`) against the deployed build: reachable; every paid scope fail-closed as required; photographs refusing. The spend ledger shows no new reservations (last row touched 06:27 UTC, before any of this).

## Live venue readiness (production claims + deployed code tree)
READY: Royal Air Force Museum London, Horniman Museum and Gardens, London Zoo, Science Museum. NOT READY: Discover Children's Story Centre (cost: admission price not verifiable). See `live-readiness-production.json`.

## Parent journey on the released bundle
The production site is not reachable from this sandbox, so the released code (`697763e` tree, exported with `expo export --clear`) was served locally with a fixture that carries production's **actual 55 active claims for the ten pilot venues** (`production-active-claims-10-venues.json`, exported read-only on 10 Oct 06:39 UTC) projected through the deployed code's own claim projection, and the repo's in-memory account backend. No provider, Google or external host was contacted (asserted per run).

For five households (preschooler and baby; baby only; school age; buggy required; toddler with a mobility aid), each in a real Chromium at 390×844:
sign-in → Home → Explore → Venue Detail (all five venues) → Create a plan → Plan → Save → Saved plan ("Plan saved / View plan / Add to calendar", `/saved-plan?id=…`) → Plans tab. **5 of 5 complete, 0 page errors.** `parent-journey-summary.json`, `screens/`.

What parents see (checked in the rendered text):
- Science Museum: Parking "None on site"; Blue Badge parking "A few spaces on Exhibition Road; 4 hours, 08.30 to 18.30"; Accessible toilet "On site"; Toilets still to be checked (never inferred from accessible toilets); Free entry; The Garden "recommended for 3 to 6, for Mia's age" (4) and not for a 1-year-old; closures 24–26 Dec listed.
- Discover: Parking "None on site"; Blue Badge "Bays nearby, not on site: Bridge Terrace, off Bridge Road"; Toilets "On site"; "Price not confirmed"; the pushchair rule and the Christmas and New Year closures listed.
- Horniman: Parking "None on site"; Blue Badge "Limited bays on site"; toilets, accessible toilet, baby changing confirmed; Free entry.
- London Zoo: Parking "On site"; Accessible toilet "On site"; Toilets still to be checked; ZooTown "for Cal's age" (7) and "check Dee" (10); a 22-month-old is counted, a newborn would not be. With real dates of birth: "About £74.80 to £93.10 to get in, depending on the day" with the four day-type tiers (`targeted-checks.json`). Without a real date of birth the app declines to price a child rather than guess ("We do not know Mia's age on the day"), by design.
- RAF Museum: toilets, baby changing, parking, accessible toilet, wheelchair access confirmed; Free entry.
- Plan Travel section for the mobility-aid household at the Science Museum, Horniman and Discover: "Parking: None on site"; "Check before you go" says plainly that wheelchair/step-free access (and toilets, where asked for) are not confirmed.

## Accounts and privacy
`verify-account-qa.mjs` on the released bundle with its in-memory account fixture: **33 of 33 passed** (create account, email verification, returning sign-in, wrong password refused without saying which half was wrong, sign-out, signed-out deep link blocked, expired invitation shows nobody, children appear only as ages). `account-qa.txt`.

## Limits of this verification
- Not run against the live URL from here (sandbox cannot reach it); the owner's phone check is the live-URL test.
- Science Museum parking and Blue Badge claims remain "verified from recorded source"; a person should confirm the getting-here page before the 7 Nov renewal.
- Discover's price stays Unknown: four ready venues, not five.
