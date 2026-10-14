# Google data retention: audit and correction proposal

14 October 2026. **Nothing here has been executed.** No row was deleted, no grant changed, no migration applied. The production figures are read-only aggregate counts taken on 14 October (no row contents). The terms are quoted from Google's own pages, fetched on 14 October by a GitHub runner (this session's network cannot reach them). It is an engineer's reading, not legal advice.

## 1. What the primary terms allow

| Source | Text (as published on 14 October) |
|---|---|
| Maps Platform Terms of Service, 3.2.3(a) No Scraping | "Customer will not export, extract, or otherwise scrape Google Maps Content for use outside the Services. For example, Customer will not: (i) pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services; (ii) bulk download ... places information ...; (iii) copy and save business names, addresses, or user reviews" |
| same, 3.2.3(b) No Caching | "Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms." |
| same, 3.2.3(c) | "Customer will not create content based on Google Maps Content", including "(iv) use latitude/longitude values from the Places API as an input for point-in-polygon analysis" |
| same, 3.2.3(e) No Use With Non-Google Maps | "Customer will not (i) display or use Places content on a non-Google Map" |
| Service Specific Terms, 3 Google ID Caching | "Customer may cache ... place_id from Places API" |
| same, 14.1 | "Customer may use Google Maps Content from the Places API in Customer Applications without a corresponding Google Map." |
| same, 14.2 | "Customer must not use Google Maps Content from the Places API in conjunction with a non-Google map." |
| same, 14.3 Caching | "Customer may temporarily cache latitude and longitude values from the Places API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude and longitude values." |
| Places API policies | "You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions, although the place_id is exempt from caching restrictions." "You can therefore store place ID values indefinitely." |
| Place IDs guide | Place IDs "can be stored and reused, but it's recommended to refresh them if they are over 12 months old." |

**What follows.** The only Places content FamilyPilot may keep is **the place ID** (indefinitely; refresh after 12 months) and **latitude and longitude for at most 30 consecutive days**. Everything else, including **name, address, phone, website, opening hours, rating, summary, photo references, types and business status, may not be stored at all, not even for 30 days.** Earlier documents in this repository (including the 30-day catalogue gate) treated the 30 days as covering the whole row. That was an assumption; the primary text does not support it. Three things could change this reading and are for a lawyer or for you to check: the billing address (the page says EEA customers have different terms), any negotiated agreement, and 3.2.3(d)(iii), which forbids use "in a listings or directory service" and which Explore may touch.

## 2. What is stored where (production, 14 October)

| Where | What | Size today | Who can read it | Against the terms |
|---|---|---|---|---|
| `place_records`, provider `google` | name, address, description, opening hours, website, phone, photo references, open flag, `field_provenance` (Google types), latitude, longitude | **149 rows**: all with address, 142 with a website, 119 with hours, 47 with a phone, 145 with photos, 44 with a description; 4 older than 30 days; newest 9 October | **Anyone with the anon key.** The table is deliberately world-readable (`grant select ... to anon, authenticated`, policy "Place records are publicly readable"), and the key ships in the client | Name, address, hours, phone, website, photos and types are stored; latitude and longitude are held past 30 days for 4 rows and the gate hides, but does not delete, expiring ones. Public read is re-distribution |
| `place_records`, provider `osm` | 19 rows from the OpenStreetMap food lookup | 19 | public | Not Google content |
| `place_search_cache` | search responses from the Places providers, up to 6 hours, deleted by `purge_expired_place_search_cache()` | not counted here | server only (RLS on, no policy) | Cached content beyond the two allowed items, for hours |
| Vercel edge cache | `/api/places/search` is served with `s-maxage` of the search TTL (6 hours) and `/api/places/detail` with `s-maxage=300` | transient | public, by URL | Cached content at the edge |
| Device, `places-cache.ts` | search results for 10 minutes and detail for 30, with stale-while-revalidate up to 6 hours, in memory and AsyncStorage | per device | the device | Cached content on the device |
| Device, saved places | whole venue objects in AsyncStorage (`saved-store.ts`), kept until the parent removes them | per device | the device | Stored indefinitely |
| `planning_workspaces`, `planning_connections`, `plan_invites` | saved places and days, and shared plan snapshots, as JSON | **0 rows each** | owner only / service role | Would store venue snapshots, but nothing has been synced yet |
| Journey times and the Meet halfway corridor | computed from `place_records` latitude and longitude at request time and saved inside plans as minutes | computed, small | the plan's owner | Derived from coordinates; harmless for 30 days, and 3.2.3(c) is arguable for derived content |
| Supabase backups of `place_records` | whatever the project's backup plan keeps | by plan | the project | Cannot be redacted selectively |
| This repository (public) | audit JSON with names and Google types (`docs/audit-*.json`), test fixtures read from `place_records` on 12 October (`stored-venues.ts` and others), place IDs throughout | about 20 files | anyone, and git history | Place IDs are allowed; names, types and fixture rows are Google content |

`planning_workspaces` and the plan tables being empty is the useful fact: the storage that is hardest to correct, user-owned data on servers and phones, has not yet been created in production, so the model can be fixed before launch.

## 3. Correction proposal, in order

Each step names what it needs from you. None is done.

**1. Close the public read of `place_records` (a migration; needs your approval).**
Revoke `select` on `place_records` from `anon` and `authenticated` and drop the public-read policy. **Nothing in the app reads it directly:** a search of `familypilot/src` and `app` finds no `.from('place_records')`, and the server reads it with the service role. So this changes no behaviour a parent sees, deletes nothing, and ends the re-distribution immediately. Rollback: re-grant.

