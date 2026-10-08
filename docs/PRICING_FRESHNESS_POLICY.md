# Pricing freshness: how long a price is shown as current

2026-10-08. Replaces the single 400-day rule that #171 and #178 shipped with.

## The problem with 400 days

A paid admission price read on 10 January 2026 would have been shown as the price "to get in" until 15 February 2027,
through an Easter, a summer and a new year, which is three of the moments UK attractions change their tariffs. The
figure carried its reading date in small print, but the headline said "About £34 to get in" as if it were today's.

## The policy

| What the page said | Shown as current for | Then | After 400 days |
| --- | --- | --- | --- |
| Paid admission (individual tickets and family tickets) | **180 days** from the reading, or until the page's own stated end if earlier | **Last known price**, dated, worded as possibly changed | No figure at all |
| Free entry | **365 days** from the reading | Last known, dated | No figure |

**Why these numbers.** Paid tariffs change at least yearly and usually at a season boundary, so six months is the
longest a reading can be trusted without a re-read; a stated end date on the page (a season's prices) always wins when
it is earlier. Free entry is a standing policy rather than a tariff (national museums, parks), so a year is proportionate,
and the claim still carries its date on screen. Beyond 400 days even a "last known" figure stops being useful and is
withdrawn.

**What a parent sees.**

| State | Card badge | Venue Detail headline | Venue Detail detail |
| --- | --- | --- | --- |
| Current | "From £17" / "Free entry" | "About £34 to get in" / "Free entry" | breakdown per person, conditions, **"Checked 1 Oct 2026"** |
| Last known | "Price not confirmed" | "Price not confirmed" | **"Last known price: Adult £17, Children 3 to 15 £8.50, … Prices may have changed since then. Check with the venue before you go."** and **"Last checked 1 Oct 2026"** |
| Expired or none | "Price not confirmed" | "Price not confirmed" | link to the official site |

A last-known price is never totalled for the party, never badged, never called an estimate, and never says "free" as a
badge. It exists so a parent who sees "Price not confirmed" also sees what the page said and when, and can judge it.

**Unknown stays unknown.** A venue with no reviewed price, a `hold` (no plainly general ticket) or a `refuse` (only part
of the site is free) shows nothing numeric, as before.

## The 24 reviewed claims under this policy

All 24 were read between 26 September and 7 October 2026. Under the new windows every one is current on release and for
a visit in November; the earliest paid price becomes "last known" on **25 March 2027** (read 26 September) and the bulk
on **30 March 2027** (read 1 October). `reviewed-admission-claims.test.ts` fails if any published claim is older than
its window on the file's `preparedOn` date, so the file cannot be re-released with a stale reading in it.

## Keeping prices fresh without Google

Each claim names its page. A re-read is a `refetch_official` job (the known website only; Google is never asked) or a
person opening the page; either way a price is renewed only by a **new reading with a new date**, never by editing the
date. The sensible cadence is a re-read every **150 days** for paid prices and **300 days** for free entry, which keeps
every claim inside its window with a month to spare. Until that re-read is scheduled, the policy itself is the
safeguard: a missed re-read shows as "last known", not as current.

## What changed in code

- `admission.ts`: `PRICE_FRESHNESS_DAYS = { paid: 180, free: 365 }`, `priceFreshness()` returning `current`,
  `last-known` or `expired`; `priceIsCurrent()` keeps its signature and takes the status; the stale estimate carries
  `lastKnown` (date and the page's lines) inside the 400-day limit; `admissionView` words it as above; `priceBadge` is
  unchanged in behaviour (only a current price is badged).
- Tests: boundaries at 180/181, 365/366 and 400/401 days, the stated-end rule, a future reading, and the exact
  last-known wording. The release check now asserts each claim's own window.
