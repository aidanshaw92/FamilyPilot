# Synthetic fixture photographs (test and demo only)

Photorealistic *synthetic* pictures of a kind of place, for the visual-test fixture. They are **not** photographs of a real or
named venue, are never provider evidence, and are served only by `scripts/serve-places-fixture.mjs`. Nothing here is bundled
into the app or written to any production photo cache.

Files are `<category>-<n>.jpg` (4:5, 1600x2000): `museum`, `park`, `soft-play`, `farm`, `attraction` (required) and
`aquarium`, `zoo` (optional). Install with `node scripts/photos/install-fixture-photos.mjs <folder>`; see
`docs/PHOTOGRAPHY_BRIEFS.md`. With none installed the fixture draws its original flat images, so the repository works either way.
