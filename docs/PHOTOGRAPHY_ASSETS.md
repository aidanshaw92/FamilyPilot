# Photography assets: the two contracts, and the exact generation briefs

FamilyPilot has **two different photography contracts**. They must not be confused.

| | Welcome | Home / Explore / Venue |
| --- | --- | --- |
| What the images are | Brand / lifestyle imagery | Photographs of **real venues** |
| Generated imagery | **Appropriate** (or licensed photography) | **Never** presented as a venue's photograph |
| Where it lives | `familypilot/assets/images/welcome/` (bundled) | The provider photo pipeline (proxy, cache, attribution) |
| When there is none | Category gradient inside the cut-out (defensive only: all seven slots are installed and a test fails if one is missing) | FamilyPilot category illustration (`CategoryArt`), no credit |
| Test / demo stand-ins | None | **Synthetic fixture photography**, isolated, test server only |

## The production contract for real venues

```
REAL PHOTO AVAILABLE      -> show the real venue photograph + its required attribution
REAL PHOTO UNAVAILABLE    -> show the FamilyPilot category fallback (no credit)
NEVER                     -> a real venue + a fabricated / AI photograph presented as real
```

Held in code by `VenueImage` (its only image source is the provider `uri`; no `require`, no Welcome or fixture
import; the credit appears only when a real photograph loaded) and in tests by
`src/__tests__/fixture-photography.test.ts`. Generated imagery is allowed only for Welcome brand imagery,
deterministic fixture/demo/testing imagery, and clearly illustrative non-evidential artwork.

## Status

* **Welcome: all seven images installed** (generated, credited `Origin: generated`; processed by
  `scripts/prepare-welcome-photos.mjs`). `welcome-photos.test.ts` fails if any slot has no file.
* **Fixtures: complete** (`park`, `museum`, `farm`, `soft_play`, `attraction`, `activity`, `zoo`; synthetic, in
  `manifest.json`; processed by `scripts/prepare-fixture-photos.mjs`). They exist only so the test/demo app can be
  judged by eye. They are never shown for a real venue in production. The deliberate "no photo" fixture venues are
  not served an image at all.

## Specifications for replacing or adding an image

**Nothing is outstanding.** Every Welcome slot and every required fixture image is installed. This section is the spec
to use if an image is ever replaced or added (the environment cannot generate images, so they are made externally and
processed with the `scripts/prepare-*.mjs` scripts). Each file goes exactly here, with its credit or manifest line.

### A. Welcome: 7 files, `familypilot/assets/images/welcome/`

| File | Supply (px) | Aspect |
| --- | --- | --- |
| `zoo.jpg` | 369 x 606 (or larger at the same aspect) | 0.61 portrait |
| `farm.jpg` | 521 x 522 | 1.00 square |
| `cafe.jpg` | 460 x 480 | 0.96 |
| `crafts.jpg` | 322 x 572 | 0.56 portrait |
| `soft-play.jpg` | 478 x 430 | 1.11 landscape |
| `puddles.jpg` | 412 x 389 | 1.06 |
| `aquarium.jpg` | 400 x 350 | 1.14 landscape |

JPEG, sRGB, progressive, quality about 75, **at most 150 KB each**, EXIF stripped. Generating larger at the same
aspect and downscaling is fine. Crop, focal point, off-screen bleed and safe area per slot are in
`docs/WELCOME_PHOTOGRAPHY.md`.

### B. Fixtures: `familypilot/assets/images/fixtures/venues/`

| File | Status | Used by |
| --- | --- | --- |
| `museum.jpg` | installed | Home hero, Explore |
| `park.jpg` | installed | Home hero, Explore |
| `soft_play.jpg` | installed | Explore, Home |
| `farm.jpg` | installed | Explore, Home |
| `attraction.jpg` | installed | Explore, Home |
| `zoo.jpg` | installed | one fixture venue |
| `activity.jpg` | installed | two fixture venues |
| `aquarium.jpg` | optional, not installed | not used by the current fifteen venues; not needed |
| `<category>-b.jpg`, `<category>-c.jpg` | optional | variety between venues of one category |

Landscape 4:3, **1600 x 1200 px**, JPEG sRGB, **at most 400 KB each**.

Composition rule for every fixture image (so the real cards judge fairly): the Home hero is a 673:576 landscape
crop with a dark gradient and text over its **lower ~35%**, and the Explore thumbnail is a **portrait strip cut from
the centre** (about 44% of the width). So keep the main subject in the **central 40% of the width and the upper-middle
(about 15% to 60%) of the height**, and keep the lower third calm.

## Shared style block (prepend to every Welcome prompt)

