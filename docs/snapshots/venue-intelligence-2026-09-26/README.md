# Venue Intelligence baseline snapshot — 2026-09-26

The inputs behind `docs/VENUE_INTELLIGENCE_BASELINE.md`, so every figure in that report can be
re-derived rather than taken on trust:

```bash
node scripts/audit-venue-readiness.js --corpus docs/snapshots/venue-intelligence-2026-09-26 \
  --today 2026-09-26 --expect-venues 134
```

Each file was transferred from production with an md5 computed in SQL and verified byte-for-byte
locally. Verify with `printf '%s' "$(cat <file>)" | md5sum`:

| file | rows | md5 | source table |
| --- | --- | --- | --- |
| `places.txt` | 134 | `77a02bd82d101697a69a3c7b3b26b638` | `place_records` |
| `meta.txt` | 134 | `f8ab1d7c46eafe93baddb25d6eaf5b2e` | `venue_family_metadata` |
| `claims.txt` | 345 | `9ead99b7c1ec41f6bb21d0060e235e14` | `venue_claims` (all statuses) |
| `drafts.txt` | 67 | `eccd695c2f7de00bd28454be24248682` | `venue_enrichment_drafts` where `status='pending_review'` |

This is a projection, not a dump. Every input the audit reads is carried exactly — claim statuses,
approvers, dates, source URLs, venue websites, draft JSON in full, and whether each claim value and
each metadata field carries information. Values the audit never reads (a claim's literal text, a
venue's name and coordinates beyond their presence) are replaced by a stand-in that lands on the
same side of every predicate. `decodeCorpus` in `server/enrichment/_lib/venue-readiness-audit.js`
documents the formats and rejects a damaged transfer.

No personal data: the tables hold public venue records only.
