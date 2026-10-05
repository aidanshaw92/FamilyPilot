# Food-nearby backfill: policy check, tooling, and why it was not run here

**Result: not run.** The environment this work was done in has no outbound access to `overpass-api.de` or its mirrors
(every request is refused by the egress proxy, and so is the deployed app), so no request was attempted and nothing
was written. The tooling is built, tested with a fake provider, and ready to run once from a machine that can reach
the provider. Today **8 of 155** stored places (5%) have a stored food lookup, so until it is run the "Food nearby"
filters are honest but nearly empty, and the screens say so ("N places haven't been checked for food nearby") instead
of showing an empty list.

## Provider usage policy (current)

Overpass API's published usage guidance for the public instances: "you can safely assume that you don't disturb other
users when you do less than 10,000 queries per day and download less than 1 GB data per day", and for anything that
runs regularly divide those numbers by 100; on HTTP 429 (or 406) pause for 30 seconds before the next request; identify
the application with a `User-Agent`/`Referer`; do not run scripts in parallel; cache and rate-limit. Source:
the Overpass API User's Manual ("Commons") and the OpenStreetMap wiki page "Overpass API" (I could not fetch them from
here; the figures above were confirmed through a web search of those pages, so please re-read them before the run).

The planned pattern against that:

| Policy | This backfill |
| --- | --- |
| Under 10,000 queries/day, under 1 GB/day | at most **160** requests in total, hard ceiling 200, a few kilobytes each |
| Anything regular: divide by 100 | it is **not regular**: one run, ever; a second run skips every stored anchor and sends nothing |
| Pause 30 s on 429/406 | it does not pause and retry: the **first error or retry/failover stops the run** |
| Identify the app | the existing `User-Agent: FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; nearby-food)` |
| No parallel scripts | strictly one anchor at a time, at least 8 s (default 10 s) between requests |
| Cache | every answer is stored in `place_search_cache` under the same key the venue page reads |

About 150 requests spaced 10 seconds apart is roughly 25 minutes and about 0.1% of the daily allowance. I judge that
appropriate for the public endpoint. If you disagree, the safe alternative is `--limit 40` over several days, or
leaving it to grow organically as venue pages are opened.

## Rules the code enforces (each has a test: `food-backfill.test.ts`, 12 tests)

* **Plan mode by default**: without `--apply` it lists the anchors and makes no request.
* **De-duplicated** on the lookup's own cache key; venues with no coordinates are ignored.
* **Restartable and idempotent**: any anchor already stored (fresh or stale) is skipped.
* **Refuses to start** if the results cannot be stored (no Supabase admin credentials), because unstored answers are
  pure load on a donated service. A preflight reads Overpass's `/api/status` and refuses to start with no free slot.
* **Capped**: a request cap (default 160, hard ceiling 200). Every anchor is accounted for as attempted, succeeded,
  failed or skipped, with the reason, so the ledger always balances.
* **Stops** on the first provider error, rate-limit signal, or retry/failover.
* **No Google, no paid provider, no other fallback**: the only network collaborator is the OpenStreetMap lookup, and a
  test asserts the module and script import no Google client.
* **No cron, no request-time querying**: it is a script someone runs, not a scheduled job and not reachable from the app.

## How to run it (once)

From `familypilot/` on a machine with outbound access and the same Supabase credentials the other server scripts use:

```bash
node scripts/backfill-food-proximity.mjs                    # PLAN: lists the anchors, makes no request
node scripts/backfill-food-proximity.mjs --apply            # the run: ~150 anchors, one every 10 s
# optional: --limit 40 --delay-s 12
```

It writes its ledger to `docs/food-backfill/<timestamp>.json` and prints a summary (`attempted`, `succeeded`,
`failed`, `skipped`, `withFoodWithin10`, `nothingMapped`, `stoppedBecause`). After it, the Explore and Home food filters
read real stored lookups; a place with nothing mapped nearby is a real "no match", while a place that was never looked
up (or a run that stopped early) is listed under "Not checked for food yet", never hidden.

## What reads the data

`api/places/search.js` attaches `foodNearby` to each returned place with one database query against
`place_search_cache` (`server/places/lib/food-proximity.js`); it never calls a provider. The client treats a missing
`foodNearby` as unknown. Café on site is separate: it is true only when the venue's confirmed facilities include a café.
