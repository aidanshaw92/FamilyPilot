# Open-data ledger: the proposed migration (not applied)

2026-10-14. **Proposal only.** Nothing here has been run against production, and the SQL is deliberately outside the migrations folder
so no tool will pick it up. I will not apply it without your separate approval.

- The SQL: [`docs/ledger/001_open_data_ledger.proposed.sql`](ledger/001_open_data_ledger.proposed.sql)
- The rollback: [`docs/ledger/002_open_data_ledger.rollback.sql`](ledger/002_open_data_ledger.rollback.sql)
- A check that runs both in a throw-away in-memory Postgres: `node scripts/verify-ledger-proposal.mjs` (26 checks, all pass)

## 1. What it must do

1. Say, for every open-data place, **where it came from and on what terms**: source, version, licence, the exact attribution, when it was
   read and by what.
2. Make a row **impossible to store without that**, and a whole batch **removable in one step**.
3. Hold open-data content **apart from Google content**, so share-alike cannot reach what cannot be relicensed (see
   [OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md)) and so a place's existence does not depend on a Google clock (see
   [FRESHNESS_DISCOVERABILITY.md](FRESHNESS_DISCOVERABILITY.md)).
4. Support sources other than OpenStreetMap, each credited as itself.
5. Keep unknown facts unknown: store what the source said, never a guess.

## 2. Why the existing tables cannot do it

They can **hold** an open-data row. They cannot **guarantee** any of the five things above.

| Need | What exists | Why it falls short |
|---|---|---|
| Provenance per row | `place_records` has `provider`, `external_id`, `fetched_at` and a free-form `field_provenance` JSON | No licence, attribution, source version or batch column anywhere. Nothing stops a row being stored without them. The 19 OSM rows already there show it (below) |
| Remove a batch | none | A row cannot be traced to the batch that made it, so a withdrawal would be a guess by name or date |
| Separate from Google | one table, `place_records`, for every provider, readable with the public key | OSM-derived rows would sit in the same database as Google content. Share-alike on the one would be asked of the other |
| Other sources | `provider` is limited to `mock`, `google`, `osm`, `familypilot` | An OS or Wikidata row would have to be called `osm` or `familypilot`, and credits are chosen by provider, so it would be credited wrongly |
| Existence independent of Google's clock | `fetched_at` is one timestamp, and the catalogue reader serves `provider = 'google'` rows only, and only if fetched in the last 30 days | There is no row whose existence is not on a Google clock |
| Identity that outlives a Google row | `canonical_venues.primary_familypilot_place_id` must point to a `place_records` row; a place links to one canonical venue | A canonical venue can only be anchored on a stored place, and has no position or group of its own |

### What the existing OSM rows record

These are the two OSM museum rows already in production. They are real.

| Field | Chiswick House | Kingston Museum |
|---|---|---|
| `familypilot_place_id` | `fp-osm-679119297` | `fp-osm-632558518` |
| `external_id` | `osm:node/679119297` | `osm:node/632558518` |
| category | museum | museum |
| position | 51.4837, -0.2586 | 51.4096, -0.3003 |
| website | `https://chiswickhouseandgardens.org.uk/` | none |
| fetched | 2026-09-30 | 2026-09-30 |
| `field_provenance` | `{"googleTypes": []}` | `{"googleTypes": []}` |

Nothing says which extract or query they came from, which version of the OSM element was read, which tags made them `museum`, or
under what attribution. The 17 OSM food rows are the same.

## 3. Options considered

| | A. Columns on `place_records` | **B. Separate tables (recommended)** |
|---|---|---|
| Change to existing tables | adds columns, a constraint, and widens the provider check | **none** |
| Licence separation from Google content | no | **yes** |
| Public-read policy | would need a new rule so staged rows are not exposed | new tables get their own policy |
| Reuse of claims, evidence, links | direct | claims and evidence are keyed to `place_records`, so an open-data place needs a bridge when it is first enriched. **That bridge is not part of this migration** |
| Rollback | undo column changes in a live table | **drop three new tables** |
| Risk to the running app | any mistake is in a table the app reads | **none until a reader change ships** |

B is recommended because the licence question is the hard one and B is the only option that answers it by construction.

## 4. The schema

Three new tables. Full SQL in the file above.

**`place_import_batches`**: one row per import. `source`, `provider` (osm, os_open_greenspace, wikidata, mapping_museums,
borough_open_data), `source_version`, `source_url`, `licence` (ODbL-1.0, OGL-3.0, CC0-1.0, CC-BY-4.0), `licence_url`, `attribution`
(not blank), `share_alike` (true exactly when the licence is ODbL), `retrieved_at`, `retrieved_by` (script and commit), `row_count`.

**`open_data_places`**: the places. `familypilot_place_id` (unique), `import_batch_id` (**required**), `source_record_id`, `name`,
`group_id` (parks, museums, animals, play, attractions), `subtype`, `lat` and `lng` (inside a London box), `website`, `address`,
`source_tags` (the deciding tags, verbatim), `operating_status` (unknown by default; any other value needs `status_evidence`),
`identity_checked_at`. Unique per batch and source record. **No phone and no email**: OSM tags can carry a small business's personal
contact details, and a family app has no use for them.

