# Synthetic fixture photography (TEST / DEMO ONLY)

Everything in this folder is a **photorealistic synthetic image made for the deterministic visual-test and demo
fixture** (`scripts/serve-places-fixture.mjs`, `FIXTURE_SCENARIO=realistic`). It exists so Home and Explore can be
judged with photographic cards instead of flat-colour drawings.

**None of it is a photograph of a real place, and none of it may ever be presented as one.**

* It is read only by the fixture test server. No app code imports it, Metro never bundles it, and the production
  photo pipeline (the photo proxy, the cache, provider provenance and attribution) never sees it.
  `src/__tests__/fixture-photography.test.ts` fails the build if any of that stops being true.
* It carries **no provider provenance**: no photographer, no source URL, no Google/OSM attribution. The fixture
  server names the contributor "A. Fixture" and answers with `X-FamilyPilot-Fixture: synthetic`.
* Every file must have an entry in `manifest.json` with `"synthetic": true`, and a manifest entry without a file
  (or a file without an entry) fails the test.
* No logos, signage, venue names, brand marks, watermarks or text in any image.
* The production rule is unchanged: real photograph (with its attribution) when the provider has one, otherwise the
  FamilyPilot category fallback. A real venue is never shown with a generated photograph.

## Files

`<category>.jpg`, and optionally `<category>-b.jpg` / `<category>-c.jpg` for variety between venues of one category.
Categories: `museum`, `park`, `soft_play`, `farm`, `attraction`, `zoo`, `activity` (the first five are required; the
last two are used by two of the fixture's fifteen venues and keep the flat-colour scene until they exist).
Landscape 4:3, 1600 x 1200 px, JPEG sRGB, at most 400 KB each. See `docs/PHOTOGRAPHY_ASSETS.md` for the briefs.

The "no photo" state is deliberate and is not served from here: those fixture venues have no photo URL at all and
show the category fallback.
