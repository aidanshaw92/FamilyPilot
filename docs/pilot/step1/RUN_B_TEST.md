# Run B: atomic and gated: local test (9 October)

`colne-withdraw-only.sql` against a local PostgreSQL 16 built from the post-run fixture (the state after Run A: 88 active claims, 17 completed jobs, 17 v6 drafts, Colne claim active, served parking "no"). `runb-test.sh` in `/tmp/pgtest` (not committed; the seven cases are listed here).

| # | State | Result |
|---|---|---|
| 1 | After Run A, all checks hold | `Run B done: 1 claim and 1 served row changed`; claim disputed, served parking removed, 87 active |
| 2 | Run again | Refused: "the Colne Valley claim is not active as expected"; nothing changed |
| 3 | Run A's additions not present (87 active, not 88) | Refused: "expected 88 after Run A"; claim still active |
| 4 | One job still `processing` | Refused: "1 enrichment job(s) are still pending or processing"; claim still active |
| 5 | One of the four withdrawn claims still active | Refused; claim still active |
| 6 | Served row has no parking "no" (so only one of the two rows can change) | **Aborted: "expected 1 claim and 1 served row, changed 1 and 0"; the claim stayed active** (atomic) |
| 7 | One job is from an earlier day, not Run A | Refused: "16 of 17 re-read jobs are completed … after Run A started" |

Limit: it proves the guard and the atomicity on a faithful local copy of the tables involved, not on production. Its preconditions are the same facts `post-run-checks.sql` reads.
