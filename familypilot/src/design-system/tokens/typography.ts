import { TextStyle } from 'react-native';

import { colors } from './colors';

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.text.primary,
  },
  heading1: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: colors.text.primary,
  },
  heading2: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
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
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
