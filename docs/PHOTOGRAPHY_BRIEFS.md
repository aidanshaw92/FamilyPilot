# Photography: the contract, the briefs, and what is needed

There are **two different photography contracts**. They are kept apart in the code, by tests, and here.

| | Where it appears | Generated imagery? | Where the files live |
| --- | --- | --- | --- |
| **A. Welcome** | The seven photographic cut-outs on the Welcome screen: brand / lifestyle | **Yes, appropriate.** They depict no venue. | `familypilot/assets/images/welcome/<slot>.jpg` (bundled) |
| **B. Fixture** | The deterministic visual-test / demo fixture's venue cards | **Yes, synthetic, test/demo only.** Never presented as a real venue. | `familypilot/scripts/fixtures/photos/venues/<category>-<n>.jpg` (served by the fixture server only; never bundled) |
| **C. Real venues** | Home, Explore, Venue Detail, Plans in production | **Never.** | The provider/cached photograph, or the category fallback |

## The photo contract for real venues (production)

```
REAL PHOTO AVAILABLE      -> that venue's own photograph (the provider's, through our proxy) + the required attribution
REAL PHOTO UNAVAILABLE    -> FamilyPilot's category fallback: a gradient and an icon, labelled "photo not available"
NEVER                     -> a generated or stock photograph standing in for a real venue
```

Pinned by `src/__tests__/photo-fallback-contract.test.ts` (the seams) and `fixture-photo-isolation.test.ts` (the fixture
folder). `VenueImage` takes only the venue's own URI and has nothing to substitute; only `welcome.tsx` reads the Welcome
photographs; nothing in `src/`, `app/`, `api/` or `server/` reads the fixture photographs. Generated photography is allowed
for Welcome brand imagery, for the fixture, and for clearly illustrative non-evidential artwork.

## Zero spend

Both sets are local files. The fixture photographs are served from disk by the fixture server on the bundle's own origin; the
Welcome photographs are bundled. Figma comparisons, visual regression, responsive captures, the accessibility audit and the
dynamic-content verifier make **no** Google Photos, Places, Overpass or other live image request.

## The campaign look (shared by every image in A and B)

Paste this block into the start of every prompt so the sets read as one campaign.

> Premium but natural UK family-day-out lifestyle photography. Warm natural daylight, soft and golden-neutral, no flash and no
> midday harshness. Candid rather than posed: a moment caught, not arranged. Realistic skin, fur, fabric, foliage and material
> texture. Playful, not stock-photo cheerful. Subtle colour richness with clean cream highlights, deep natural greens, and soft
> mint, blush, lilac and warm-yellow accents that sit well beside a cream-and-forest-green interface. Shot as if on a full-frame
> camera with a 50 to 85 mm lens, eye-level or slightly low, shallow-to-moderate depth of field, the subject clearly separated
> from the background. Natural anatomy, correct hands, no extra fingers or limbs. No text, no logos, no watermarks, no readable
> signage, no screens, no HDR look, no fantasy treatment, no illustration or painterly style. Children seen from behind, in
> profile, or by their hands and clothing, never a face-on portrait of an identifiable child.

---

## A. Welcome: seven photographs

Source of truth for crop, focal point, orientation, safe areas and sizes: `docs/WELCOME_PHOTOGRAPHY.md`. Do not change the masks,
the white sticker band, the stickers, the typography, the benefit cards, the CTA or the composition: each photograph is drawn
inside its existing cut-out.

**Generate each at least at its 3x size, and a little larger is better** (the installer crops to the exact aspect around the
focal point, resizes, strips metadata, and writes a progressive sRGB JPEG under 150 KB). Keep the subject inside the central 60%
of the frame, and never near a corner (the outline cuts the corners away).

