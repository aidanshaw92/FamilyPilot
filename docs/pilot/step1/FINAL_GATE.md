# Step 1: final execution gate

Status: 8 October 2026, 22:25 UTC. **Nothing has been executed.** Everything here was computed offline or read from production with `select` only. I am waiting for your explicit authorisation.

## Recommendation: run the 18-venue version (Option C), not all 21

Your rule is that a weaker quotation must not replace a stronger valid one without a reason. The full 21-venue run breaks it twice. My earlier "Option B" (19 venues) did not fully fix that: it still let Chiswick House's café claim be replaced by a weaker quotation. I should have caught that. Option C leaves out the three venues whose only effects are weaker evidence.

| | A: all 21 | B: 19 (earlier proposal) | **C: 18 (recommended)** |
|---|---:|---:|---:|
| Venues left out | none | Frameless, Tate Modern | **Frameless, Tate Modern, Chiswick House** |
| Facts added | 18 | 17 | **16** |
| Value corrected | 1 | 1 | **1** |
| Claims withdrawn | 4 | 4 | **4** |
| Same-value re-quotes | 4 | 3 | **1** (London Eye: a trailing space) |
| Weaker quotation replacing a stronger one | **2** | 1 (Chiswick café) | **0** |
| Active claims at the 21 venues afterwards | 90 | 89 | **88** |

Each row is the output of the real `main` code over the stored pages (`real-run.json` for all 21; the other two by `EXCLUDE=` in `step1-real-run.cjs`). 0 network attempts in all three runs.

**What leaving the three venues out loses** (nothing is made worse; these facts are simply not added now):

| Venue | Lost addition | Quotation | My view of it |
|---|---|---|---|
| Tate Modern | café: yes | "Tate Modern Corner Cafe, Bar, Venue Opening times Sunday to Monday 10.00–18.00…" | True, but the quotation is a navigation fragment. Weak. |
| Chiswick House | toilets: yes | "Baby changing is available in the toilets by the Café and pushchairs are welcome throughout the grounds." | Direct and good. A real loss. |
| Frameless | none | | Its only effect was the weaker re-quote. |

All three venues stay as they are today and are re-read at the scheduled refresh (24 October onward). The same weaker re-quotes will recur there unless the replacement rule is changed; that is a separate code change (see "After this run").

If you would rather accept the weaker Chiswick café quotation to gain its toilets fact, Option B is the command with `fp-osm-679119297` added back. I do not recommend it.

## The four withdrawals

A withdrawn claim goes back to unknown. Nothing is deleted. In each case the claim's own source page says something different from the fact.

| Venue, fact | Claim id | The page says | Why it is wrong |
|---|---|---|---|
| Sydenham Hill Wood, accessible toilet: yes | `24a699e3-1e99-46ac-8f45-b50e8d4e536a` | "Changing Places Toilet The **nearest** Changing Places Toilet can be found in **Dulwich Park**, College Road" | The toilet is in a different park. |
| Queen Elizabeth Olympic Park, parking: yes | `37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead` | "**Lee Valley VeloPark** Venue car parking is available for up to 3 hours **for facility users**…" | It is another venue's car park, for that venue's users. |
| Queen Elizabeth Olympic Park, free parking: no | `be6f2b75-2265-4e2a-ae87-1e7021c5eb9b` | "The nearby **Olympic Park Avenue** has on-street pay and display spaces **and Blue Badge spaces**…" | A street, not the park's parking, and the sentence mentions Blue Badge spaces. |
| Whitechapel Gallery, free parking: no | `e7f221fa-9e6f-406e-8645-d7557cdc00a9` | "Buckle Street Multistorey Car Park… **Free parking for Blue Badge holders** is available at the top of Osborn Street in the pay and display booths for an unlimited period." | The page says free parking exists for some visitors, so "no" is wrong. |

For the withdrawals the code requires the claim's own page, read completely, to stop stating the value. All four meet it; no other claim does.

## The Colne Valley parking correction

Claim `eabed57d-f4e9-45a7-a8b6-f2746451cb89`, parking: **no** → **yes**.

- Old quotation: "Parking is not permitted on Denham Court Drive." This is a rule about one road.
- New quotation: "Sat Nav: UB9 5PG Parking There are two carparks run by Bucks County Council." Source: `colnevalleypark.org.uk/visitor-centre/`, read 1 October, valid to 31 October.
- The old row is withdrawn (`disputed`) by the reconcile step and a new active row is inserted. Because nothing is active at that moment, the new row carries no `supersedes_claim_id`; the rollback therefore names the old id explicitly.
- Caveat for you: the page is the visitor centre's. The catalogue entry is the regional park. "Parking: yes" is right for the visitor centre and unproven for the whole park. It is still better than "no".

## The four same-value re-quotes

| Venue, fact | Old quotation | New quotation | Weakens? | In Option C |
|---|---|---|---|---|
| London Eye, pushchair: mixed | "…babies and children must not be carried up and down" | The same text with a trailing space | **No.** Identical in content. | Yes (harmless row replacement) |
| Chiswick House, pushchair: mixed | "…we cannot be held responsible for your belongings" | The same text with a trailing space | **No.** Identical in content. | Left out (venue) |
| Frameless, wheelchair access: yes | "The whole building is wheelchair accessible, including our toilets and Café Bar." (`/accessibility/`) | "There is a large chill out area with sensory lighting and a dark tent, and lifts to every floor including our disabled toilets." (`/accessibility/chilled-sessions/`) | **Yes.** An explicit venue-wide statement is replaced by a sentence from a sensory-sessions page. | Left out |
| Chiswick House, café: yes | "Don't forget to visit our Café Colicci, next to the playground, which has a great kids' menu." | "Baby changing is available in the toilets by the Café…" | **Yes.** A direct statement is replaced by an indirect one. | Left out |