**2. Stop persisting provider content on the device (an app change; needs your approval, ships in the next release).**
Provider content (names, addresses, hours, photos) is held in memory only and never written to AsyncStorage; the device persists place IDs and our own independent identity keys, and re-resolves what to show. Saved places and saved days migrate on first launch by dropping the provider fields. The cost is one extra request when a saved place is opened.

**3. Save references, not copies, in plans (an app and API change; before any account syncs).**
`planning_workspaces.data`, `plan_invites.plan_snapshot` and the connection snapshots store the venue's id and our own derived text (the day's times and notes), not a copy of the venue. Because those tables are empty, there is nothing to migrate.

**4. Redact stored Google rows (a migration; needs your approval and comes after cutover).**
For provider `google`: keep `familypilot_place_id`, `external_id` (the place ID), our `category`, and latitude and longitude only while `fetched_at` is within 30 days; set name, address, description, opening hours, website, phone, photos, open flag and the Google part of `field_provenance` to null. **It cannot be reversed** except by paying to re-fetch, so it must follow cutover (otherwise the catalogue empties early; it empties on 8 November in any case). Proposed SQL, not run:

```sql
update public.place_records
set name = '', address = null, description = null, opening_hours = null, website = null, phone = null,
    photos = '[]'::jsonb, is_open = null,
    field_provenance = field_provenance - 'googleTypes' - 'googlePrimaryType',
    lat = case when fetched_at >= now() - interval '30 days' then lat else null end,
    lng = case when fetched_at >= now() - interval '30 days' then lng else null end
where provider = 'google';
```
(`lat` and `lng` are `not null` today; a migration would relax that, or use a sentinel. Counts to confirm first: 149 rows.) Supabase's own backups keep the old content for the plan's retention window; that is a project setting, not something SQL can redact.

**5. Stop caching provider content at the edge and in the search cache (a config and code change).**
Serve provider responses `Cache-Control: no-store`, and keep `place_search_cache` to place IDs and coordinates only. This has a Google-cost consequence the day Google search is on again, which is why it follows the independent catalogue rather than preceding it.

**6. Replace the repository's Google-derived fixtures (code; no approval beyond review).**
Replace `docs/audit-*.json` and the test fixtures read from `place_records` with synthetic or independently sourced ones. Git history keeps the old files; removing them from history is a decision for you (a rewrite of a public repository).

**7. Journey and corridor calculations.**
After cutover they run on independent coordinates. Before it, nothing changes: the derived minutes are small, and whether derived distances are "content based on Google Maps Content" (3.2.3(c)) is a question for a lawyer.

## 4. What I need from you

1. **Approve step 1** (revoke public read). It is the cheapest and removes the largest exposure.
2. **Approve steps 2 and 3** for the next release, so no new copies are created while the catalogue is being replaced.
3. **Decide timing for step 4** (redaction), which is irreversible and should follow the cutover of each category.
4. **Check the three things I cannot:** whether the Google account is billed in the EEA, whether any negotiated agreement exists, and whether Explore counts as a "listings or directory service" under 3.2.3(d)(iii) once it serves an independent catalogue (it may no longer matter, because the content would not be Google's).

The recovery plan and this audit point the same way: after cutover the app serves identities and positions from sources whose licences allow it, and Google contributes a place ID and, within 30 days, a coordinate. The one-off Google refresh in `GOOGLE_REFRESH_CONTINGENCY.md` would re-store names and addresses and is therefore **not** compliant, whatever the 30-day window.

## 5. Status after 14 October (second pass)

Production counts re-read the same day, read-only: `saved_places_backups` 0 rows, `planning_workspaces` 0, `planning_connections` 0, `plan_invites` 0. Every saved place and plan is on a device, none on a server (see `docs/SAVED_PLACE_CONTINUITY.md`).

| Step | State | Needs |
|---|---|---|
| 1. Close the public read of `place_records` | SQL below, **not applied** | your approval |
| 2. Stop keeping provider content on the device | the part that stops *new* copies is code in the retention PR (device cache: Google results kept in memory only, an older copy removed when replaced). Existing saved places keep their stored copy: dropping it is a migration, and it must run **after** the reconnect proposal has read it (the order is explained in the continuity note). | your approval of the migration, with the reconnect experience |
| 3. References, not copies, in plans and backups | backups: a Google place is backed up as its id alone (the retention PR). Plan sync: no row exists, and the shared-day projection already carries venue ids and our own derived text; no change needed before launch. | merge with the Tranche A release |
| 4. Redact stored Google rows | SQL above, **not applied**, and must follow the cutover of each category (the catalogue empties on 8 November anyway) | your approval and the cutover |
| 5. No edge cache of provider content | code in the retention PR (a response holding a Google place is `no-store`; one made only of independent venues is cached as before) | merge with the Tranche A release |
| 6. Replace Google-derived fixtures in the repository | not started: about 20 files (`docs/audit-*.json`, fixtures read from `place_records`); git history keeps the old ones | review only; removing history is your decision |
| 7. Journey and corridor calculations | none to change: after cutover they run on independent coordinates; whether a derived distance is "content based on Google Maps Content" (3.2.3(c)) remains a question for a lawyer | nothing |

Nothing has been deleted, no grant has changed, no migration has run, and no plan has been altered.

### Step 1, proposed SQL (not applied)

Nothing in the app reads `place_records` with the public key (the server reads it with the service role), so this changes no behaviour a parent sees.

```sql
drop policy if exists "Place records are publicly readable" on public.place_records;
revoke select on public.place_records from anon, authenticated;
-- rollback:
-- create policy "Place records are publicly readable" on public.place_records for select using (true);
-- grant select on public.place_records to anon, authenticated;
```