| File | Pixels (at least) | Aspect | Focal point (from left, top) |
| --- | --- | --- | --- |
| `zoo` | 369 x 606 | 0.61 portrait | 38%, 28% (the eye) |
| `farm` | 521 x 522 | 1.00 square | 55%, 52% (hands on the rabbit) |
| `cafe` | 460 x 480 | 0.96 near-square | 50%, 52% (the cup) |
| `crafts` | 322 x 572 | 0.56 portrait | 40%, 50% (hands and work) |
| `soft-play` | 478 x 430 | 1.11 landscape | 55%, 50% (the child) |
| `puddles` | 412 x 389 | 1.06 landscape | 50%, 55% (the splash) |
| `aquarium` | 400 x 350 | 1.14 landscape | 40%, 50% (the penguin) |

Generate at roughly 2x these for sharpness (for example 1024 x 1536 for the zoo), at the same aspect.

**1. zoo: giraffe.** *[campaign look]* A giraffe, head and neck, looking towards the camera with a soft curious expression,
filling the upper half of a portrait frame. Eye at 38% from the left, 28% from the top; the whole head inside the left 70% of the
frame. Simple, softly out-of-focus background of trees and pale warm sky. Realistic coat pattern and eyelashes. No fence in
front of the face, no signage, no people.

**2. farm: child and rabbit.** *[campaign look]* A small child, seen from behind and in three-quarter profile, gently stroking a
brown-and-white rabbit at a wooden farm fence or hutch. Square frame; the child's hand on the rabbit at 55%, 52%. The rabbit is
sharp with realistic fur; the child wears a mustard or green knit and wellies; straw and soft green background. Hands correctly
formed. No face-on portrait, no signage, no other children.

**3. cafe: family-friendly café / coffee.** *[campaign look]* A latte with simple leaf latte art and a croissant on a worn wooden
table by a window, a small child's babyccino cup half in frame at the edge to suggest a family café, a houseplant and soft window
light behind. Near-square; the latte cup centred at 50%, 52% with a little steam. Warm, shallow depth of field. A plain cup with
no logo, no readable menu, no brand, no people's faces.

**4. crafts: children's arts and crafts.** *[campaign look]* A child's hands painting a small glazed pottery animal, paint pots in
bright primary colours at the edge, a brush mid-stroke. Portrait frame; hands and the piece in the centre (40%, 50%), the work
inside the left 65% of the frame. Newspaper-covered table, daylight from a window. Hands correctly formed. No face, no text on
the pots or the newspaper.

**5. soft-play: child in colourful soft play.** *[campaign look]* A toddler, seen from behind or in profile, mid-climb on a
colourful foam soft-play frame: bright primary shapes, a soft ramp, bright indoor light. Landscape frame; the child centred at
55%, 50%. Only this one child, no other children's faces, no signage or brand, premium clean venue.

**6. puddles: wellies and a puddle.** *[campaign look]* Yellow wellies mid-splash in a shallow puddle on a wet path, low angle,
water droplets frozen in warm low sun, reflective wet ground, a little green and autumn colour soft behind. Landscape frame;
the splash centred at 50%, 55%. No face needed; a hint of a raincoat sleeve is fine. No text.

**7. aquarium: penguin.** *[campaign look]* A penguin swimming underwater close to the glass, sharp and in the left 70% of a
landscape frame (40%, 50%), against clear blue water with soft caustic light. Realistic plumage and a bubble trail. No
reflections of people in the glass, no signage, no text.

### Files needed from you (Welcome)

The seven files, named exactly: `zoo`, `farm`, `cafe`, `crafts`, `soft-play`, `puddles`, `aquarium`, each as `.jpg`, `.png` or
`.webp`, at least the sizes above. Place them in one folder in the repository (for example `incoming/welcome/`) or give me the
folder path. Tell me the generator (tool, model and date) so the credit line is accurate and confirm commercial use is permitted
under its terms. I then run:

```
npm install --no-save sharp
node scripts/photos/install-welcome-photos.mjs <folder> --generator "<tool, model, date>"
```

and continue: rebuild, compare against the approved frame, check 360 / 393 / 430, regression, report.

---

## B. Fixture: synthetic venue photographs (test / demo only)

