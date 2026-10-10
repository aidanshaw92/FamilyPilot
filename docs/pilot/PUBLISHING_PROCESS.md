# Publishing approved rules and hours: a rehearsed, reversible process

9 October 2026. Nothing is published. Rules and hours are the only pilot evidence that can refuse a date or a household, so they get their own tool, checked on a throwaway database first.

## The steps

1. **A person decides** (the five on `DECISION_SHEET_FIVE.md`, plus the other wave-1 cards). The decision goes into the audit trail with their name.
2. **I build the batch** (writes files only; never connects to a database):
   `node scripts/pilot/publish-batch.cjs --items <itemIds> --approver human:<name> --out-dir batch-wave1 [--warn-only <ruleId>]`
   It refuses an approver that is not a named person (nothing automatic or "assumed" can publish a rule), a reading older than its window, a venue that is not a pilot venue, and an item that is not a rule. Output: `apply.sql`, `rollback.sql`, `manifest.json` (every claim with its source, quotation, value, expiry, and the hashes of both scripts).
3. **I rehearse it** on a throwaway local PostgreSQL built from the real `venue_claims` definition, with stand-in pre-existing claims (`scripts/pilot/rehearse-batch.cjs`). The rehearsal for the nine wave-1 cards' worth of rules (10 claims at 3 venues) passed all 14 checks: apply adds exactly the batch and changes nothing else; the app's own projection then shows every rule and the hours; a second run is **refused** and changes nothing; the rollback disputes exactly the batch and the app shows none of it again; every pre-existing claim is identical before and after; a re-publication under a new label works; an unknown venue aborts.
4. **You read `manifest.json`** (it is a plain list of what will be said to families, with each quotation) and **authorise the batch**, naming it. That authorisation is the production write.
5. **Run `apply.sql` as one run** in the Supabase SQL editor. It aborts as a whole (nothing kept) if a venue is missing, if any of its fields already has an active claim, or if the row count is not exactly the batch.
6. **I verify**: the monitoring SQL (block 4 lists the rules in force), and the real app for each affected venue (the Natural History Museum on its dates, Discover's warning).
7. **Undo**: `rollback.sql` as one run. It withdraws exactly the batch's rows (status `disputed`, nothing deleted) and aborts unless none is left active. No other tool is needed and nothing depends on me.

## What this does not solve: rules lapse after 30 days

A rule is valid for 30 days from the day its page was read, and an hours reading for 45. The December closures read on 8 October therefore stop being used on **7 November**, before the closure they describe. That is deliberate (pages change) but it means **someone has to re-read and re-approve the pilot venues' rules about every month**, for as long as the venues are in the beta. For ten venues that is a monthly batch of the same nine cards. It is a cost of the safety model, not a bug, and it is one more reason not to expand to 50 venues yet. Until a re-read happens the app falls back to Google's hours and shows no rule (the safe direction).
