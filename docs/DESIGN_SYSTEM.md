# FamilyPilot Design System

**Source of truth:** `familypilot/src/design-system/tokens/*.ts` and the primitives in
`familypilot/src/components/ui/`. This page describes them; if the two disagree, the code is right
and this page is stale. `src/__tests__/design-system-guard.test.ts` keeps consumer screens on the
tokens.

**Benchmark:** the approved Home screen (`app/(tabs)/index.tsx`) and its Figma frame "01 — Home".
Every value below that cites a frame node was read off that frame. Home is not redesigned; the rest
of the app is brought to Home's language.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#141416` | The one accent. Text, selected chips, primary buttons, the avatar, the floating nav (frame ink). `text.primary` is the same value. |
| `text.secondary` | `#6E6E73` | Second lines, metadata (frame node 7:17). |
| `text.tertiary` | `#8E8E93` | Captions, placeholders. Neutral, not purple-tinted. |
| `text.inverse` | `#FFFFFF` | Text on ink and on photography. |
| `background` | `#F6F5F9` | Screen background. |
| `surface` | `#FFFFFF` | Cards, sheets, idle chips. |
| `fill` | `#F0F0F3` | Quiet wells and information boxes that sit on a white card. |
| `border` / `borderLight` | `#ECE9F2` / `#F3F1F7` | Hairlines. |
| `secondary.*` (green) | `#1C8A57` … | Confirmed facts, success. |
| `warning.*` (amber) | `#A8660C` … | Cautions, "good to know". |
| `error.*` (red) | `#C4453B` … | Errors, closed. |
| `accent.*` (blue) | `#2F8FD6` … | Informational marks only. |
| `coral` | `#E0654A` | The filled save heart. |
| `glass.*`, `overlay`, `sheetScrim`, `gradient.*` | rgba on near-black | Chrome over photography; the sheet's scrim (0.42, approved). |
| `midnight.*` | `#14101F` → `#241C3D` | The one dark band on a screen; the fallback image gradient. |
| `categoryGradients` | per category | A venue with no photo still reads as designed. |
| `primary.*` (purple) | `#5B4FE8` … | **Legacy.** Retired from consumer chrome; still used by the internal enrichment tools and the onboarding illustration. The guard test fails on new consumer uses. |

## Typography

Inter, loaded in `app/_layout.tsx`. Headings are **Semi Bold** with a −0.025em track — the frame's
own weight (greeting node 7:16: Semi Bold 25.5; section heading node 7:30: Semi Bold 22). Extra Bold
and Black are loaded but no consumer text is set in them.

| Variant | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 32 / 38 | 600 | Onboarding headline, splash. |
| `heading1` | 26 / 32 | 600 | Screen titles. Home's greeting overrides to 25.5 and measures itself (`home-header-layout.ts`). |
| `heading2` | 22 / 28 | 600 | Section headings (Home's "Recommended for you"). |
| `heading3` | 17 / 24 | 600 | Card titles, button labels. |
| `body` | 16 / 24 | 400 | Body copy. |
| `bodySmall` | 14 / 20 | 400 | Secondary lines (colour `text.secondary`). |
| `caption` | 12 / 16 | 500 | Metadata, eyebrows (colour `text.tertiary`). |
| `label` | 13 / 18 | 600, +0.5 | Form group labels. |
| `link` | 14 / 20 | 600, ink | Inline text actions: "Undo", "View details", "Reset", "+ Add another child". |

## Spacing, radius, shadow

Spacing: `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48`,
`screenPadding 20`. Home's gutter is 24 at the 393 reference width and 20 below it
(`homeGutter()`); other screens use `screenPadding` until their slice brings them to the frame.

Radius: `sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 28 (photo cards, the deck) · sheet 34 (the
Create a Plan sheet) · full`.

Shadows: `card`, `cardHover`, `bottomSheet` — all cast in ink at 6–10% opacity.

Touch targets: 44pt minimum.

## Primitives

| Component | What it is | Notes |
| --- | --- | --- |
| `Text` | Typography variants above. | `color` overrides; `style` for frame-specific sizes. |
| `Button` | `primary` ink pill · `secondary` white with hairline · `outline` white with ink rule · `ghost` text only. | Sizes `sm 36 / md 48 / lg 56`. No variant is purple. |
| `Chip` | The one selection pill (frame "Category pills"): 44 tall, 20 side padding, Medium 14.5/18; selected = ink, idle = white. | `appearance="plain"` (no hairline; the Home rail on the app background) or `"outlined"` (hairline; chips on a white sheet). Lay rows out with `gap: CHIP_GAP` (10); the chip has no outer margin. |
| `PillSelector` | A single-choice rail or segmented row of `Chip`s. | Arranges; does not style. |
| `FamilyMatch` | The one Family Match badge (frame node 8:13): `★ 4.0 Family Match`, 32 tall. | `tone="onImage"` over photography, `"onLight"` on white. Unreviewed → "Not yet reviewed", no number. Unknown score → renders nothing. Scale and strings live in `src/utils/family-match-scale.ts`. |
| `FamilyMatchPanel` / `RecommendationPattern` | The explanation: classification word, "Why it suits your family", "Good to know", the secondary number line. | Word leads, number is secondary, cautions never render as positives. |
| `CircleButton` | Round control: `light` (white on photography), `dark` (ink), `glass`. | Back, save, filter, "go". |
| `SearchBar`, `Field`, `DateField`/`TimeField`, `BottomSheet`, `Card`, `SectionHeader`, `EmptyState`, `ErrorState`, `Skeleton*`, `VenueImage`, `DataTrustBadge` | Shared surfaces and states. | `DateField`/`TimeField` still render native browser inputs on web (slice 4). |

## Family Match: one scale, one vocabulary

- The score is computed 0–100 and **shown out of five to one decimal**, with a star, everywhere
  (`FAMILY_MATCH_SCALE = 'five-star'`). A percentage is never printed.
- The classification word (`Excellent match · Great match · Good match · Worth considering ·
  Limited match`) leads wherever there is room; the badge carries the number.
- `provider_only` / `ai_draft` places are **Not yet reviewed**: a status, no number, in the badge,
  the classification and the secondary line alike.
- A non-finite score (a restored Saved place not yet recomputed) is unknown: no badge, no "0.0".

## Motion and accessibility

`react-native-reanimated` for all animation; `useReducedMotion()` replaces springs with cuts.
Haptics: selection on chips, light impact on buttons. Every icon-only control has an
`accessibilityLabel`; selected chips expose `accessibilityState.selected`; the Family Match badge
speaks "4.0 out of 5 Family Match, Good match".
