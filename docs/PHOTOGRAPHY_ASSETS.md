# Photography assets: the two contracts, and the exact generation briefs

FamilyPilot has **two different photography contracts**. They must not be confused.

| | Welcome | Home / Explore / Venue |
| --- | --- | --- |
| What the images are | Brand / lifestyle imagery | Photographs of **real venues** |
| Generated imagery | **Appropriate** (or licensed photography) | **Never** presented as a venue's photograph |
| Where it lives | `familypilot/assets/images/welcome/` (bundled) | The provider photo pipeline (proxy, cache, attribution) |
| When there is none | Category gradient inside the cut-out (temporary fallback) | FamilyPilot category fallback, no credit |
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
* **Fixtures: `park`, `museum`, `farm`, `soft_play`, `attraction`, `activity` installed** (synthetic, in
  `manifest.json`; processed by `scripts/prepare-fixture-photos.mjs`). Still to supply: `zoo` (preferred; until it
  exists the one zoo fixture venue keeps the flat-colour scene). The deliberate "no photo" venues are not served an
  image at all.

## What I need from you (the environment cannot generate images)

Place the files exactly here. Nothing else is needed; I write the credit and manifest lines from the generator and
prompt you tell me you used.

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

| File | Needed? | Used by |
| --- | --- | --- |
| `museum.jpg` | required | Home hero, Explore |
| `park.jpg` | required | Home hero, Explore |
| `soft_play.jpg` | required | Explore, Home |
| `farm.jpg` | required | Explore, Home |
| `attraction.jpg` | required | Explore, Home |
| `zoo.jpg` | strongly preferred | one fixture venue (flat colour scene until it exists) |
| `activity.jpg` | strongly preferred | two fixture venues (flat colour scene until it exists) |
| `aquarium.jpg` | optional | not used by the current fifteen |
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

## What happens when the files arrive

1. Welcome: copy the seven files, add `Origin: generated` credit lines to `assets/images/welcome/CREDITS.md`, add the
   seven `require` lines to `src/assets/welcome-photos.ts`; the todo in `welcome-photos.test.ts` then passes.
2. Fixtures: copy the files, add a `synthetic: true` entry for each to
   `assets/images/fixtures/venues/manifest.json`; the fixture server (realistic scenario) serves them per category.
3. Rebuild, regenerate the realistic Home, Explore (full, partial, unreviewed, long name, no photo) and Welcome
   renders at 360/393/430, the canonical A/B/C/D boards, and run the full regression with the zero-spend tripwires.
   The "no photo" fixtures keep the category fallback on purpose.

None of this calls Google Photos, Places, Overpass or any live image provider: the images are bundled (Welcome) or
read from disk by the local fixture server (fixtures).
