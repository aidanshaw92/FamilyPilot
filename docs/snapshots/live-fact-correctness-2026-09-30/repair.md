# Production repair: the four false claims, self-healed

2026-09-30, 21:17 to 21:28 UTC. Merge `a41dd73`, targeted re-crawl of four venues, no manual claim
edits. Every stage was a gate; the deployment gate held the re-crawl back for five minutes.

## Gates

| Gate | Check | Result |
| --- | --- | --- |
| 1 | head still `29d2cb8`, 0 commits since review, 0 behind main, CI #121 / visual #49 / Vercel green, `mergeable_state: clean` | pass |
| 2 | squash-merged; main `a41dd73…db20` confirmed by `git fetch`, single parent, merged code read back from `origin/main` | pass |
| 3 | production deployment READY on the merged SHA | **held 5 min**, then pass |
| 4 | before-snapshot; all 30 fixture claims present with zero value or confidence drift | pass |
| 5 | requeue exactly 4 rows | pass |
| 6 | blast radius: 4 queued, 0 outside | pass |
| 7 | all 4 terminal, `attempts = 1`, no errors | pass |
| 8 | 4 targets met, other 26 identical in value and confidence | pass |

**Gate 3 mattered.** `dpl_8dqXBNujeHYXrTHPBEW8EMETCqEb` was still `BUILDING` when the merge landed.
Requeuing then would have re-run the *old* extractor and republished the same four wrong values, which
would have looked like a failed repair rather than a sequencing mistake. The re-crawl waited until
`READY`.

**One judgement call.** All four jobs were set to `mode='regenerate'`. Flip Out Canary Wharf was on
`mode='generate'` because the venue was created earlier the same afternoon, and `draft-store.js:354`
throws for a venue whose draft is already approved — which all four are. Leaving its mode alone would
have failed the job rather than repaired the claim.

## The four repaired claims

Each old claim was **disputed** by the pipeline, not deleted and not edited. The three freeParking
claims have no replacement, which is the intended fail-closed outcome: the condition is not modelled,
so unknown is the honest answer. Paradox's contradicting value produced a new active claim.

| Venue | Field | Before | After | Old claim → status | New active claim |
| --- | --- | --- | --- | --- | --- |
| Paradox Museum London | `pushchairSuitability` | good/high | **difficult/high** | `8ac18e3a-27b4-44de-bcba-2fe3dce72f5d` → `disputed` | `eacd0670-b52c-4be1-934e-9edf393673cc` |
| Thorpe Park | `familyFacilities.freeParking` | yes/high | **not served** | `13f3581f-f9d2-45b9-84cd-1f0dce5a3759` → `disputed` | none, by design |
| Flip Out Canary Wharf | `familyFacilities.freeParking` | yes/high | **not served** | `a7b033c6-d529-4ed2-b9b8-90f31de013c9` → `disputed` | none, by design |
| Stanborough Park Water Sports Centre | `familyFacilities.freeParking` | yes/high | **not served** | `813b5fac-1399-4f38-8775-17809bcfad77` → `disputed` | none, by design |

Evidence rows and source URLs behind them, unchanged by the repair — the same pages, read correctly:

| Venue | Evidence row | Source URL | The sentence that decided it |
| --- | --- | --- | --- |
| Paradox Museum London | `d15da3f7-87cb-484f-9a70-f75986004798` | `paradoxmuseum.com/london/` | "the space is not accessible for prams/strollers" |
| Thorpe Park | `84a97de9-f1ac-42b3-ba4e-30bae89bb588` | `thorpepark.com/` | "Every Thorpe Park short break includes: … Free parking" |
| Flip Out Canary Wharf | `e8eb4a0d-bdb9-4c66-80d9-7a10f1f807ac` | `flipout.co.uk/locations/canary-wharf/frequently-asked-questions` | "3 Hours FREE parking on Weekends & Bank Holidays" |
| Stanborough Park | `bc42e97a-f46a-4260-be99-54f13e95f2a6` | `better.org.uk/leisure-centre/welwyn-hatfield/stanborough-park…` | "Charges start at £1.50 … free parking for Blue Badge holders" |

### The correction that was NOT made

`familyFacilities.parking = yes` survived on all three parking venues, with high confidence and fresh
active claims. That is correct and was the point of the review correction to the cohort report: a price
proves parking exists. Thorpe Park's active parking claim cites "Car Parking tickets are £12, with
Priority Parking available for £20."

An earlier version of the cohort report called Thorpe Park a contradictory pair and treated
`parking = yes` as wrong too. It was not. Only `freeParking` was false, and only `freeParking` moved.

## Reconciliation outcome

Claim counts reconcile exactly, from an independent arithmetic check rather than assertion:

```
  245 active before
+   9 new active claims created in the window
-   4 disputed  (3 freeParking with no replacement, 1 Paradox pushchair replaced)
-   8 superseded (ordinary republication of the four venues' other fields)
= 242 predicted   ... 242 actual
```

Disputed went 7 → 11, exactly the four. Evidence rows 1186 → 1189: three new URLs, all Stanborough's
(`better.org.uk/children-centre`, `/what-we-offer/activities/…`, `/what-we-offer/lessons-and-courses…`),
found by the wider crawl and none of them the deciding page.

**No disputed claim is served.** The served definition requires `status = 'active'`, so a disputed claim
is withheld from parents rather than shown with a caveat. The four venues serve 10 core fields between
them after the repair.

## Blast radius

| Check | Value |
| --- | --- |
| Claims touched outside the four venues | **0** |
| Evidence rows touched outside the four venues | **0** |
| Jobs run outside the four venues | **0** |
| `private.venue_data_settings.last_refresh` | `2026-09-30`, unchanged |
| Queue | drained to 0 |

The other 26 claims from the committed replay cohort: **26 of 26 identical in value and confidence**,
zero drift. Verified by generating the comparison SQL from `replay-input.json` itself, so the check is
against the committed fixture rather than a retyped list.

## Left open, deliberately

Three claims were **not** touched and remain live. None is in the authorised scope of this repair.

- **Hatfield Park** `freeParking = yes` — "in The Stable Yard, with free parking & free entrance".
  Area-scoped rather than visitor-scoped.
- **Sydenham Hill Wood** `freeParking = yes` — "free parking is available at the latter", of two named
  entrances of the adjacent Dulwich Wood. Arguably a subject-scope question, since the text names a
  different wood.
- **Nando's** `freeParking = yes` — **new**, and found during this operation rather than before it. It
  appeared via ordinary product activity in the ~3 hours before the merge (global active 235 → 245,
  evidence 1076 → 1186), alongside Chiswick House `freeParking = no`. Nando's was published by the old
  code and may be a conditional false positive the new rules would suppress, but it is outside the four
  venues authorised here, so it was not requeued and its wording has not been examined.

All three are open questions, not findings.
