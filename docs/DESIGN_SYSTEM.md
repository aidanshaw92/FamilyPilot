# FamilyPilot Design System

**Source of truth:** `familypilot/src/design-system/tokens/*.ts` and the primitives in
`familypilot/src/components/ui/`. This page describes them; if the two disagree, the code is right
and this page is stale. `src/__tests__/design-system-guard.test.ts` keeps consumer screens on the
tokens.

**Benchmark:** the three approved identity references (Home, Explore, Welcome) and their Figma
frames on the "Screens" page of `LNpbdnuAWcfWf9spvB7jBz` ("Home v2", "Explore v2", "Welcome v2"),
built from the variables, styles and components on that file's Foundations and Components pages.
The geometry of the earlier approved Home frame ("01 — Home") is kept; the identity recolours it.
Every value below that cites a frame node was read off a frame. `docs/VISUAL_IDENTITY.md` records
the assessment and the palette as sampled from the references.

## Colour

Two roles that used to share one near-black are distinct: **ink** (navy) is what text is set in;
**action** (deep green) is what controls are drawn in. A control that needs emphasis goes green; a
word never does, except a link. The three tints and the yellow are accents: idle chips in a rail,
icon wells, decorative marks. They carry no meaning; a chip's tint is assigned by position
(`railTint(index)`), never by what it filters.

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#0D1733` | Text. `text.primary` is the same value. Never a control background. |
| `action` / `actionPressed` / `actionStrong` | `#0F4A3E` / `#0B3B32` / `#15534A` | Primary buttons, selected chips, the nav pill, the arrow CTA, the filter disc, focus rings, links. |
| `actionSoft` | `#E7F3EF` | Mint behind a green mark: Family Fit on a light surface, the compact CTA's disc. |
| `nav.pill` / `nav.active` | action / `#DDF1E8` | The floating navigation and its active disc. |
| `tint.mint` / `.blush` / `.lilac` / `.yellow` | `#E7F3EF` / `#FBECEA` / `#F3ECFB` / `#FDF1CC` | Idle chip and icon-well fills, by position. |
| `tintStrong.*` | `#DDF1E8` / `#FADBD8` / `#EADFF8` | The deeper tone of each tint: blobs, a stronger well. |
| `brand.mint` / `.coral` / `.violet` / `.yellow` / `.green` | `#5FB3A3` / `#E26B4A` / `#6B21E8` / `#F7C12E` / `#3F9A82` | Icons on the tints; the decorative strokes and leaves. |
| `text.secondary` / `text.tertiary` | `#626A80` / `#8A91A0` | Second lines, metadata; captions, placeholders. |
| `text.inverse` | `#FFFFFF` | Text on action green and on photography. |
| `background` / `surface` | `#FBFAF7` / `#FFFFFF` | Warm canvas; cards and sheets are pure white on it. |
| `fill` | `#F3F1EC` | Quiet wells and information boxes on a white card; the unreviewed Family Fit pill. |
| `border` / `borderLight` | `#E9E7E1` / `#F1EFEA` | Hairlines. |
| `secondary.*` (green) | `#3F9A82` … | Confirmed facts, success: the identity's mid green. |
| `warning.*` (amber) | `#A8660C` … | Cautions, "good to know". |
| `error.*` (red) | `#C4453B` … | Errors, closed. |
| `accent.*` (blue) | `#2F8FD6` … | Informational marks only. |
| `coral` | `#E26B4A` | The filled save heart. |
| `glass.*`, `overlay`, `sheetScrim`, `gradient.*` | rgba on green-black / navy | Chrome over photography fades to green-black (`#0A2E27`), not neutral black; `glass.action` is the deck CTA and Family Fit on an image; the sheet's scrim (0.42, approved) is navy. |
| `midnight.*` | `#0B3B32` → `#15534A` | The one dark band on a screen; the fallback image gradient; the profile avatars. |
| `categoryGradients` | per category | A venue with no photo still reads as designed; a Welcome photo slot until its photograph exists. |
| `primary.*` (purple) | `#5B4FE8` … | **Legacy.** Retired from consumer chrome; still used by the internal enrichment tools. The guard test fails on new consumer uses. |

## Typography

Inter, loaded in `app/_layout.tsx`. The page voice (the greeting, "Explore London", the Welcome
headline, section headings) is **Bold** with a −0.025em track, as the references set it; card
titles and button labels stay **Semi Bold**. Extra Bold and Black are loaded but no consumer text is
set in them.

