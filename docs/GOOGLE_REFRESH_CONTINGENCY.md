# Google refresh contingency (emergency only)

2026-10-14. **This is a description, not an authorisation. Nothing here has been run, and nothing will run without your explicit approval.**
You do not want a permanent cycle of paying Google, and this plan does not make one: it buys 30 days once, to be used only if the
zero-Google path (the [recovery proposal](P0_CATALOGUE_RECOVERY.md)) is not ready by 1 November.

## What it would do

It re-fetches the stored places once, so their Google copies are under 30 days old again. That keeps them served for another 30 days
(Explore and Meet halfway read `fetched_at`). It does not make them plottable: a Google position is still never drawn on the app's own
map ([MAP_COMPLIANCE.md](MAP_COMPLIANCE.md)), so what comes back is list-only.

## Exact requests

One Place Details request per place, by place ID. No Nearby Search, no photographs, no text search, no geocoding, no routes.

```
GET https://places.googleapis.com/v1/places/{PLACE_ID}
X-Goog-Api-Key: <key restricted to Places API (New)>
X-Goog-FieldMask: id,displayName,location,formattedAddress,primaryType,types,websiteUri,nationalPhoneNumber,regularOpeningHours,currentOpeningHours,businessStatus,timeZone,utcOffsetMinutes
```

This is the field mask in `server/places/lib/google-places.js` (`DETAIL_FIELD_MASK`) **without `editorialSummary` and `photos`**. Dropping
`editorialSummary` keeps the request out of the Atmosphere tier; dropping `photos` stops any photo-media request following it. The code
path that would be used is the existing one, `getGooglePlace(id, { scope: 'refresh' })`.

| | |
|---|---|
| Places | the 147 stored rows inside the 40 km London scope (the 2 beyond it are not served anyway). Cap: 149, one per stored row |
| Requests | 149 at most, serial, none repeated, none retried on a billing error |
| SKU | Place Details Enterprise (`websiteUri`, phone, opening hours). The price list I have lists it at US$20 per 1,000; our cap notes use **US$25** (the Atmosphere price) as the conservative figure |
| **Maximum cost** | 149 x US$25 / 1,000 = **US$3.73** |
| Free allowance | Google's price list gives Enterprise SKUs a monthly free allowance (1,000 in our notes); if your billing account has not used it, the real cost is probably US$0. **I could not verify the current price list or your allowance** (the search returned legacy figures), so budget US$3.73 |

## An enforceable limit, in layers

1. **Google Cloud (the real hard stop, outside our code).** Create a separate key restricted to the Places API (New). Set a daily
   request quota on that API to 160. Set a billing budget alert at US$5. Revoke the key afterwards. Only you can do this.
2. **The atomic ledger.** With `GOOGLE_PLACES_ATOMIC_CAP=true` (the migration in `docs/GOOGLE_ATOMIC_CAP.md` must be applied), set
   `GOOGLE_PLACES_MAX_TOTAL_PER_MONTH=160` for the run. The ledger refuses unit 161 inside the database, whatever calls it.
3. **The script.** A one-off script with the id list written to a file beforehand, a hard `MAX = 149` that exits before the first
   request if the file is longer, serial calls, and stop at the first error. It defaults to a dry run that prints the list and the cost.
   I have **not** written it, because writing it is part of the approval.

No scheduled job, no background worker, no retry loop.

## What stays compliant after another 30 days

**Nothing, on its own.** On day 31 the same rows age out again, and the same choice returns. The refresh buys time, not a position.
What makes it end is the zero-Google path: independent entries in the registry, which do not age out. If the refresh is used, run it
once, and as late as possible (for example on 7 November, the day before the 79 rows of 9 October go) to carry the catalogue to 7 December, and do not repeat it.

One more point. A refresh re-stores Google content in `place_records` for another period. Whether stored copies must also be redacted when
they age out, rather than merely not served, is open ([MAP_COMPLIANCE.md](MAP_COMPLIANCE.md), "Not a map issue"). A one-off redaction
would be a database write and needs its own approval.

## What I need to run it

All of: your written approval naming the date; the restricted key and quota in place; the budget alert set; the migration applied if
you want layer 2. I will then run a dry run, show you the 149 ids and the cost, and only then run it.
