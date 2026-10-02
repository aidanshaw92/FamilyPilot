export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  /** Large photographic cards — the Home recommendation deck. */
  '3xl': 28,
  /**
   * The Create a Plan bottom sheet's top corners, from the approved reference.
   *
   * Larger than any card radius on purpose: the sheet is a surface the venue sits behind, not a card
   * on top of it, and the approved frame draws that distinction with the corner alone.
   */
  sheet: 34,
  full: 9999,
} as const;

export type RadiusToken = typeof radius;
