/** Generous radii are the loudest part of this design language. Cards and images are
 * heavily rounded; only the smallest chrome stays tight. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  '2xl': 28,
  /** Large image cards and hero photography. */
  '3xl': 32,
  /** The bottom sheet's top corners. */
  sheet: 36,
  full: 9999,
} as const;

export type RadiusToken = typeof radius;
