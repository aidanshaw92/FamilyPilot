import type { ImageSource } from 'expo-image';

import aquarium from '../../assets/images/welcome/aquarium.jpg';
import cafe from '../../assets/images/welcome/cafe.jpg';
import crafts from '../../assets/images/welcome/crafts.jpg';
import farm from '../../assets/images/welcome/farm.jpg';
import puddles from '../../assets/images/welcome/puddles.jpg';
import softPlay from '../../assets/images/welcome/soft-play.jpg';
import zoo from '../../assets/images/welcome/zoo.jpg';

/**
 * The photographs behind the Welcome collage, keyed by the slot ids in `welcome-layout.ts`.
 *
 * This is where the editorial photography plugs in. A slot with an entry renders the photograph;
 * a slot without one renders the category-gradient placeholder, which is NOT the finished
 * experience: the approved Welcome is the photographic collage (farm/animals, zoo/wildlife, soft
 * play, pottery/creative, café, muddy wellies, aquarium).
 *
 * Welcome is BRAND / LIFESTYLE imagery, not evidence about a venue, so a licensed photograph or a generated
 * photograph are both allowed here (and only here: Home and Explore show real venues and never use generated
 * imagery as a venue's photograph).
 *
 * Rules for an entry:
 *   - A candid, natural family-day-out image (no stock-looking posed family, no text, logo or watermark, no
 *     image that impersonates a venue), licensed or generated for the product to ship.
 *   - The file lives in `assets/images/welcome/<slot>.jpg`, at the size in docs/WELCOME_PHOTOGRAPHY.md, and is
 *     recorded in `assets/images/welcome/CREDITS.md` with its Origin (photograph or generated), creator or tool,
 *     and terms. `welcome-photos.test.ts` fails the build when a slot points at a file that is missing from
 *     either place, or whose Origin is not stated.
 *   - Metro needs a static import, so each file is imported by hand when it lands.
 *
 * The seven briefs (subject, size, placement) are in docs/WELCOME_PHOTOGRAPHY.md. The pipeline was proven on the
 * web with a throwaway image in the exact cut-out; nothing is committed until the real file and its credit exist.
 *
 * Add a slot like so once its file and credit exist:
 *   import farm from '../../assets/images/welcome/farm.jpg';  ...  farm,
 */
export const WELCOME_PHOTOS: Partial<Record<string, ImageSource>> = {
  zoo,
  farm,
  cafe,
  crafts,
  'soft-play': softPlay,
  puddles,
  aquarium,
};
