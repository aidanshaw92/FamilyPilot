import type { ImageSource } from 'expo-image';

/**
 * The photographs behind the Welcome collage, keyed by the slot ids in `welcome-layout.ts`.
 *
 * This is where the editorial photography plugs in. A slot with an entry renders the photograph;
 * a slot without one renders the category-gradient placeholder, which is NOT the finished
 * experience: the approved Welcome is the photographic collage (farm/animals, zoo/wildlife, soft
 * play, pottery/creative, café, muddy wellies, aquarium).
 *
 * Rules for an entry:
 *   - Brand / lifestyle imagery that depicts no venue: generated for FamilyPilot, commissioned, or CC0. Generated
 *     photography IS appropriate here. (Home and Explore show real venues and never use generated photographs.)
 *   - No stock-looking posed family, no logos, text or watermarks, no photograph that impersonates a venue.
 *   - The file lives in `assets/images/welcome/<slot>.jpg` at the slot's 3x size, and is recorded in
 *     `assets/images/welcome/CREDITS.md` (source, generator and licence). `welcome-photos.test.ts` fails the build when a
 *     slot points at a file that is missing from either place.
 *   - React Native needs a static `require`, so each line is written out. `scripts/photos/install-welcome-photos.mjs`
 *     writes them (and the credit lines) when it installs the files.
 *
 * The seven briefs (subject, size, placement) are in docs/WELCOME_PHOTOGRAPHY.md and docs/PHOTOGRAPHY_BRIEFS.md.
 *
 * By hand, once a file and its credit exist:
 *   farm: require('../../assets/images/welcome/farm.jpg'),
 */
export const WELCOME_PHOTOS: Partial<Record<string, ImageSource>> = {};
