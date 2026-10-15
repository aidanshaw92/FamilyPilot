# Open-data dry run

Reads a licensed extract from a **local file**, applies the quality gates, and writes a candidate file and a report. It makes no network
request, opens no database connection, calls no Google API, and imports nothing. Importing is a separate, approved, reviewed migration
(`docs/LEDGER_MIGRATION_PROPOSAL.md`).

```
node scripts/open-data/dry-run.mjs --osm london-family.geojson --version 2026-10-14 --out ./dry-run-out [--stored rows.json] [--seed 7]
```

Writes `candidates.jsonl` (shaped like the proposed `open_data_places` table), `links.jsonl` (duplicates of a stored place, to be
linked and not listed twice), `rejected.csv` (each with the gate that stopped it), `spot-check-40.jsonl`, `sample-10.json` and `report.md`.

## Before running on a real extract

1. Read the licence and attribution for that source (`docs/OPEN_DATA_SOURCES.md`) and record them for the batch.
2. Run it, then **read 40 accepted and 40 rejected rows**. The tag rules in `lib/osm-classify.mjs` are written from the tag definitions
   and tested on a synthetic fixture; they have not yet met real data and will need calibrating.
3. `--stored` is Google content. It is used in memory to find duplicates and is never written to the output.

## The gates

| Gate | Rejects when |
|---|---|
| identity | no name; a duplicate inside the batch |
| classification | no classifying tag (a name alone is never enough) |
| location | no usable coordinate, or outside the London box |
| operating status | mapped as disused, abandoned, was, demolished, not open to the public, or `opening_hours=off` |

Facts are copied only when the source states them. A tag that is absent is unknown, never "no". Operating status is unknown unless the
source says otherwise, with the tag that says so. Phone and email are never kept.

The fixture in `fixtures/` is synthetic: every place is named "Fixture ...".