These make the fixture's cards judgeable. They are photorealistic pictures of *a kind of place*, never of a real or named venue,
and carry no provider provenance. They must contain **no logos, no venue names, no signs that identify a real venue, no Google
branding, no fake factual claims**.

**Supply every image portrait 4:5, at least 1600 x 2000 (1200 x 1500 is the minimum), JPEG or PNG.** Home's hero card is 4:5 and
Explore's thumbnail is a centre crop of the same picture, so keep the subject inside the central 70% and the horizon or main
interest about 45 to 55% down. Optional extras per category (a second or third image) are used to vary neighbouring cards.

| File (per category, `<name>.jpg` or `<name>-2.jpg`) | Required |
| --- | --- |
| `museum` | yes |
| `park` | yes |
| `soft-play` | yes |
| `farm` | yes |
| `attraction` | yes |
| `aquarium` | optional |
| `zoo` | optional |

**museum.** *[campaign look]* A child and a parent exploring a bright, modern science museum gallery. The child, seen from the
side, is operating a hands-on interactive exhibit (a colourful light-and-motion panel or air-flow demonstration) that is clearly
visible. Tall windows or a skylight, white walls and warm timber, a few other visitors softly out of focus and unidentifiable.
The photographic energy of the approved Science Museum Home reference (`docs/figma-approved/`): airy, vivid, welcoming. No museum
name, no branding, no readable labels.

**park.** *[campaign look]* An attractive London-style urban park in warm afternoon light: mature plane and oak trees, a wide
mown lawn, a curving path, a family with a pushchair and a toddler small and soft in the middle distance, a distant hint of
Victorian railings. Family-day-out atmosphere. No signs, no named landmarks, no readable text.

**soft-play.** *[campaign look]* A colourful premium indoor soft-play environment: climbing structures, a slide, ball pit and
foam shapes in a cohesive palette, bright even light, a child in the distance climbing, softly out of focus. Clean, child-safe,
spacious. No branding, no signage, no readable text.

**farm.** *[campaign look]* A family-friendly farm in natural UK daylight: a paddock with sheep or goats at a wooden fence, a
child in wellies at the rail seen from behind, a red-brick barn and green hills behind. No signs, no farm name, no text.

**attraction.** *[campaign look]* A generic family attraction: an interesting glass-and-timber building with a bright interactive
courtyard where families are exploring, a mix of architecture and activity, warm daylight. No identifiable real-world building,
no branding, no signage, no text.

**aquarium (optional).** *[campaign look]* Children's silhouettes, seen from behind, in front of a large blue aquarium window with
a ray or shoal glowing in soft light. No signage, no text, no identifiable branding.

**zoo (optional).** *[campaign look]* A family at a zoo enclosure rail seen from behind, a giraffe or meerkats in warm light
beyond; natural, unposed. No signage, no names, no text.

### Files needed from you (fixture)

At least the five required files (`museum`, `park`, `soft-play`, `farm`, `attraction`), more if you like. Put them in one folder
or give me the path. I then run:

```
npm install --no-save sharp
node scripts/photos/install-fixture-photos.mjs <folder>
```

which writes them to `scripts/fixtures/photos/venues/` and nothing anywhere else. They are served, not bundled, so no app rebuild
is needed for them (restart the fixture server). The NO PHOTO fixture keeps showing the non-photographic category fallback.

---

## After the files arrive (what happens next, with no further questions)

1. Install A (Welcome) and B (fixture) as above; run `welcome-photos.test.ts`, `fixture-photo-isolation.test.ts`, the full suite.
2. Rebuild; regenerate Welcome, Home and Explore at 360, 393 and 430 from the **running app**.
3. Regenerate the canonical boards for WELCOME, HOME and EXPLORE: A approved Figma, B real app, C 50% overlay, D difference.
4. Review Explore across FULL DATA, PARTIAL DATA, UNREVIEWED, LONG NAME and NO PHOTO.
5. Responsive, accessibility and dynamic-content verifiers; regression; report. No PR until you say.
