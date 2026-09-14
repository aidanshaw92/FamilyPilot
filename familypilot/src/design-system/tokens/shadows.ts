import { ViewStyle } from 'react-native';

/** Surfaces are separated by a hairline border and whitespace, not by heavy elevation.
 * Shadow is reserved for things that genuinely float above the page: the bottom nav,
 * a sheet, a control sitting on photography. */
export const shadows = {
  /** Effectively flat: cards rely on `colors.border` instead. */
  card: {
    shadowColor: '#14141A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHover: {
    shadowColor: '#14141A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  /** The floating bottom navigation and fixed CTAs. */
  floating: {
    shadowColor: '#14141A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  bottomSheet: {
    shadowColor: '#14141A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = typeof shadows;
