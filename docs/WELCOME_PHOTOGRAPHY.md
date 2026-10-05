# Welcome photography: the one outstanding asset dependency

The approved Welcome frame (Figma `166:128`) is a collage of **seven photographic cut-outs**. The cut-out
shapes, positions, white sticker edge and the decorative stickers over them are implemented exactly
(`WELCOME_CUTOUTS`, `PhotoSlot`, `WELCOME_ART`). **The photographs themselves are not in the repository**,
because none could be legitimately obtained:

* The photographs inside the Figma frame are *review-only crops of the owner's reference screenshot*. They
  are not licensed assets and must never ship (they are not referenced by any app code or bundle).
* This environment cannot reach any photo host (Wikimedia, Unsplash, Pexels, Pixabay and Flickr were all
  re-tested and refused), has no image-generation capability, and a generated or stock-looking image is
  excluded by the brief in any case.

Until the files below exist, each slot draws the category gradient inside its exact cut-out. That is a
**temporary fallback**, not the finished screen.

## What is needed

Seven candid, editorial photographs, licensed for distribution inside the app (commissioned, or CC0 / a
licence that permits commercial redistribution with the credit recorded). No posed stock, no generated
imagery, no identifiable venue shown as if recommended, and any child must be covered by a model release.

Each is drawn in its slot with `preserveAspectRatio="xMidYMid slice"`: the photograph fills the cut-out's
bounding box and is cropped around the centre, so **keep the subject near the middle** and shoot or crop at
the slot's aspect. Sizes below are the slot at 1x in points and at 3x in pixels; supply the 3x size (a little
larger is fine) as an optimised JPEG, **at most 150 KB each** (the test enforces it), about 0.9 MB for all seven.

| Slot id (file) | Scene (as approved) | Slot, pt | Supply, px (3x) | Aspect | Subject placement |
| --- | --- | --- | --- | --- | --- |
| `zoo` (`zoo.jpg`) | A giraffe, head and neck, looking at the camera, trees behind | 123 x 202 | 368 x 606 | 0.61 | Face in the upper third; bleeds off the top-right of the screen |
| `farm` (`farm.jpg`) | A child gently stroking a rabbit at a farm fence | 174 x 174 | 521 x 522 | 1.00 | Child and rabbit centred; the left edge is cropped by the screen |
| `cafe` (`cafe.jpg`) | A latte and a croissant on a wooden table, a plant behind | 153 x 160 | 460 x 480 | 0.96 | The cup centred, a little warm light |
| `crafts` (`crafts.jpg`) | A child painting pottery / crafting, paint pots in view | 107 x 190 | 322 x 571 | 0.56 | Hands and work centred; the right edge is cropped by the screen |
| `soft-play` (`soft-play.jpg`) | A toddler climbing a colourful soft-play frame | 159 x 143 | 478 x 430 | 1.11 | The child centred among the foam shapes |
| `puddles` (`puddles.jpg`) | Yellow wellies splashing in a puddle | 137 x 130 | 412 x 389 | 1.06 | The splash centred, a low angle |
| `aquarium` (`aquarium.jpg`) | A penguin underwater / at the glass | 133 x 117 | 400 x 350 | 1.14 | The penguin centred; bleeds off the right of the screen |

## How to ship them

1. Put each file in `familypilot/assets/images/welcome/<slot>.jpg`.
2. Add one line per file to `assets/images/welcome/CREDITS.md` (photographer, source, licence).
3. Add the matching static `require` in `src/assets/welcome-photos.ts` (React Native needs it written out).
4. `npx vitest run src/__tests__/welcome-photos.test.ts` checks the file, the credit line, the size budget,
   and that nothing is credited but unwired or wired but uncredited. The `todo` in that test names the slots
   still missing; it passes once all seven ship.

The photographs are brand artwork, bundled with the app: **no runtime request, no provider call, no cost**.
They are drawn once, behind a decorative (`aria-hidden`) layer, so assistive technology skips them; the
benefit cards, headline and button carry all the meaning.

## Why not one composite image

A single composite (photographs, white edge and mask baked together) would be one request and would remove
the runtime clipping, but it freezes the composition per pixel width, so the 360 / 430 behaviour (the giraffe
shrinking clear of the headline, the stickers scaling with the stage) would be lost. Seven small bundled files
keep the approved masks and responsive behaviour and cost the same bytes.
