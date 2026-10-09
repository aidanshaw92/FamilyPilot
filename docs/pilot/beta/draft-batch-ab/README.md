# DRAFT publishing batch for Packs A and B (not approved, not applied)

Built from `../decisions/packAB-proposed.jsonl`, the owner's PROPOSED decisions, with `--drop-rules museum-closed-mondays`:

    node scripts/pilot/publish-batch.cjs --decisions docs/pilot/beta/decisions/packAB-proposed.jsonl \
      --approver human:owner-draft --out-dir <dir> --drop-rules museum-closed-mondays --as-of 2026-10-09

This is a rehearsal artefact. The real manifest is built after the owner's final sign-off, with the real approver name, the final decisions
file, a fresh `--as-of`, and Pack C added. Rehearsed end to end on a throwaway database (`rehearse-batch.cjs`): apply, projection, refused
re-run, rollback, re-publication; the edited wording and the dropped rule are checked in the projection.
