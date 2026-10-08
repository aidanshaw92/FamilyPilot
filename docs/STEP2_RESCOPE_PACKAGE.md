# Step 2 package: the website-identity rescope, ready for a decision

2026-10-08. Nothing here has been run against production. Step 2 is separate from Step 1 (`STEP1_REEXTRACT_GATE.md`)
and should not be combined with it.

## 1. The complete dry run, reproduced independently

`scripts/rescope-evidence.mjs` was run today in its offline mode against a fresh read-only export of **all 2,212
stored evidence rows** and the 168-row catalogue (`--input … --catalogue … --as-of 2026-10-08`), with the identity rules
that #175 merged. The result matches the dry run recorded in `WEBSITE_IDENTITY.md` line for line:

| | Rows | Venues |
| --- | ---: | ---: |
| Rows whose verdict changes | 102 | |
| **Become eligible (would be written)** | **64** | **9** |
| Lose eligibility (reported, never written without `--include-narrowing`) | 35 | 8 |

**The 9 venues gaining eligible rows,** and whether their readings are inside the 14-day window today:

| Venue | Rows | From → to | Inside the window | What the rows carry (high-confidence facts) |
| --- | ---: | --- | ---: | --- |
| Madame Tussauds London | 14 | organisation ancestor / sibling → own | 11 | parking no; buggy access difficult; baby changing (7 Oct reading: "We have baby-changing facilities located at regular points within the attraction"); quiet sessions |
| Wimbledon Lawn Tennis Museum | 11 | organisation ancestor / sibling → own | 11 | none at high confidence |
| Dulwich Park | 8 | sibling → own | 8 | parking yes; free parking no; playground (a "recent posts" teaser) |
| Walthamstow Wetlands | 6 | sibling → named page | 4 | toilets, accessible toilet, baby changing, café, parking yes, free parking no, wheelchair access (the reserve's own page); quiet sessions and "outdoor" from an events page |
| Trent Park | 13 | sibling → own | 2 | none at high confidence |
| Crystal Palace Park | 5 | sibling → own | 0 (read 11 Sep) | playground; toilets; accessible toilet; and a venue-hire room's "Dedicated toilet facilities" |
| Primrose Hill | 3 | other catalogue venue → own | 2 | playground |
| London Cable Car | 3 | sibling → own | 0 | none at high confidence |
| Tooting Commons | 1 | sibling → own | 1 | playground |

## 2. The claim inventory: what may become eligible, what must stay out

These are the only facts the rescope can put in front of a reviewer. **None can be published automatically:** a rescoped
row is excluded from auto-approval (`excludeRescoped`), and reconciliation will not let it refresh, contradict or
withdraw a claim. The facts appear in the venue's draft for a person to approve or decline.

**May be approved (17):**

| Venue | Facts | Note |
| --- | --- | --- |
| Walthamstow Wetlands | toilets, accessible toilet, baby changing, café, parking yes, free parking no, wheelchair access | 7, from the reserve's own page; readings 27 Sep and 7 Oct |
| Madame Tussauds | parking no; buggy access difficult; quiet sessions; **baby changing yes** | 4; baby changing only on the 7 Oct wording quoted above, never on "ask a member of staff for the nearest" (which v6 now rejects) |
| Dulwich Park | parking yes; free parking no | 2 |
| Crystal Palace Park | playground; toilets; accessible toilet | 3, but every reading is from 11 September and outside the window: it needs one `refetch_official` read first |
| Primrose Hill | playground | 1 |
| Tooting Commons | playground | 1 |

(The count is 18 with Madame Tussauds' baby changing, which the earlier review rejected on the September wording; the
7 October reading states it plainly, so the reviewer may accept it on that quotation.)

**Must stay rejected or disputed (4):**

| Venue | Fact | Why |
| --- | --- | --- |
| Madame Tussauds | baby changing on "Please ask a member of staff for the nearest baby changing facilities" | does not say it is on site (v6 rejects the sentence anyway) |
| Walthamstow Wetlands | environment "outdoor", quiet sessions | from an events listing ("outdoor storytelling session"), not a venue fact |
| Crystal Palace Park | toilets on "Dedicated toilet facilities" | a venue-hire room, not public toilets |
| Dulwich Park | playground on "Playground railings are being restored!" | a news teaser; true, but the reviewer should wait for a facilities page |

**Narrowing (35 rows, not written):** 33 are Historic England register pages for Belair, Broomfield, Clissold, Danson
and Walpole Parks, plus Brockwell and Roundwood, which correctly stop counting as visitor pages and back no served
claim; 2 are Hatfield Park's opening-times page, which backs two served parking claims. Writing narrowing would withdraw
those two, so it stays a separate decision with `--include-narrowing`.

## 3. The procedure, with its safeguards

| Step | Command | Why |
| --- | --- | --- |
| 1 | `select cron.alter_job(job_id := 2, active := false);` | Pause the every-minute worker so no draft is generated while scopes change. The hourly freshness job (5) only queues; it may stay on. |
| 2 | `RESCOPE_CONFIRM=yes node scripts/rescope-evidence.mjs --write` (needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | Writes `subject_scope` and `subject_scope_reason = 'rescoped_2026_10 from <old>: <reason>'` on the 64 rows, one at a time, and only where the row still holds the verdict the run read. Prints `written: N, skipped: M`. Expected 64 / 0. |
| 3 | `select cron.alter_job(job_id := 2, active := true);` | Resume. |
| 4 | `select public.enqueue_reextract_jobs('official-source-rules-v6', 10, array['fp-google-ChIJgZ24Us4adkgRpDNAwNPO_SY','fp-google-ChIJ2yb0sesadkgRIQOyE6qMxLU','fp-google-ChIJi104LjcFdkgRnzOHTtw-7kM','fp-google-ChIJgUtOcjEcdkgR6Y_NLIc0XBQ','fp-google-ChIJbSe-4PoDdkgReFaqbED1N9o']);` | Re-read stored pages for Madame Tussauds, Primrose Hill, Tooting Commons, Walthamstow Wetlands and Dulwich Park; their drafts then carry the rescoped facts, unpublished. (If Step 1 ran first and these already carry v6, re-queue them with `enqueue_venue_enrichment_jobs('reextract', …)`.) |
| 5 | `select public.enqueue_venue_enrichment_jobs('refetch_official', array['fp-google-ChIJ94vQ-0IBdkgRxsGErkV2hZo']);` | Crystal Palace Park: one website read of its own site (no Google), because its readings are from 11 September. |
| 6 | Internal review screen | A person approves the facts in §2 and declines the four rejected ones. |

**Failure recovery.** If step 2 stops part way, the rows already written carry the tag and the rest keep their old
verdict; re-running the same command writes the remainder and skips the done ones (`skipped` counts rows whose verdict
no longer matches). If the worker is left paused by mistake, every job simply waits; nothing is lost. If a draft is
generated before the review, it is pending and unpublished.

**Rollback (row by row, auditable):**

```sql
update venue_source_evidence
set subject_scope = split_part(split_part(subject_scope_reason, 'from ', 2), ':', 1),
    subject_scope_reason = null
where subject_scope_reason like 'rescoped_2026_10 from %';
```

A claim approved from a rescoped row can be disputed like any other (`update venue_claims set status='disputed' where
id=…`); the undo in `STEP1_REEXTRACT_GATE.md` §6 applies.

**Observability.** `subject_scope_reason like 'rescoped_2026_10%'` lists every touched row; drafts for the five venues
show `evidenceMode = 'stored'`; the review screen shows the rescoped facts as pending.

## 4. Human review required

- One reviewer, one sitting: 17–18 facts to approve, 4 to decline, at 6 venues.
- Crystal Palace Park's three facts only after its fresh read lands (step 5), so a second short sitting.
- Expected effect: +5 destinations with a shown fact (Crystal Palace Park, Madame Tussauds, Primrose Hill, Tooting
  Commons, Walthamstow Wetlands) and Dulwich Park gains parking.

## 5. What is needed to run it

The script's write mode reads the database directly, so it needs the service-role credentials in the shell that runs
it. This session has no credentials and no outbound database access, so steps 2 and the review are yours (or a session
with the credentials); steps 1, 3, 4 and 5 are SQL in the Supabase editor.