## Is the production snapshot still current?

Yes, checked read-only at 22:25 UTC. The following match the state the simulations used:

- **76 active claims** at the 21 venues, all `source_evidence_auto_v2`. The sorted ids fingerprint to `882b02667bf8e90022b7c0150b8c2fae`, the same as the committed list (`active-claims-2026-10-08.txt`).
- All nine claims named above exist, active, with the quotations shown.
- Newest claim created 7 October 15:29; **0** evidence rows created since the export; newest stored page read 2 October 09:20.
- All 168 jobs are `completed`; **none pending or processing**. 0 drafts from `official-source-rules-v6`.
- `main` is still `b74a4c8`; nothing under `server/` or `api/` has changed since the simulations.
- A read-only copy of the function's own selection returns **21 eligible venues** (so 18 for Option C). **Museum of the Home stops being eligible at 10 October 00:36 UTC** (01:36 BST), 13 days after its 27 September reading; every other venue is eligible until 14 October. Run before the end of 9 October (UK) and Option C returns 18. Later it returns 17 and loses only that venue's wheelchair fact.

I will repeat the claims, jobs and eligibility checks immediately before you execute.

## No network, no model, no paid Google call

| Question | Answer, with where it comes from |
|---|---|
| What starts the work? | `enqueue_reextract_jobs` only inserts `reextract` job rows for the named venues. The existing every-minute worker then runs them. There are no other pending jobs, so nothing else can be picked up. |
| Does it fetch anything? | No. `api/enrichment/index.js` maps mode `reextract` to `{ sourceOnly: true, evidenceMode: 'stored' }`. `draft-store.js` then calls `verifiedBundleForVenue` (a read of the stored rows) instead of the crawler, `gatherEvidenceForVenue`. |
| Does it call a model? | No. `sourceOnly` takes the rule output (`reviewEvidence`) and records `estimatedCostUsd: 0`. `generateDraft`, the model call, is not reached. |
| Does it call Google? | No. Place Details exists only in the crawl path. The real-code run ran under a guard that throws on any socket or `fetch`: **0 attempts** in all three runs. |
| Can it touch other claims? | No. `reconcileSourceClaims` skips any approver other than the automatic one and any field outside the facility vocabulary, so pricing, age-policy, rule and hours claims are out of reach. |
| Can it extend a date? | No. `checked_at` is the page's reading date and `valid_until` is that plus 30 days. Nothing writes today's date. |
| Is it repeatable? | A second call returns 0, because each venue then has a v6 draft. |

**Note on today's Google usage.** `google_places_usage` already shows 19 `nearby_search` and **50 `place_photos`** for 8 October, written as late as 15:14 UTC. That is app traffic, not Step 1, and it means paid photo requests are still being made today (see the photo section of the report). After the run, the check is that no `place_details` or `text_search` row appears.

## The command (Option C)

Paste into the Supabase SQL editor. Expected return: **18**. A second call returns 0.

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
  'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y',
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
]);
```

(`command-recommended-18.sql`; the ids are `ids-recommended-18.txt`.)

## Post-run checks

`post-run-checks.sql`, all read-only, about 30 minutes after the command:

1. 18 jobs `completed`, `last_error` empty.
2. 18 `official-source-rules-v6` drafts.
3. The five claims are no longer active.
4. 18 new active rows written by the run: 16 added facts, the Colne Valley correction, the London Eye re-quote.
5. **88 active claims** at the 21 venues (76 − 4 withdrawn − 1 replaced + 1 correction + 16 added; the re-quote nets to zero).
6. Frameless, Chiswick House and Tate Modern: no row changed.
7. What the app serves: Colne Valley parking yes; Sydenham Hill Wood no accessible toilet.
8. No `place_details` or `text_search` usage row for today.

If any check fails I stop and report; I do not repair by hand.

## Rollback

`rollback-2026-10-08.sql` is one transaction. It:
1. marks every claim the v6 run wrote as `disputed` (this also frees the one-active-claim-per-field index);
2. reactivates what the run replaced (through `supersedes_claim_id`) and the five withdrawn claims;
3. restores the served row in `venue_family_metadata` for the 18 venues from a snapshot taken at 22:25 UTC today;
4. returns the active count and a fingerprint, which must be **76** and **`882b02667bf8e90022b7c0150b8c2fae`**, and only then commits.

How it was checked:
- The 18 snapshot statements were hashed against production, row by row, and all 18 match.
- The full rollback ran on a local PostgreSQL 16 database seeded with the real 76 claim ids and a simulated run (88 active). It returned 76 active and the identical fingerprint, restored the 18 served rows and left the three excluded venues unchanged.
- The simulation does not prove the real run writes exactly these rows. That is what post-run check 4 is for.

Limits: step 3 overwrites the served rows, so use the rollback only if nothing else has edited these venues since the run. The v6 drafts and job rows stay as the audit record, so after a rollback the same command returns 0 until they are removed. That would be a separate, deliberate step.

## After this run (not part of this approval)

The cause of the two weaker re-quotes is the replacement rule: a new quotation replaces the old one whenever the text differs, even if the old claim is still supported on its own page. A small change would keep the earlier claim unless the new quotation is stronger. It would stop the same thing recurring at Frameless and Chiswick House on the next scheduled refresh. It changes `main`, so I would prepare it as a separate branch with tests and not open a pull request without your instruction.