| Variant | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 32 / 38 | 700 | The Welcome headline, splash. |
| `heading1` | 26 / 32 | 700 | Screen titles. Home's greeting overrides to 25.5 and measures itself (`home-header-layout.ts`). |
| `heading2` | 22 / 28 | 700 | Section headings ("Select your plan"). |
| `heading3` | 17 / 24 | 600 | Card titles, button labels. |
| `body` | 16 / 24 | 400 | Body copy. |
| `bodySmall` | 14 / 20 | 400 | Secondary lines (colour `text.secondary`). |
| `caption` | 12 / 16 | 500 | Metadata, eyebrows (colour `text.tertiary`). |
| `label` | 13 / 18 | 600, +0.5 | Form group labels. |
| `link` | 14 / 20 | 600, action | Inline text actions: "Undo", "View details", "Reset", "+ Add another child". |
| `eyebrow` | 13 / 16 | 500, +1.04 | The small upper-case line above a title (Home card's "SOFT PLAY", "FAMILY FIT", "WHEN", "MORNING"). Callers pass capitals; the variant does not transform. |

## Spacing, radius, shadow

Spacing: `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48`,
`screenPadding 20`. Home's gutter is 24 at the 393 reference width and 20 below it
(`homeGutter()`); other screens use `screenPadding` until their slice brings them to the frame.

Radius: `sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 28 (photo cards, the deck) · sheet 34 (the
Create a Plan sheet) · full`.

Shadows: `card`, `cardHover`, `bottomSheet` — all cast in ink at 6–10% opacity.

Touch targets: 44pt minimum.

## Brand mark

The FamilyPilot mark is direction E3, approved 2026-10-04: a leader on its point and two followers
tucked behind it. `BrandMark` (`src/components/ui/BrandMark.tsx`) draws it in the app; the app icon,
adaptive icon, splash and favicon are rendered from the same geometry by
`scripts/brand/render-brand-assets.mjs`. Construction, colours and rules are in `docs/BRAND.md`.
There is one mark at every size and no alternates.

## Decoration

The identity's ornament is the **decorative artwork of the approved frames**, drawn from their own
vectors: `ScreenArt` (`src/components/ui/ScreenArt.tsx`) paints a horizontal slice of an exported layer
(`src/assets/art/*.svg`, turned into `src/assets/art/figma-art.ts` by `scripts/build-art.mjs`; re-export
from the frame and rebuild to change it). It appears on Welcome (the stickers between and over the
photographs), Home (strokes by the avatar, the sprig and dashes by the search, the plan heading's
strokes, the leaves and blobs around the deck, the foot marks) and Explore (the leaves, blobs and strokes
in the gutters). Venue Detail, the plan screens, Profile and every form stay plain so the facts on them
are the focus. Artwork sits on the canvas behind content, never on a control or under text it could
obscure; it ignores the pointer and is hidden from assistive technology.

Where a mark follows the fixed-size type (beside a heading) it is placed in fixed points; where it follows
the screen's edge (a leaf off the right side, the foot marks) or the deck (which scales with the phone) it
scales with the width. `ScreenArt`'s `from`/`to` slice, `anchor`, `width` and `clipX`/`align` express that;
Home and Explore split their artwork accordingly. A phone narrower than the frame draws the marks smaller.

Photography is editorial and candid when the product owns it. A `PhotoSlot` clips its photograph to one of
the seven cut-outs the approved Welcome frame's own mask vectors draw (`WELCOME_CUTOUTS`, generated from
`src/assets/art/masks/`), inside a white sticker edge; Welcome's slots are placed by their frame
coordinates (`welcome-layout.ts`). Until a licensed photograph is supplied for a slot it shows the
category-gradient treatment inside the same cut-out: no stock image, no generated image, and never a
photo that impersonates a venue. The photographs in the Figma frame are review-only crops and are not
assets.

## Primitives

