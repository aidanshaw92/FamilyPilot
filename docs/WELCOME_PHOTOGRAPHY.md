# Welcome photography: the contract and the installed images

The approved Welcome frame (Figma `166:128`) is a collage of **seven photographic cut-outs**. The cut-out shapes,
their positions, the white sticker edge and the decorative stickers over them are implemented exactly
(`WELCOME_CUTOUTS`, `PhotoSlot`, `WELCOME_ART`).

**Status: all seven images are installed** in `familypilot/assets/images/welcome/` (`zoo`, `farm`, `cafe`, `crafts`,
`soft-play`, `puddles`, `aquarium`), each within the 150 KB budget, imported in `src/assets/welcome-photos.ts` and
recorded in `assets/images/welcome/CREDITS.md` as `Origin: generated`. They are bundled brand imagery: no runtime
request, no provider call, no cost. This document remains the contract (crop, focal point, safe area, size, format)
that any replacement or additional image must meet.

* The photographs inside the Figma frame are *review-only crops of the owner's reference screenshot*. They are
  not licensed assets and must never ship. No app code or bundle references them.
* Welcome is **brand / lifestyle imagery**, not evidence about a venue, so a licensed photograph **or a generated
  photograph** is appropriate here. (Home and Explore are the opposite: they show real venues and never use
  generated imagery as a venue's photograph. See `docs/PHOTOGRAPHY_ASSETS.md`.)
* The images were generated externally (this environment cannot reach a photo host or generate images) and
  processed with `scripts/prepare-welcome-photos.mjs`. The generation briefs are in `docs/PHOTOGRAPHY_ASSETS.md`.

A slot with no file would fall back to its category gradient inside its exact cut-out. That is only a defensive
fallback, never the finished screen: `welcome-photos.test.ts` fails the build if any of the seven slots has no
image, so production never ships a gradient in place of a photograph.

## What each image must be

Seven images that read as **one photographic campaign**: premium but natural UK family-lifestyle photography, warm
natural daylight, candid rather than posed, realistic skin, fur and material detail, playful without looking like
stock. Whatever their origin, they must contain no text, logo, watermark or brand mark, no identifiable venue shown
as if recommended, and no anatomy that looks generated. If an image is generated, say so in
`assets/images/welcome/CREDITS.md` (`Origin: generated`); if it is a photograph, it must be licensed for
distribution in a commercial app, with a model release for any identifiable child.

### Visual tone (all seven read as one set)

* **Light:** natural daylight, soft and warm (morning or late-afternoon sun, or bright overcast). No flash, no
  harsh midday shadow, no night or tungsten colour cast. Indoor scenes shot by a window or in bright, even light.
* **Colour:** natural but lively, a warm grade with clean whites. Greens, yellows and warm reds are welcome; they
  sit beside the frame's mint, yellow and coral stickers. Do not heavily filter, tint or desaturate.
* **Style:** candid, close and unfussy, as a parent would photograph a good day out. Eye-level or slightly low
  angle, shallow-to-moderate depth of field, the subject clearly separated from the background.
* **Consistency:** a similar grade and brightness across the seven, so the collage does not look stitched from
  unrelated sources.
* **Content rules:** no readable text, logos, brand marks or signage in frame; no screens; nothing that dates the
  picture badly.

### How a photograph is drawn (what the crop does to it)

Each photograph fills the slot's bounding box with `preserveAspectRatio="xMidYMid slice"` (cropped around the
centre to the slot's aspect), is clipped to the organic cut-out outline, and then has an **11-frame-px white
sticker band painted over its inside edge** (about 5 pt, about 15 px at 3x, all round). So for every slot:

* Supply the photograph at the slot's aspect (table below) so the centre-crop removes nothing unplanned.
* **Safe area:** keep the key subject inside the **central 60% of both width and height**. The outer ~20% on
  every side is lost to the white band and to the outline's rounded, uneven corners.
* **Do not put the focal point or any face near a corner**: the outline cuts the corners of the bounding box away.
* A slot that runs off the screen edge also loses the part past the edge (listed per slot); the subject must sit
  in the part that stays visible.

### The seven slots

Slot sizes are the frame's own, at the 393 pt reference phone (a frame pixel is 393/852 pt). Supply the **3x
pixel size** (a little larger is fine; do not supply smaller). Dimensions are width x height.

| Slot id (production filename) | Scene (as approved) | Orientation | Slot, pt | Supply, px (3x) | Aspect (w:h) | Focal point (% from left, top) | Off-screen bleed | Subject placement and safe area |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `zoo` (`zoo.jpg`) | A giraffe, head and neck, looking towards the camera, trees or sky behind | Portrait | 123 x 202 | 369 x 606 | 0.61 | 38%, 28% (the eye) | Right 18% is off-screen | Head and neck in the upper half, eye at the focal point; keep the head inside the **left 70%**; background simple and out of focus |
| `farm` (`farm.jpg`) | A child gently stroking a rabbit at a farm fence or hutch | Square | 174 x 174 | 521 x 522 | 1.00 | 55%, 52% (the hands on the rabbit) | Left 5% is off-screen | Child and rabbit together, centred; hands and rabbit are the focus; the child may be from behind or in profile |
| `cafe` (`cafe.jpg`) | A latte and a croissant on a wooden table, a plant or window light behind | Near-square | 153 x 160 | 460 x 480 | 0.96 | 50%, 52% (the cup) | None | The cup and pastry centred with a little warm light; a shallow depth of field; no brand on the cup |
| `crafts` (`crafts.jpg`) | A child painting pottery or crafting, paint pots in view | Portrait | 108 x 191 | 322 x 572 | 0.56 | 40%, 50% (hands and work) | Right 21% is off-screen | Hands and the piece being painted in the centre; keep the work inside the **left 65%**; colourful paint pots may be at the edge |
| `soft-play` (`soft-play.jpg`) | A toddler climbing a colourful soft-play frame | Landscape | 159 x 143 | 478 x 430 | 1.11 | 55%, 50% (the child) | Left 6% is off-screen | The child centred among foam shapes, mid-climb; bright primary colours; no other children's faces in frame |
| `puddles` (`puddles.jpg`) | Yellow wellies splashing in a puddle | Landscape | 137 x 130 | 412 x 389 | 1.06 | 50%, 55% (the splash) | None | A low angle; the wellies and the splash centred; wet reflective ground; no face needed |
| `aquarium` (`aquarium.jpg`) | A penguin underwater or at the glass | Landscape | 133 x 117 | 400 x 350 | 1.14 | 40%, 50% (the penguin) | Right 17% is off-screen | The penguin in the **left 70%**, sharp, against blue water; no readable signage or glass reflections of people |

### Output format and size

* **Format:** JPEG, sRGB colour space, 8-bit, no alpha, quality around 72 to 80, 4:2:0 chroma, **progressive**.
* **Pixels:** the 3x size in the table (a little larger is fine; never smaller).
* **Maximum file size:** **150 KB each** (enforced by `src/__tests__/welcome-photos.test.ts`); about 0.9 MB for all seven.
* **Metadata:** strip EXIF, including any GPS position and camera serial number.
* **Filenames:** exactly `zoo.jpg`, `farm.jpg`, `cafe.jpg`, `crafts.jpg`, `soft-play.jpg`, `puddles.jpg`,
  `aquarium.jpg` (lower case, hyphen in `soft-play`).
* **Destination path:** `familypilot/assets/images/welcome/<filename>`.

## Replacing or adding an image

1. Prepare the file: `node scripts/prepare-welcome-photos.mjs <slot>=<source>` crops it to the slot's aspect around
   the focal point, scales it, strips metadata and writes `familypilot/assets/images/welcome/<slot>.jpg` within the
   size budget.
2. Update that slot's line in `assets/images/welcome/CREDITS.md` (`Origin` is `photograph` or `generated`, the
   creator or tool, the terms; a licence and a model release for any photograph that shows an identifiable child).
