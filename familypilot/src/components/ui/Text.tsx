import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';

import { colors, typography, TypographyVariant } from '@/src/design-system/tokens';

interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string;
}

export function Text({ variant = 'body', color, style, ...props }: TextProps) {
  return (
    <RNText
      style={[typography[variant], color ? { color } : undefined, style]}
      {...props}
    />
  );
}

export function MonoText(props: RNTextProps) {
  return <RNText style={styles.mono} {...props} />;
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: colors.text.primary,
  },
});
