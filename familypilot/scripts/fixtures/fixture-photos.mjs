import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SYNTHETIC FIXTURE PHOTOGRAPHY: test and demo assets only.
 *
 * The visual-test fixture invents its venues, so the photographs on its cards are synthetic as well. They are
 * photorealistic pictures of *a kind of place* (a science museum, an urban park, soft play, a farm, an attraction, an
 * aquarium, a zoo), generated for the fixture, so a card's composition can be judged on a photograph rather than on a flat
 * colour. They are never a photograph of a real, named venue and are never evidence about one.
 *
 * WHY THIS LIVES HERE AND NOWHERE ELSE.
 *   - Under `scripts/fixtures/`, which no app build includes. It is not in `assets/`, `src/` or `app/`, so it cannot be
 *     bundled, and `fixture-photo-isolation.test.ts` fails if anything in the app, the API or the server reads from it.
 *   - It is served only by `serve-places-fixture.mjs`, through the same `/api/places/photo` URL shape the real proxy uses,
 *     so the app code under test is unchanged. No provider is contacted. The response carries
 *     `X-FamilyPilot-Fixture: synthetic-photograph` and its credit is a fixture credit, never a provider one.
 *   - It is not written to the production venue-photo cache and carries no provider provenance.
 *
 * WHAT A CARD WITHOUT ONE DOES. A fixture place with no photographs (`photos: []`) is never asked for one, so the NO PHOTO
 * state keeps showing the non-photographic category fallback. Do not give every fixture a photograph to make a run look
 * complete: the fallback is a state the product really has.
 *
 * Files: `<category>-<n>.jpg`, categories written with a hyphen (`soft-play-1.jpg`). Several per category are optional.
 */

export const FIXTURE_PHOTO_CATEGORIES = ['museum', 'park', 'soft_play', 'farm', 'attraction', 'zoo', 'aquarium'];

/**
 * A category with no photograph of its own borrows the nearest honest one. This is a fixture convenience for judging a
 * layout; none of it exists in the product, where a venue with no photograph shows the category fallback.
 */
export const FIXTURE_CATEGORY_FALLBACKS = {
  activity: ['attraction', 'soft_play'],
  zoo: ['zoo', 'farm'],
  aquarium: ['aquarium', 'attraction'],
  beach: ['park'],
  hotel: ['attraction'],
};

const FILE = /^([a-z]+(?:-[a-z]+)*)-(\d+)\.jpe?g$/;

/** Reads every well-formed fixture photograph under `dir`, grouped by category. Missing directory or files: an empty set. */
export function loadFixturePhotoSet(dir) {
  const set = new Map();
  if (!dir || !existsSync(dir)) return set;
  for (const name of readdirSync(dir).sort()) {
    const match = FILE.exec(name);
    if (!match) continue;
    const category = match[1].replace(/-/g, '_');
    if (!FIXTURE_PHOTO_CATEGORIES.includes(category)) continue;
    const list = set.get(category) ?? [];
    list.push({ file: name, bytes: readFileSync(join(dir, name)) });
    set.set(category, list);
  }
  return set;
}

/**
 * The photograph for one place, or `null` when the fixture set holds none for its category (the caller then serves the
 * existing drawn fixture image, so the repository works before any photograph exists).
 */
export function pickFixturePhoto(set, category, seed = 0, index = 0) {
  const order = [category, ...(FIXTURE_CATEGORY_FALLBACKS[category] ?? [])];
  for (const candidate of order) {
    const list = set.get(candidate);
    if (list?.length) return list[(Math.abs(seed) + (Number.isInteger(index) && index > 0 ? index : 0)) % list.length];
  }
  return null;
}