> Premium but natural UK family-lifestyle photograph, a family day out. Warm natural daylight, soft and golden,
> candid rather than posed, as if photographed by a skilled parent-photographer. Full-frame camera, 50 mm or 85 mm
> lens, shallow-to-moderate depth of field, the subject clearly separated from the background. Realistic skin, fur,
> fabric and material texture, subtle rich colour, gentle contrast, a warm clean grade that sits well beside cream,
> deep green and pastel mint, yellow and coral. Natural, not HDR. No text, no logos, no watermarks, no signage, no
> brand marks. Correct anatomy for people and animals (five fingers, natural hands, proper limbs and paws). No
> fantasy, no illustration, no over-smoothing.

Negative prompt, where supported: *text, letters, logo, watermark, signature, brand, extra fingers, deformed hands,
distorted face, plastic skin, oversaturated, HDR, CGI look, cartoon, illustration, stock-photo smile at camera,
duplicate subjects.*

## A. Welcome prompts (one photographic campaign)

Generate at the slot's aspect, larger if you like. Keep every subject inside the central 60% of the frame.

1. **`zoo` (portrait 0.61).** A giraffe, head and neck, gently turned towards the camera, large dark eye in the
   upper third of the frame, long eyelashes, soft textured coat, leafy trees and bright sky softly blurred behind.
   Warm afternoon light. Keep the head inside the left 70% of the frame.
2. **`farm` (square).** A small child, seen from behind and in three-quarter profile (face not the focus), gently
   stroking a soft rabbit held against a wooden farm fence; hay and a blurred paddock behind; dungarees or a
   knitted jumper; warm morning light. Child and rabbit centred, hands on the rabbit at the focal point.
3. **`cafe` (near-square 0.96).** A flat white latte with simple latte art and a golden croissant on a worn wooden
   café table, a green plant and a bright window softly blurred behind, a few crumbs, soft warm light. No brand on
   the cup or the plate. The cup centred.
4. **`crafts` (portrait 0.56).** A child's hands painting a small clay pottery piece at a craft table, paint pots
   in bold but natural colours around it, a smock sleeve, a few paint smudges; daylight from a window. Hands and the
   piece in the centre; keep the work inside the left 65%. Face absent or out of frame.
5. **`soft-play` (landscape 1.11).** A toddler mid-climb on a colourful foam soft-play frame, bright but not neon
   primary colours, padded shapes and a gentle slide, a bright, airy indoor space. Child centred among the foam
   shapes, seen from the side or behind; no other children's faces.
6. **`puddles` (landscape 1.06).** A low-angle shot of a child's yellow wellies mid-splash in a muddy puddle on a
   woodland or park path, droplets frozen in the air, wet reflective ground, soft green background, golden light.
   Splash centred. No face.
7. **`aquarium` (landscape 1.14).** A penguin underwater, swimming sleekly past the glass, sharp, against clear blue
   water with soft light rays. Penguin in the left 70% of the frame. No signage, no reflections of people.

## B. Fixture prompts (synthetic, test/demo only)

Prepend this instead of the lifestyle block:

> Photorealistic wide documentary photograph, bright natural light, realistic materials and depth of field, the
> main subject in the central part of the frame, a calm lower third. No text, no logos, no signage, no brand marks,
> no watermarks, no venue name, nothing that identifies a real place. Correct anatomy. Natural colour, no HDR.

1. **`museum`.** A bright, modern science-museum hall. A young child (seen from the side, face partly turned
   away) reaches out to touch a glowing plasma-globe-style interactive exhibit; a large suspended skeleton
   sculpture overhead; other visitors softly out of focus; polished floor, glass and warm daylight from high
   windows. The same photographic energy as an inspiring, family-friendly museum, with nothing branded.
2. **`park`.** An attractive London-style urban park on a warm day: mature plane and oak trees, mown grass, a
   curving path, a family with a pushchair strolling in the middle distance (small, not the focus), dappled
   golden light, a hint of city skyline far behind.
3. **`soft_play`.** A colourful, premium indoor soft-play centre: tidy climbing structures, padded platforms, a
   slide and ball pit in a bright airy space, a child safely climbing in the middle distance, clean child-safe
   surfaces. No branding or signs.
4. **`farm`.** A family-friendly UK farm in natural daylight: a wooden paddock fence, sheep or goats near it, a
   red-roofed barn and hay bales, a small child at the fence from behind feeding a goat, soft green hills.
5. **`attraction`.** A generic family attraction with interesting architecture: a striking modern glass-and-timber
   pavilion or observation structure in a landscaped plaza, a few families walking, bright sky, an open, welcoming
   feel. Not a recognisable landmark; no signage.
6. **`zoo`** (preferred). Meerkats on their lookout, upright and alert, in a naturalistic enclosure with sand and
   rocks, warm low sun; no glass reflections, no signage.
7. **`activity`** (preferred). A bright children's workshop table: two children (from behind or in profile) making
   a clay or paper craft, colourful materials spread out, daylight, an educator's hands helping. No signs or
   branding.
8. **`aquarium`** (optional). A large, softly lit aquarium tunnel with a school of fish and a turtle overhead,
   a child silhouetted looking up; blue light; no signage.