3. `src/assets/welcome-photos.ts` already imports the slot; a new slot needs a static `import` there (Metro needs
   each one written out).
4. `npx vitest run src/__tests__/welcome-photos.test.ts` checks the file, the credit line, that the origin is stated,
   the size budget, that nothing is credited but unwired or wired but uncredited, and that every slot has an image.
5. Rebuild and review Welcome at 360, 393 and 430 (`scripts/compare-canonical-screens.mjs`); nothing else on the
   screen should move.

The photographs are drawn behind a decorative (`aria-hidden`) layer, so assistive technology skips them; the
benefit cards, headline and button carry all the meaning.

## Alternative: one composed collage image

If a single baked image turns out to perform better than seven files, the same photographs can be delivered as one
composed collage instead. It is an alternative, not the plan: it does not change the design, but it costs
responsiveness (below), so choose it only if profiling shows a real benefit.

* **What it is:** one image of the whole collage region of the frame (the seven photographs already clipped to the
  approved masks, with the 11 px white sticker edge baked in, transparent outside the outlines). The stickers,
  headline, benefit cards and button stay live layers above it.
* **Format:** WebP (or PNG) **with alpha**, sRGB. Frame region x 0 to 852, y 129 to 1226 (frame px), which at 3x
  of the 393 pt phone is **about 1179 x 1518 px**; target under about 400 KB.
* **Filename and path:** `familypilot/assets/images/welcome/collage.webp`.
* **What it costs:** the composition is frozen at one scale, so the responsive behaviour the seven-slot version
  keeps is lost or has to be rebuilt around the single image: the giraffe shrinking clear of the headline on a
  narrow phone, and the collage moving down when the headline or subtitle takes a third line.
* **Code change needed:** `PhotoSlot` would be replaced by one `Image` for the stage; the masks, `WELCOME_CUTOUTS`
  and `welcome-photos.ts` would go with it. Not wired today.

The same visual tone, safe-area and licensing rules apply to either delivery.

## Why the seven-file delivery is the default

Seven small bundled files keep the approved masks and the responsive behaviour (the giraffe shrinking about its
right edge, the stickers scaling with the stage, the collage moving for a third text line) and cost about the same
bytes as one composite. A single composite also makes any later change to one photograph a re-render of all.
