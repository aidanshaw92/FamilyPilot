# FamilyPilot brand mark

**Status:** direction E3 approved by the owner on 2026-10-04 (final optical refinement signed off).
Source of truth for the shape: Figma `LNpbdnuAWcfWf9spvB7jBz`, Components page, `Brand / Mark`
(variants Light / Green / Mono / Inverse), `Brand / Lockup` and `Brand / App icon`. The final
presentation board is "07 — FamilyPilot mark · FINAL E3" on the Logo page.

## The mark

A leader on its point and two followers of different sizes tucked behind it; the cuts of light
between them carry the movement. It says "we go somewhere together" without a silhouette, an arrow,
a pin, a leaf, a heart or a letter. There is one mark at every size: no embellished large version,
no yellow point, no alternates.

Construction on a 120 grid:

| Part | Shape |
| --- | --- |
| Leader | 54 soft square rotated 45° about (73, 60); three corners radius 25, the forward (right) corner radius 11; Figma adds corner smoothing 0.7 |
| Follower 1 | circle r18 at (40, 38) |
| Follower 2 | circle r15 at (42, 84) |
| Kerf | the followers are cut by the leader grown by 3, never less than 1.3px on screen |

Colour: Light (canvas or white) = leader `action #0F4A3E`, followers `brand.green #3F9A82`.
Green (on the deep green) = leader white, followers `brand.mint #5FB3A3`. Mono = ink `#0D1733`.
Inverse = white.

## Wordmark

`FamilyPilot`, one word, Inter Bold, −2.5% tracking. "Family" in ink, "Pilot" in the action green
on light and in mint on the deep green. Never add a space or a gap between the halves; never set it
in another weight.

## Where it lives in the product

| Asset | File | From |
| --- | --- | --- |
| App icon (iOS, Expo) | `assets/images/icon.png` 1024, green, mark at 73% | `scripts/brand/render-brand-assets.mjs` |
| Android adaptive icon | `android-icon-foreground.png` (mark, transparent, inside the 66% safe zone), `android-icon-background.png` (flat green), `android-icon-monochrome.png` | same |
| Splash | `splash-icon.png` (light mark on transparent; background `#FBFAF7` in `app.json`) | same |
| Favicon | `favicon.png` 48, green rounded square | same |
| In the app | `BrandMark` (`src/components/ui/BrandMark.tsx`), Welcome brand row at 40 | component |

Regenerate every raster with `node scripts/brand/render-brand-assets.mjs` (Chromium rasterises the
SVG; no design tool export involved), then commit the PNGs.
