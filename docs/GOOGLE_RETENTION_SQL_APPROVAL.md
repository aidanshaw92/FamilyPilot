# Google retention: the SQL approval request

14 October 2026. **Nothing here has been run against production except read-only queries** (listed below, so you can repeat them). No DDL was executed, not even inside a rolled-back transaction. This is one request, for one change.

## The request

**Approve one migration: close the public read of `place_records`.** It removes one row-level-security policy and two grants. It changes no row, no column and no table, deletes nothing, and no saved place, plan or venue reference depends on it.

```sql
-- migration: close the public read of place_records
drop policy if exists "Place records are publicly readable" on public.place_records;
revoke select on public.place_records from anon, authenticated;
```

Rollback (restores the exact previous state, takes effect immediately, loses nothing because nothing is changed):

```sql
create policy "Place records are publicly readable" on public.place_records for select using (true);
grant select on public.place_records to anon, authenticated;
```

**Why it is needed.** Today anyone holding the app's public key can read the whole table directly, including Google's name, address, hours, website, phone and photo references for 149 venues. That is re-distribution of Google Maps Content, and it continues until closed. Closing it does not depend on the catalogue recovery; it can be done now.

## What would change, exactly (read-only, 14 October)

| Object | Now | After |
|---|---|---|
| Policy `Place records are publicly readable` (SELECT, role `public`, `using (true)`) | present | dropped |
| `anon` grant on `place_records` | `SELECT` | none |
| `authenticated` grant | `SELECT` | none |
| `service_role` grants | all | unchanged |
| Row-level security | on | on |
| Rows `anon` can read (`set local role anon` inside a read-only transaction, rolled back) | **168** (149 Google, 19 OpenStreetMap), 149 with an address | permission denied |
| `has_table_privilege('anon', 'public.place_records', 'select')` | true | false |

## Who reads the table (so nothing breaks)

- **The apps.** `git grep place_records` over `familypilot/src` and `familypilot/app` finds **no reference at all**. The client uses the public key for sign-in only (`services/supabase/client.ts`).
- **The server.** `api/places/*` and `server/enrichment/*` read it with the **service-role** key, which keeps every privilege. The enrichment scripts under `scripts/` also use the service role.
- **Live check after the change** (the same two queries above plus one request to `/api/places/search`, which must still return the stored catalogue) is part of the migration's verification and its rollback trigger: if the search endpoint stops returning places, run the rollback.

## Provider-origin verification (read-only)

| Provider | Rows | `external_id` shape | Google types stored | Fresh (30 days) | Older |
|---|---:|---|---|---:|---:|
| `google` | 149 | all `google:` + a place id (34 characters) | 147 with a list of types (all 149 carry a primary type) | 144 | 5 |
| `osm` | 19 | all `osm:`, no Google shape | key present but empty in all 19 | 19 | 0 |

No row crosses providers: no `osm` row has a Google id or any Google type, and every `google` row carries both. Every `familypilot_place_id` is unique within its provider (149 of 149 and 19 of 19).

## Effect on saved places, plans and venue references

| Where | Rows in production | Effect |
|---|---:|---|
| `saved_places_backups` | 0 | none |
| `planning_workspaces`, `planning_connections`, `plan_invites` | 0, 0, 0 | none |
| Saved places and days | on the parent's device only (`docs/SAVED_PLACE_CONTINUITY.md`) | none: the device never reads this table |
| Rows referencing `place_records` (`venue_family_metadata` 168, `venue_enrichment_drafts` 904, `venue_source_evidence` 2,215, `venue_claims` 988, `venue_place_links` 6, `canonical_venues` 3) | as shown | none: they hold ids, and the migration changes no row |

**A related hazard this packet avoids:** six tables reference `place_records` with `ON DELETE CASCADE` or `RESTRICT`. **Deleting a `place_records` row would cascade-delete its evidence and claims (2,215 + 988 + 904 rows today).** Nothing proposed here, now or later, deletes a row; the later step below is an `UPDATE` for that reason.

## Backup and rollback

- The migration changes no data, so no data backup is needed to undo it; the rollback above restores the previous access exactly.
- Supabase's own backups of `place_records` (including the Google columns) follow the project's plan and cannot be redacted selectively. That is a project setting to confirm, not something SQL can change, and it is the same before and after this migration.
- Verification recorded in the PR that carries the migration: the two privilege queries, the `anon` row count (expected: permission denied), and a production search request.

## The licensing rationale (primary text, fetched 14 October)

Google Maps Platform Terms, 3.2.3(a): the customer "will not export, extract, or otherwise scrape Google Maps Content for use outside the Services ... (i) pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services". Service Specific Terms: the customer "may cache ... place_id", and "may temporarily cache latitude and longitude values from the Places API for up to 30 consecutive calendar days". Everything else (names, addresses, hours, websites, phone numbers, photo references) is not storable at all. A world-readable table of those fields is the clearest breach in the audit; closing it is the smallest action that ends it. An engineer's reading, not legal advice.

## Not requested now (shown so the whole picture is visible)

1. **Redaction of the stored Google columns (`UPDATE`, irreversible).** Dry run, read-only: it would touch exactly the **149** `google` rows (the `osm` rows are excluded by `where provider = 'google'`), setting to empty or null: name 149 (a `NOT NULL` column, so an empty string), address 149, description 44, opening hours 119, website 142, phone 47, photos 145, open flag 122, the Google keys inside `field_provenance` 149, and latitude and longitude for the **5** rows older than 30 days (`lat` and `lng` are `NOT NULL` today, so the migration must relax that). The 144 fresh rows keep their coordinates until they age out. It is **irreversible without paying to re-fetch**, so it follows the cutover of each category and gets its own approval. The SQL is in `docs/GOOGLE_RETENTION_AUDIT.md` (step 4).
2. **Evidence and enrichment tables.** 885 of 904 enrichment drafts carry the word "google" in their `source_context`. Looking at what it is (field names and the words around them, no content): the venue's id (`fp-google-<place id>`, which is allowed), the label `google_provider` as a source type, and **the venue's own website address as Google listed it** (with Google's tracking parameters such as `utm_source=google`). The websites are the venues' own pages and the page text is ours; but the address was *learned* from Google's website field, which is Google content. This does not need the migration above. It needs a decision: for venues that continue in the independent catalogue, take the website from the independent source or the operator and strip the tracking parameters; for venues that do not continue, remove them with the redaction.
3. **Repository fixtures** read from `place_records` (about 20 files). Code, not SQL; no approval beyond review.

## What I am asking

Reply **"approve the migration"** and I will apply it as one migration, run the three verification queries and the production search request, and record the results. No other SQL is requested. I will not apply it without that reply.