| Component | What it is | Notes |
| --- | --- | --- |
| `Text` | Typography variants above. | `color` overrides; `style` for frame-specific sizes. |
| `Button` | `primary` action-green pill · `secondary` white with hairline, green text · `outline` white with green rule · `ghost` text only. | Sizes `sm 36 / md 48 / lg 56`; `trailingIcon` for "Get started →". No variant is purple or ink. |
| `Chip` | The one selection pill (frame "Category pills"): 44 tall, 20 side padding, Medium 14.5/18; selected = action green, idle = white or a tint. | `tint="mint" \| "blush" \| "lilac"` for a rail, assigned by `railTint(index)`; `appearance="plain"` (no hairline) or `"outlined"` (hairline; chips on a white sheet). Lay rows out with `gap: CHIP_GAP` (10); the chip has no outer margin. |
| `PillSelector` | A single-choice rail or segmented row of `Chip`s. | Arranges and tints a scrolling rail by position; does not style. |
| `FamilyMatch` | The one Family Fit badge (frame node 8:13, resized to the approved Home and Explore references): `★ 4.0 Family Fit`, 28 tall; `size="compact"` is frame node 49:5's `★ 4.3` beside a venue name, 30 tall, where a "Why this score" link carries the word. | `tone="onLight"` is a mint pill with green star and text; `"onImage"` is the green pill with white. Unreviewed → "Not yet reviewed" on the neutral fill, no number. Unknown score → renders nothing. Scale and strings live in `src/utils/family-match-scale.ts`. |
| `FamilyMatchPanel` / `RecommendationPattern` | The explanation: classification word, "Why it suits your family", "Good to know", the secondary number line. | Word leads, number is secondary, cautions never render as positives. |
| `ArrowCta` | The emphasised action with an arrow disc: 58 tall, white disc; `size="compact"` is the Explore card's 44 with a 32 disc (the reference draws 42; 44 keeps the touch target); `disc="mint"` on Explore. | Home's "See more", Venue Detail's "Create a plan", the plan's "Save this plan", every Explore result. |
| `SearchBar` | The 56 search pill with the filter disc inside its right edge (Home), or `actionLabel="Search"` for a green action pill there instead (Explore). | |
| `CircleButton` | Round control: `light` (white on photography), `dark` (action green), `glass`. | Back, save, filter, "go". |
| `IconWell` | A 48 tinted square behind an icon, the icon in the tint's saturated partner. | Welcome's benefit cards, empty states. |
| `ScreenArt` / `PhotoSlot` | See Decoration above. | |
| `DateField` / `TimeField` | A drawn field (white, hairline, 48 tall) showing the value in the app's words — "Friday 2 October 2026", "09:00" — with the platform's native picker kept underneath, transparent, for the interaction. | ISO values in, ISO values out. Labels from `date-time-labels.ts`. Native apps keep the plain text field. |
| `SearchBar`, `Field`, `BottomSheet`, `Card`, `SectionHeader`, `EmptyState`, `ErrorState`, `Skeleton*`, `VenueImage`, `DataTrustBadge` | Shared surfaces and states. | |

## Family Fit: one scale, one vocabulary

- The score is computed 0–100 and **shown out of five to one decimal**, with a star, everywhere
  (`FAMILY_MATCH_SCALE = 'five-star'`). A percentage is never printed.
- The classification word (`Excellent fit · Great fit · Good fit · Worth considering ·
  Limited fit`) leads wherever there is room; the badge carries the number.
- `provider_only` / `ai_draft` places are **Not yet reviewed**: a status, no number, in the badge,
  the classification and the secondary line alike.
- A non-finite score (a restored Saved place not yet recomputed) is unknown: no badge, no "0.0".
- The explanation panel (`RecommendationPattern`) draws three kinds of line and never mixes them:
  **reasons** (`familyScore.explanation`, green tick — only positives), **cautions**
  (`familyScore.cautions`, amber, "Worth checking" — what counts against *this* family: a long
  drive, a missing must-have, a routine clash, a reviewed negative) and **notes** (`venue.goodToKnow`,
  neutral, "Good to know" — the venue's own remarks). "Information confidence" badges come from
  `trust-badges.ts` and exist only when the fact behind them does.

## Motion and accessibility

`react-native-reanimated` for all animation; `useReducedMotion()` replaces springs with cuts.
Haptics: selection on chips, light impact on buttons. Every icon-only control has an
`accessibilityLabel`; selected chips expose `accessibilityState.selected`; the Family Fit badge
speaks "4.0 out of 5 Family Fit, Good fit".

## Clock and date

One clock: **24-hour**, zero-padded (`09:05`, `14:21`), from `formatClock` and the plan's own
`clockLabel`. Dates a parent chooses are spelled out with the weekday (`Friday 2 October 2026`) so no
browser locale can swap day and month. ISO strings underneath, everywhere.
