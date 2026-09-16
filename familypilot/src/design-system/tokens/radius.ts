export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  /** Large photographic cards — the Home recommendation deck. */
  '3xl': 28,
  full: 9999,
} as const;

export type RadiusToken = typeof radius;
