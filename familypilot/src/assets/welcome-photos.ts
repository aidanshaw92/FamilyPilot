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
 *   - A licensed, candid, editorial photograph the product may ship (no stock-looking posed family,
 *     no generated imagery, no photograph that impersonates a venue).
 *   - The file lives in `assets/images/welcome/<slot>.jpg`, is landscape-or-square ≥ 800px on the
 *     short side, and is recorded in `assets/images/welcome/CREDITS.md` (photographer, source,
 *     licence). `welcome-photos.test.ts` fails the build when a slot points at a file that is
 *     missing from either place.
 *   - React Native needs a static `require`, so each line is written out by hand when the file lands.
 *
 * Add a slot like so once its file and credit exist:
 *   farm: require('../../assets/images/welcome/farm.jpg'),
 */
export const WELCOME_PHOTOS: Partial<Record<string, ImageSource>> = {};
