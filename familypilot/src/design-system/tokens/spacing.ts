export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  /** Side gutter for every screen. */
  screenPadding: 20,
} as const;

/** Shared layout constants so screens agree on how much room the floating chrome needs. */
export const layout = {
  /** Height of the floating dark bottom navigation. */
  navHeight: 64,
  /** Clearance a scrolling screen must leave so content clears the floating nav. */
  navClearance: 116,
  /** Clearance for a screen with a fixed bottom CTA above the nav. */
  ctaClearance: 168,
  /** Hero photography height on a detail screen (~38% of an iPhone viewport). */
  heroHeight: 320,
  /** How far the detail bottom sheet overlaps the hero photograph. */
  sheetOverlap: 34,
} as const;

export type SpacingToken = typeof spacing;
