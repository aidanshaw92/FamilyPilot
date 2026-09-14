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

/** Restrained: two loud sizes at most on a screen, everything else quiet grey. */
export const typography = {
  /** A single number that is the whole point of the moment. Use sparingly. */
  scoreDisplay: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    color: colors.text.primary,
  },
  /** Screen-opening greeting. */
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: colors.text.primary,
  },
  /** Section headings ("Select your plan") and place names. */
  heading1: {
    fontFamily: fontFamily.bold,
    fontSize: 23,
    lineHeight: 29,
    letterSpacing: -0.5,
    color: colors.text.primary,
  },
  heading2: {
    fontFamily: fontFamily.semiBold,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: colors.text.primary,
  },
  heading3: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
    color: colors.text.primary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.text.primary,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.tertiary,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: 0.2,
    color: colors.text.secondary,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