**`open_data_place_links`**: joins an open-data place to a stored Google place **by id only**, with a match method (name and distance,
website, manual), a confidence, and who reviewed it.

**Security.** Row-level security on all three. The batch ledger and the links have no policy: server only. The places are readable with
the public key, because showing them to the public is the purpose and the ODbL notice and export are written for that. Grants are
revoked from the public roles explicitly because Supabase grants them by default.

## 5. Rollback

- **One batch** (the normal case): in one transaction, count that the batch has its `row_count` places, delete them (links go with them),
  delete the batch. Nothing else references a place.
- **The whole ledger**: drop the three tables.

No existing table is altered, so either leaves production exactly as it was. The check script exercises both and confirms the Google
place and `place_records` are untouched.

## 6. The ten-row sample

**I cannot produce the first import's real ten rows, because I cannot read any open-data file** (network policy; see
[OPEN_DATA_SOURCES.md](OPEN_DATA_SOURCES.md)). Writing venue names from memory is exactly what the plan says not to do. What follows is
what I can show truthfully.

**Rows 1 and 2 are real**, the two OSM museum rows already stored. Under the ledger each would be re-read from a named extract and stored
with its provenance. Today the source tags that decided their category were not kept, so **what makes them museums is unknown**.

**Rows 3 to 10 are specimens of the eight outcomes an import can have.** They name no venue. Angle brackets mean "taken from the source".
This shows exactly which fields are stored, which facts are evidenced and which stay unknown.

| # | Outcome | Source | Stored | Evidenced by the source | Stays unknown |
|---|---|---|---|---|---|
| 1 | Real: Chiswick House | OSM (already stored) | name, position, website, group museums | name, position, website | what tags made it a museum; version; every family fact; hours |
| 2 | Real: Kingston Museum | OSM (already stored) | name, position, group museums | name, position | website; version; every family fact; hours |
| 3 | Park with a play space inside | OS Open Greenspace, park joined to a play space | `<name>`, a point inside the park, group parks, subtype park, OS function tags | it is a public park; a play space lies inside it | toilets, parking, baby changing, cafe, hours, age range |
| 4 | Named playground | OSM `leisure=playground` | `<name>`, position, group parks, subtype playground, the tags | it is a playground. **Only if tagged:** `wheelchair`, `min_age`, `max_age` | everything the tags do not say |
| 5 | Museum | Wikidata item with a website and coordinates | `<label>`, `<coordinates>`, `<website>`, group museums | identity, website | hours, all family facilities, family suitability |
| 6 | Farm or animal attraction | OSM `tourism=zoo` with a farm or petting-zoo tag | `<name>`, position, group animals, subtype from the tag | its kind, from its tag | hours, facilities, age range |
| 7 | Trampoline park | OSM `leisure=trampoline_park` | `<name>`, position, group play, subtype trampoline_park | trampolines | **soft play: not confirmed.** It is not called soft play |
| 8 | Duplicate of a stored Google venue | any | one `open_data_places` row **and a link** (method, confidence, reviewer if under 0.95). No second listing | its open identity, which now outlives the Google row | whatever the Google row had and the open source does not |
| 9 | Tagged disused, abandoned or closed | any | **not stored.** Listed in the rejected report with the tag | n/a | n/a |
| 10 | Cannot be classified from its tags | any | **not stored.** Listed in the rejected report | n/a | n/a |

Every stored row also carries: its batch, the source's own id and version, the retrieval time, `operating_status = unknown` unless the
source says otherwise **with its evidence**, and **no Google value of any kind**.

When one extract can be read, rows 3 to 10 are replaced by ten real rows chosen from the candidate file, and I will send them before
you are asked to approve anything.

## 7. Implications

**Production data.** Additive only. No existing table, column, constraint, policy or row changes. Dropping the three tables removes
the migration completely.

**Privacy.** No user data is involved. Open-data places are public features. Contributor names are not in the public OSM extract and are
not stored. Phone and email are not stored.

**Licensing.**
- ODbL rows (OSM) bring attribution and share-alike. They sit in their own table so an offer of that table under the ODbL contains only
  what can be offered. An export of the ODbL batches is published and linked from the credits.
- OGL rows need the provider's attribution statement and the licence link. CC0 needs nothing. CC BY needs credit.
- **Not settled:** the seven questions in [OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md) section 6. Counsel should read them before the
  first import.

**Google.** No Google content crosses into the new tables, and the link table holds only a place ID. Positions in open-data rows come
from open sources, which removes the 30-day limit and the non-Google-map question for those places. Whether place IDs are exempt from
the caching limit is still to be confirmed, and the link table depends on it.

**Cost.** Zero Google. A few hundred small rows.

**What this migration does not do.** It changes nothing the app reads. Explore shows nothing new until a later reader change reads
`open_data_places`, applies the three-state rule from the freshness note, and credits each provider from its batch. Enrichment of an
open-data place (claims, evidence) needs a bridge to `place_records`, which is a separate design.

**The repository's privilege checks.** The `privilege-model` job asserts least privilege on public tables. The new tables will need
their grants added to that check in the same change that adds them.

## 8. Before you approve

1. Counsel's read of the ODbL questions.
2. Google's place-ID policy confirmed.
3. One readable extract, so the candidate file, the ten real rows and the supply counts exist.
4. A dry run of the SQL on a copy of production, not only the in-memory check here.
