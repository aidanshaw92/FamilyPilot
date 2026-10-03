import { TextStyle } from 'react-native';

import { colors } from './colors';

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
} as const;

/**
 * The approved Home frame sets every heading in Inter Semi Bold with a -0.025em track (the greeting,
 * node 7:16, is 25.5 with -0.6375; the section heading, node 7:30, is 22 with -0.44). The token
 * scale used to be Extra Bold, which is why every screen after Home read heavier than the design.
 * Headings now share the frame's weight and track so Home's local overrides and the rest of the
 * app resolve to the same voice.
 */
const HEADING_TRACK = -0.025;

export const typography = {
  display: {
    fontFamily: fontFamily.semiBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: 32 * HEADING_TRACK,
    color: colors.text.primary,
  },
  heading1: {
    fontFamily: fontFamily.semiBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 26 * HEADING_TRACK,
    color: colors.text.primary,
  },
  heading2: {
    fontFamily: fontFamily.semiBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 22 * HEADING_TRACK,
    color: colors.text.primary,
  },
  heading3: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text.primary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text.primary,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: colors.text.tertiary,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.5,
    color: colors.text.secondary,
  },
  /**
   * The small upper-case line above a title (the Home card's "SOFT PLAY", frame: Medium 13/16 with
   * a +1.04 track). Callers pass the text already in capitals; the variant does not transform it,
   * so what a screen reader and a DOM probe see is what is drawn.
   */
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.04,
    color: colors.text.secondary,
  },
  /** An inline text action ("Undo", "View details", "Reset"): ink and a touch heavier than the body
   * copy around it, so it reads as pressable without borrowing a colour from nowhere. */
  link: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
