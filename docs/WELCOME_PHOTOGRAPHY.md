# Welcome photography: the one outstanding asset dependency

> **Update.** Welcome is brand / lifestyle imagery, so **generated photography is appropriate here** (it depicts no venue). This
> supersedes the earlier "no generated imagery" wording below. Home and Explore are different: they show real venues and never
> use generated photographs. The exact briefs, the delivery steps and the installer are in `docs/PHOTOGRAPHY_BRIEFS.md`.
> `scripts/photos/install-welcome-photos.mjs` crops, sizes, strips metadata, credits and wires the files in one step.

This is the complete handoff for the only visual dependency left on the approved Welcome frame (Figma
`166:128`). Everything else on Welcome, Home and Explore is implemented.

The Welcome frame is a collage of **seven photographic cut-outs**. The cut-out shapes, their positions, the
white sticker edge and the decorative stickers over them are implemented exactly (`WELCOME_CUTOUTS`,
`PhotoSlot`, `WELCOME_ART`). **The photographs themselves are not in the repository**, because none could be
legitimately obtained:

* The photographs inside the Figma frame are *review-only crops of the owner's reference screenshot*. They are
  not licensed assets and must never ship. No app code or bundle references them.
* This environment cannot reach any photo host (Wikimedia, Unsplash, Pexels, Pixabay and Flickr were all
  re-tested and refused) and has no image-generation capability, so the photographs are generated or supplied
  externally and installed with the script above. Stock-looking images and the review-crop references stay excluded.

Until the files below exist, each slot draws its category gradient inside its exact cut-out. That is a
**temporary fallback**, never the finished screen. Nothing about the masks, the white edge, the stickers or the
composition changes when the photographs arrive: each file is simply drawn inside its existing slot.

## What is needed

Seven candid, editorial photographs for one campaign: generated for FamilyPilot (the generator and its commercial-use terms
recorded in `CREDITS.md`) or commissioned / CC0. No posed stock, no identifiable venue shown as if recommended, and no real
child's likeness without a model release (a generated child depicts no one). Prefer a child shown from behind, in profile, or
by hands and clothing over a face-on portrait. Natural anatomy, no visible AI artefacts, no HDR look, no fantasy treatment.

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
| `cafe` (`cafe.jpg`) | A family-friendly café: a latte and a croissant on a wooden table, a child's babyccino at the edge, a plant or window light behind | Near-square | 153 x 160 | 460 x 480 | 0.96 | 50%, 52% (the cup) | None | The cup and pastry centred with a little warm light; a shallow depth of field; no brand on the cup |
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

## How to ship them

1. Put each file at `familypilot/assets/images/welcome/<slot>.jpg`.
2. Add one line per file to `assets/images/welcome/CREDITS.md` (photographer, source, licence, model release if a
   child is shown).
3. Add the matching static `require` in `src/assets/welcome-photos.ts` (React Native needs each one written out).
4. `npx vitest run src/__tests__/welcome-photos.test.ts` checks the file, the credit line, the size budget, and that
   nothing is credited but unwired or wired but uncredited. The `todo` in that test names the slots still missing;
   it passes once all seven ship.
5. Rebuild, and review Welcome at 360, 393 and 430 (`scripts/compare-canonical-screens.mjs`): the real
   photographs replace the gradients inside the same cut-outs, so nothing else on the screen should move.

The photographs are brand artwork, bundled with the app: **no runtime request, no provider call, no cost**. They
are drawn behind a decorative (`aria-hidden`) layer, so assistive technology skips them; the benefit cards,
headline and button carry all the meaning.

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
