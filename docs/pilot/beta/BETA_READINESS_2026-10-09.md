# Beta readiness: where the five venues really stand

9 October 2026, evening. Nothing in this report is published; it describes production today and what would be true once the approved evidence is published.

## Verdict
**Four venues can be recommendation-ready; five cannot, yet.** Discover is blocked by its price. London Zoo, the Science Museum and Horniman also depend on Pack C, which has not been returned.

## The five venues

| Venue | Production today | After Packs A/B are published | After Pack C is also approved | Blocker |
|---|---|---|---|---|
| Royal Air Force Museum London | **Ready** | Ready | Ready | none |
| Horniman Museum and Gardens | Not ready (getting there) | Not ready | **Ready** | Pack C parking card |
| London Zoo | Not ready (cost, getting there, child activity, essentials) | Not ready | **Ready** | Pack C: parking, toilets, ZooTown. Price from card 11 (code change) |
| Science Museum | Not ready (same four) | Not ready | **Ready** | Pack C: parking, toilets, The Garden. Price from card 12 (code change) |
| Discover Children's Story Centre | Not ready (cost, getting there, essentials) | Not ready | **Not ready (cost)** | **Price: card 10 is Unknown.** The current official page shows ticket names but no Day Entry amount |

"Ready" means the five requirements hold on evidence production would carry: opening times, what it costs, how to get there, something for children, and the family essentials. Pack C approvals are assumed to be Approve; every card the reviewer edits or marks unknown can hold a venue back. The expected statuses are computed by `beta-five-readiness.test.ts` (with Discover's price excluded) and, once published, will be proven against production by `live-readiness.cjs`.

## What carries a venue, and what a parent will see as unknown
- **Confirmed** (a person approved it, with the official quotation): closures and hours, buggy rules, and (once published) the prices for London Zoo and the Science Museum.
- **Accepted automatically** (not seen by a person): the existing facility facts for RAF and Horniman (toilets, café, baby changing, playground, parking). They are labelled as such by the readiness check.
- **Unknown** (shown as not confirmed, never as a positive): Discover's price; anything the reviewer marks unknown; everything not yet reviewed.
- **Unsuitable** (stated as a limit): Discover does not allow buggies in its play areas (a rule that can refuse a family that needs one); the exception for twins or a sleeping child is shown beside it without promising accommodation.

## How long the evidence lasts
- London Zoo's and the Science Museum's websites **block our crawler**: all 14 stored pages for each are "blocked". Their claims cannot be refreshed automatically; a person must re-read and re-approve them before they expire. Rules and facility claims last 30 days from the 8 October reading (**7 November**), hours 45 days (**22 November**), activities 90 days (**6 January**), a paid price 180 days (**6 April**), free admission one year.
- RAF's and Horniman's existing automatic claims expire on **31 October to 1 November** and depend on the scheduled refresh.
- When anything expires, the app shows it as unknown, not as the old fact.

## Still to do before a family is invited (in order)
1. Pack C returned by the named reviewer; the four controls scored (bar: 3 of 4).
2. Final manifest, with the claims, the pricing and activity code changes, the unresolved items and the expected status, for the owner's approval.
3. Publish (claims batch, then the data change), then run the live readiness check against production.
4. Parent journey on the published state: Home, Venue Detail, Create a Plan, Saved Plan, reopened; several family types.
5. The owner's phone check and the hosted invitation test; then the first five families.

## Honest limits
- The parent journey cannot be run against production from this environment (the proxy refuses it); it is run against the exported app and the fixture, and the owner's phone is the production check.
- Discover can be restored to the set by a current, quotable price: either the page showing the amount again, or the owner confirming it from the booking step with a screenshot of the venue's own page, or a different fifth venue.