## When an image is replaced or added

1. Welcome: prepare the file with `scripts/prepare-welcome-photos.mjs`, update its `Origin: generated` (or
   `photograph`) line in `assets/images/welcome/CREDITS.md`, and import it in `src/assets/welcome-photos.ts`;
   `welcome-photos.test.ts` checks it.
2. Fixtures: prepare the file with `scripts/prepare-fixture-photos.mjs`, which records a `synthetic: true` entry in
   `assets/images/fixtures/venues/manifest.json`; the fixture server (realistic scenario) serves it per category.
3. Rebuild, regenerate the realistic Home, Explore (full, partial, unreviewed, long name, no photo) and Welcome
   renders at 360/393/430, the canonical A/B/C/D boards, and run the full regression with the zero-spend tripwires.
   The "no photo" fixtures keep the category fallback on purpose.

None of this calls Google Photos, Places, Overpass or any live image provider: the images are bundled (Welcome) or
read from disk by the local fixture server (fixtures).

## C. When a real venue has no photograph: the category illustration (product QA round 2)

**What a parent sees today.** A venue with no provider photograph draws `CategoryArt` (`src/components/ui/CategoryArt.tsx`):
a FamilyPilot vector illustration per category (park, farm, zoo, museum, attraction, activity, soft play, beach, cafe,
restaurant), on a 300×400 board with `preserveAspectRatio="slice"` so it fills a Home card, an Explore thumbnail and a
60-pixel restaurant thumb alike. It replaced the flat-colour gradient, which read as "broken".

**Why it cannot mislead.** It is obviously artwork (flat shapes, no people, no text, no landmarks), it depicts a *kind*
of place and never *this* place, it carries no photographer credit, and its accessibility label says so
(`"<name>, photo not available. Illustration of a <noun>"`, or `"Place photo not available. Illustration of a <noun>"`
when the image is decorative inside a card). `VenueImage` still has exactly one photograph source, the provider URI;
`category-art.test.ts` and `fixture-photography.test.ts` fail if a bundled, Welcome or fixture image can reach a real
venue, or if the fallback stops saying it is an illustration. It upgrades to the real photograph the moment one exists,
with no layout change. Evidence: `docs/product-qa/category-art.jpg`.

**Real photography audit (production, read-only query, 5 Oct 2026).** 155 stored places. Of the 138 parks, museums,
attractions, farms, activities, soft-play centres and zoos, **132 (96%) carry a provider photograph**; the 6 without
(5 museums, 1 park) show the illustration. The 17 restaurant and cafe rows are OpenStreetMap-sourced and have no
photograph by design, so "Restaurants close by" uses the illustration thumbnail (honest, not a fake picture of the
restaurant). Home and Explore therefore show real photographs wherever a licensed one exists. Whether *Preview* shows
them depends only on the photo-scope switch on Vercel Preview (an owner spend decision, unchanged).

**Optional upgrade: a raster illustration pack (not required, nothing is blocked on it).** If the vector set is judged
too plain, supply ten files and they replace the SVGs one for one.

| Spec | Value |
| --- | --- |
| Destination | `familypilot/assets/images/category-art/<category>.webp` |
| Filenames | `park`, `farm`, `zoo`, `museum`, `attraction`, `activity`, `soft_play`, `beach`, `cafe`, `restaurant` |
| Size and ratio | 1200 × 1600 px (3:4), WebP, ≤ 180 KB each, sRGB |
| Safe area | Keep the subject inside the central 70%; the card crops with `slice` and the foot of the image sits under a dark gradient and white text, so keep the bottom third quiet |
| Palette | FamilyPilot deep green `#0F4A3E`, mint `#E4F2EC`, warm canvas `#FBFAF7`, sun yellow and coral accents; no photographic textures |
| Wiring (after the files exist) | add a `require` map keyed by category in `CategoryArt.tsx` and render `expo-image` when present, else the SVG; extend `category-art.test.ts` to require one file per category |

Shared prompt prefix: *"Flat editorial illustration for a family days-out app, soft paper-cut shapes, warm natural
light, deep green and mint palette with sun-yellow and coral accents, no people, no faces, no text, no logos, no real
landmarks, calm and uncluttered, quiet lower third for overlaid text, portrait 3:4."* Then one subject line each:
park (rolling lawn, a pond, round trees, a winding path), farm (red barn, hay bales, a fence, a small tractor), zoo
(savannah acacia, giraffe silhouettes, a signpost), museum (a columned building, steps, banners), attraction (a
big wheel and a pier), activity (a climbing frame, balls, a rope bridge), soft play (soft blocks, a slide, padded
shapes), beach (dunes, a bucket and spade, gentle waves), cafe (a cup and a cake on a window table), restaurant (a table
set for four, a high chair, pendant lamps).

Anything generated must keep the `Origin: generated` credit line in this folder's `CREDITS.md`, and is subject to the
same rule as everything above: it may illustrate a category, never a venue.
