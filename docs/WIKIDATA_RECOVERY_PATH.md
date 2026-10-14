# Wikidata (CC0) as a smaller recovery path that does not wait for the ODbL

14 October 2026. Plan B in [ODBL_DECISION_MEMO.md](ODBL_DECISION_MEMO.md). Measured on three bounded queries run once on a GitHub runner (this session's network cannot reach Wikidata): museums and art museums, parks, urban parks, gardens, botanical gardens and nature reserves, and zoos, aquariums, theme parks, amusement parks, castles, palaces, windmills and tourist attractions, inside a box around London, excluding anything with a dissolution date. The counts below keep only items within the app's 40 km scope, with a real label, and in a category the app serves.

## What it can cover

| | Stored venues retained | New items |
|---|---:|---:|
| Parks and gardens | **40** of 70, 2 more possible | 696 |
| Museums and galleries | **20** of 40, 1 more possible | 211 (138 with a website) |
| Zoos | **3** of 6 | 6 |
| Attractions | **2** of 12 | 50 |
| Farms | 1 of 8, 1 more possible | 0 |
| Activities | 1 of 7 | 0 |
| Soft play | **0** of 6 | 0 |
| **All** | **67 of 147** confident (46%), 4 possible, 76 none | 963 |

The OpenStreetMap path retains **112** of the same 147. Sixty-six of Wikidata's 67 are also in OpenStreetMap's 112; Wikidata adds one. So Wikidata is a **floor of the best-known venues**, not a second route to the small ones: the 46 venues only OpenStreetMap names are the local parks, small museums and activity centres.

Of the 963 new items, 228 have a website. They spread as central 202, south 166, west 128, beyond 25 km 234, north 120, east 113. They would need the same quality gates and a person's review as the OpenStreetMap batches before any is served.

## Is it really independent of OpenStreetMap?

Wikidata's licensing page says all structured data is CC0, and that Wikidata "avoids hosting data that lacks a CC0 license" while not guaranteeing it: the community pauses on integrating datasets under other licences, and "any Creative Commons license other than CC0" is one it avoids. That is a policy, not a warranty, so the residual risk is an editor having copied coordinates from OpenStreetMap. A check: for 68 venues present in both, **none** has the same position (0 within 1 m, 10 within 10 m, median 92 m apart, 90th percentile 272 m, largest 625 m). That is what two independent placings look like, not a copy. It is evidence, not proof, and it is question 6 in the memo.

## What it needs

1. **A small change to the registry's validator.** #208 accepts a position only from OpenStreetMap, because that was the one source the app could credit. A CC0 position needs no credit, so the validator should accept `location.source: "wikidata"` with licence `CC0-1.0`. Until then a Wikidata entry can carry a name and a website but no position, which means Search all but not Nearby or a map.
2. **An adapter** from the SPARQL JSON to entries (the dry-run tool reads only OpenStreetMap today), with a Wikidata item id and link as the entry's source.
3. **The same review.** A named person signs the batch; entries are `UNREVIEWED` until then.
4. **A credit line**, which CC0 does not require and which is courteous.

**Do not mix it with OpenStreetMap entries of the same type by accident.** The Collective Database Guideline treats OSM and non-OSM data of one type in one cut as a Derivative Database. For CC0 data that is harmless (it can be relicensed), but it makes the combined entries subject to the ODbL's share-alike and publication duty. Plan B stays clear of the ODbL only while it stays Plan B.

## Verdict

**Yes, as a floor.** About two days of work (validator, adapter, batch, report) gives a reviewed set that keeps **67 of the 147 venues** and could add a curated few hundred new parks and museums, with positions, under CC0 and with no OpenStreetMap data. It does **not** keep 80 of the 147 (soft play and most farms, activities and small parks), so on 8 November Explore would show about 70 plus whatever is added, against about 3,300 candidates on the OpenStreetMap path. It is the right fallback if counsel is not back by about 27 October, and the right first tranche if you want something live that needs no legal answer.
