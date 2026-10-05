# Food-nearby backfill: reworked to two batched queries, and why it was not run here

**Decision: not executed.** This environment has no outbound access to `overpass-api.de` or its mirrors (every
request is refused by the egress proxy), so no request of any kind was attempted and nothing was written. I would not
run it from here even if I could: a public-infrastructure batch should be started by someone who can watch the first
response. The tooling is built, tested with a fake provider, and ready to run once, by you, from a machine that can
reach the provider. Today **8 of 155** stored places (5%) have a stored food lookup, so until it is run the Food nearby
filters are honest but nearly empty, and the screens say so ("N places haven't been checked for food nearby").

## What changed from the first design

The first design sent about 150 small queries, ten seconds apart, because that total was under Overpass's published
ceiling for casual use. You were right to reject that reasoning: being under a ceiling is not the same as being the
right shape. A one-off job does not have to look like regular use. It now sends **one batched query per ~70 venues**.

| | First design | Now |
| --- | --- | --- |
| Queries for ~138 anchors | ~150 | **2** (plus one light `/api/status` read) |
| Hard ceiling | 200 | **4** queries, 100 anchors each |
| Spacing | 10 s | **at least 60 s** (default 90 s) |
| Endpoints | primary, falling over to a mirror | **one**, no failover, no retry |
| On any error, 429/406, remark or failover | stop | stop (and nothing further is asked) |
| Answers | one row per query | one row per anchor, assigned from the batch by distance, in the exact shape the venue page stores |

How a batch works: one query lists, for each anchor, `nwr["amenity"~"^(restaurant|cafe|fast_food)$"](around:1200,lat,lon)`
and returns the union. The elements are then assigned to each anchor by distance **here**, at no cost to the provider
(the nearest 60 are kept, so the cap now keeps the walkable places; the page's own query keeps an arbitrary 60). Each
anchor's `around` is separate: a single `around` with several points measures distance to the line between them and
would pull in food from the whole stretch in between.

Expected load, from the shape of the data (not measured, because I cannot reach the service): two requests of roughly
a few MB each, `[timeout:90]`, `[maxsize:64MB]`. That is far below "10,000 queries and 1 GB a day" and, more to the
point, it is two requests rather than a stream of them. If you would rather it were gentler still, `--per-request 35`
gives four queries; `--max-requests 1` runs half the catalogue and leaves the rest for another day.

## Current public-instance guidance (verified 5 Oct 2026)

From the Overpass API Commons page and the OpenStreetMap wiki "Overpass API", via web search (the pages themselves are
blocked from this environment, so please re-read them before the run):

* "You can safely assume that you don't disturb other users when you do less than 10,000 queries per day and download
  less than 1 GB data per day"; for regular use, divide those numbers by 100; a request should finish within about 10
  minutes in total.
* On HTTP 429 or 406, pause for 30 seconds before the next request. Cache and rate-limit. Identify the application.
  Do not run scripts in parallel.
* The server sheds load from heavy users first and gives a user's first few requests priority, which favours the
  two-query shape.

How the run complies: identified `User-Agent` with a contact URL (the existing one); strictly sequential; at least 60
seconds between queries; no retry, so a 429 ends the run rather than being hammered (the 30 s rule is exceeded by
construction); everything cached, so nothing is ever asked twice; one-off, no cron.

## Rules the code enforces (each has a test: `food-backfill.test.ts`, 15 tests)

* **Plan mode by default**: without `--apply` it lists the anchors and the number of queries and makes no request.
* **De-duplicated** on the lookup's own cache key; venues with no coordinates are ignored.
* **Idempotent and restartable**: anchors already stored (fresh or stale) are skipped and cost nothing; a complete run
  asks for nothing; a partial one asks only for the rest.
* **Refuses to start** if the results cannot be stored (no Supabase admin credentials), and if `/api/status` reports no
  free slot.
* **Capped**: at most 4 queries and 100 anchors per query, whatever flags are passed. Every anchor is accounted for as
  attempted, succeeded, failed or skipped, with the reason, so the ledger always balances.
* **Stops** on the first provider error, rate-limit signal, runtime-error remark, store failure, or retry/failover.
* **No Google, no paid provider, no mirror, no cron, no request-time querying.** A test asserts the module and script
  import no Google client and name exactly one interpreter endpoint.

## How to run it (once)

From `familypilot/` on a machine with outbound access and the same Supabase credentials the other server scripts use:

```bash
node scripts/backfill-food-proximity.mjs                    # PLAN: lists anchors, prints the query count, requests nothing
node scripts/backfill-food-proximity.mjs --apply            # the run: 1 status read + 2 queries, 90 s apart
```

It writes its ledger to `docs/food-backfill/<timestamp>.json` and prints `requests`, `attempted`, `succeeded`,
`failed`, `skipped`, `withFoodWithin10`, `nothingMapped`, `stoppedBecause`. Afterwards the Explore and Home food
filters read real stored lookups: a place with nothing mapped nearby is a real "no match", while a place that was never
looked up stays "not checked". A venue page that is opened later does not repeat the request, because it reads the same
row.

## Not done

Nothing here was run, so there are no result figures. The report after a real run should state requests sent, venues
checked, successes, venues with food within a ten-minute walk, venues with nothing mapped, failures and unknowns.
