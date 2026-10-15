# Tranche A: the production release candidate

15 October 2026. Branch `release/tranche-a-rc` = `main` (as of `e266bb9`: #209, #215, #222) + the registry (#210), the review tooling (#211) and the validated Tranche A batch (#213). **Nothing is activated: every entry still says `UNREVIEWED (simulation only)`, `cutover.json` is empty, the shipped registry files are empty, and no reviewer name exists anywhere.** The product owner's name is written only by `scripts/apply-review.mjs`, only after their explicit approval, in the activation commit described below.

## What this branch adds beyond #213

1. **The twelve tests that asserted "the identity files ship empty" now assert the release invariant instead**, so the activation commit changes data only, no test:
   - every shipped entry validates **in production mode** and carries a **named reviewer** (never `UNREVIEWED`, never `PREVIEW ONLY`): `catalogue-recovery`, `independent-source-registry`;
   - a category may be switched over only when the shipped files hold entries for it (a cut-over can never empty a category): `catalogue-recovery`;
   - the stored-row and corridor tests inject an empty independent list, because they are about the database read: `catalogue`, `between-contract`;
   - the endpoint tests follow the shipped cut-over file, and the Google gate refusal is a 503 until a reviewed set ships and the independent venues (never demo data) afterwards: `catalogue`, `google-places-cost-control`.
   Rehearsed in both states: in the shipped state all pass; with the rehearsal marker applied to the 234 entries and the five categories switched over, exactly the two named-reviewer tests fail (the marker is not a person), everything else passes. The registry files were restored to empty afterwards and nothing was committed in that state.
2. **A cut-over gap closed in `catalogue.js`.** `mergeCatalogue` applied the cut-over to the stored Google rows but not to a cached or live Google *search*, so for as long as a search cache row lived, a switched-over category would have blended Google and independent entries (the OSMF guideline's one data type, two sources). Google places in a switched-over category are now dropped there too; test added ("a Google place from a live or cached search in a switched-over category is not served beside the independent entries"). Behaviour today is unchanged because nothing is switched over.

## The activation commit (not made; needs explicit approval)

One commit, on this branch, after you approve the final batch (the 20-venue sample, the 3 removals, the 12 reclassifications and the 5 exceptions in `TRANCHE_A_RELEASE.md`; say which, if any, to reverse):

```
node scripts/apply-review.mjs --reviewer "<your name>" --date <YYYY-MM-DD> \
  --entries docs/recovery-batches/2026-10-14/A/tranche-a.entries.UNREVIEWED.json \
  [--drop <ids you reject, comma separated>] --write
# then set cutover.json "categories" to ["park", "museum", "attraction", "zoo", "farm"]
cd familypilot && npx tsc --noEmit -p . && npx vitest run          # all green, including the twelve above
```

The tool validates every entry with the registry's own rules first and refuses the whole batch on a single problem; it never invents a reviewer. The diff is data only: `os-greenspace.json` +131, `wikidata.json` +103, `cutover.json` five categories.

## Release and verification, in order

1. Rebuild the Preview from the activation commit; walk Explore, Nearby, a venue, Create a plan, Meet halfway, Saved (the four rehearsal scripts in `PREVIEW_EVIDENCE.md`, all against the real `/api/places/*` with no Google rows), and your own iPhone check.
2. Squash-merge to `main` ("Tranche A: … (#N)"). Record the previous production deployment id as the rollback target first.
3. Production, within ten minutes: `/api/places/search?intent=catalogue&lat=51.5074&lng=-0.1278&radiusKm=5&limit=5` returns independent places; Explore lists parks and museums; a venue page shows the OS statement; the read-only runner check (`prod-verify2`) reports no errors and zero Google requests.
4. Rollback = revert the squash commit (data only, one step) or promote the previous deployment; both leave saved places untouched (they live on devices).

## What it depends on, and what it does not

- Does **not** depend on #203 (Explore), #220 (reconnect), #223 (outage honesty) or the retention SQL; each has its own approval. #220 is best released with it (a saved Google place would otherwise open as "not found" after the Google rows expire).
- Depends on nothing outside the repository: no Google request, no migration, no Vercel change.
- The 59 venues we hold with no Tranche A successor (all activities and soft play among them) stay as they are until Tranche C.
