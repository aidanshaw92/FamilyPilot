# Google key usage, and proving the photo switch took effect

2026-10-08. A companion to `GOOGLE_PHOTO_SPEND_VERIFICATION.md` §8, which has the dashboard steps. This adds two things:

- what the key is actually used for, which decides which restrictions are safe;
- a free check that proves the photo switch reached the running build.

Nothing here changes any setting.

## 1. Production today

From the posture canary run against production at 07:36 UTC on 8 October (run 37744481959, no provider request):

| Scope | Allowed | Why |
| --- | --- | --- |
| discovery, details, refresh, geocoding | yes | follow the master switch, as designed |
| **photos** | **yes** | follows the master switch: `GOOGLE_PLACES_PHOTOS_ENABLED` is not set |
| journeys, probe | no | must be enabled by name |

So new paid photo calls are still possible in production until the variable is set and production is redeployed.

## 2. Turning photos off (you; the steps are in §8A of the spend doc)

1. **Vercel.** Settings > Environment Variables. Add `GOOGLE_PLACES_PHOTOS_ENABLED` = `false`, ticking **Production** and
   **Preview**.
2. **Redeploy production.** Deployments > current Production > Redeploy. A build bakes its environment, so the variable
   reaches only new deployments.
3. **Preview.** The next Preview build picks the variable up. An existing Preview keeps its old posture until it is
   redeployed.

## 3. Proving it, without spending

Run **Actions > Live canaries against a Preview build > Run workflow** on `main`. Every input below is free and makes no
provider request.

| Input | Production | Preview |
| --- | --- | --- |
| `base_url` | (leave the default) | the Preview deployment's URL |
| `run_nearby_food` | off | off |
| `assert_fail_closed` | on | on |
| `posture_profile` | `production` | `production` (`closed` too, if Preview has no Google scope enabled at all) |
| **`expect_off`** | **`photos`** | **`photos`** |

How to read the result:

- **Switch took effect:** the run passes and ends with "...and photos refuses as switched off".
- **Variable not set, or no redeploy:** the run fails at `[FAIL] photos is refused`.
- **Misspelled scope name:** fails too (`the photo scope exists in the snapshot: ABSENT`), so a typo can never pass vacuously.

`expect_off` is new in this change (`assert-places-fail-closed.mjs --expect-off=...`).

The same check by hand: open `/api/places/status` (no `?probe=live`); `placesBudget.scopes.photos.allowed` must be `false`.

## 4. What the key is used for (read from the code on `main`)

**Every Google request is made by our server; no Google key reaches a browser.**

| Call site | Google endpoint | Key variable | How the key is sent |
| --- | --- | --- | --- |
| `server/places/lib/google-places.js` (search, details, refresh, area sync) | `places.googleapis.com/v1` | `GOOGLE_PLACES_API_KEY`, else `GOOGLE_MAPS_API_KEY` | `X-Goog-Api-Key` header |
| `api/places/photo.js` (photo lookup and media) | `places.googleapis.com/v1` | `GOOGLE_PLACES_API_KEY`, else `GOOGLE_MAPS_API_KEY` | `X-Goog-Api-Key` header; the browser gets only the resulting `googleusercontent.com` image address |
| `api/planning/location.js` (town-name lookup) | `maps.googleapis.com/maps/api/geocode/json` | `GOOGLE_MAPS_API_KEY`, else `GOOGLE_PLACES_API_KEY` | `key=` query parameter, server side |
| `server/context/lib/route-matrix.js` via `journey-provider.js` (journeys, off by default) | `routes.googleapis.com` | `GOOGLE_MAPS_API_KEY`, else `GOOGLE_PLACES_API_KEY` | `X-Goog-Api-Key` header |
| `api/places/status.js` | none: it reports only whether a key is configured | `GOOGLE_MAPS_API_KEY` | not sent |

**What shows the key stays off the client:**

- The shipped bundle contains no Google key. The same canary's client-config check reports `no Google API key in the
  bundle: 0 hit(s)`.
- No `EXPO_PUBLIC_` Google variable exists.
- The Supabase edge functions make no Google request; they call our own API.

## 5. Which restrictions are safe

**Do not add an HTTP-referrer (website) restriction to this key.** Every call above is a server-to-server request from a
Vercel function, and none sends a `Referer` header. Google rejects requests to a referrer-restricted key that carry no
matching referrer, so the restriction would turn off:

- discovery, details, refresh and the area sync;
- geocoding;
- photos, for when they're switched back on.

Making the server send a forged `Referer` would restore the calls, but it would protect nothing: anyone holding the key
could send the same header.

**An IP-address restriction does not fit either, today.** Vercel functions leave from shared addresses that change, unless
the project buys Vercel's static egress IPs.

**What is safe now:**

1. **API restrictions.** Restrict the key to the APIs in §4: Places API (New) and Geocoding API, plus Routes API only if
   journeys will ever be enabled. This narrows what a leaked key can buy without breaking anything the app does.
2. **Separate keys,** if the two variable names currently hold one key. One key for Places and one for Geocoding/Routes
   lets each be restricted and rotated on its own. Check in Vercel which of `GOOGLE_PLACES_API_KEY` and
   `GOOGLE_MAPS_API_KEY` exist and whether they hold the same value.
3. **Rotation** if the key has ever been in a client build, a script or a shared document. A key that has only ever lived
   in Vercel's server environment does not need rotating for this change.

## 6. Quotas and billing are a separate control

Application-level switches (`GOOGLE_PLACES_*_ENABLED`, the daily call caps) decide whether *our code* asks Google. They
cannot cap what Google bills. The billing controls live in Google Cloud and are verified there, separately:

- per-method daily quotas (§8C of the spend doc);
- a budget with alerts (§8D);
- next-morning comparison of Google's per-method metrics with `google_places_usage` (§8F).

Neither kind replaces the other. Photos stay off until the Google-side quota is confirmed in the console.
