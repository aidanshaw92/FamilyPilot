# open-data (throwaway branch `data/open-data-fetch`, never merged)

This branch exists only to run `.github/workflows/open-data-fetch.yml` once or twice on GitHub's own runners, which can reach the
open-data hosts that the cloud coding session cannot. It is **not** a feature branch and must not be merged.

- No schedule, no cron, no manual-dispatch trigger. It runs only when this branch is pushed.
- `permissions: contents: read`. It uses no secret, no database, no Google, no paid service.
- It downloads each file once, from the host that publishes it, identifies itself in the User-Agent, and records the source URL,
  retrieval time, size, SHA-256, licence and attribution in `PROVENANCE.json`.
- Whatever it produces is attributed: OpenStreetMap data is © OpenStreetMap contributors, ODbL 1.0
  (https://www.openstreetmap.org/copyright); Ordnance Survey data is Contains OS data © Crown copyright and database right, Open
  Government Licence v3; Wikidata is CC0.
