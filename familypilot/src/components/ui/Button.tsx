import * as Haptics from 'expo-haptics';
import { Pressable, PressableProps, StyleSheet, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  style?: ViewStyle;
}

/**
 * The approved frames draw the one emphasised action as a near-black pill (Home's "See more", the
 * sheet's "Create plan"), so primary is ink. Everything quieter is ink text on white: `secondary`
 * with a hairline, `outline` with an ink rule, `ghost` with nothing. No variant is purple.
 */
const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.ink, text: colors.text.inverse },
  secondary: { bg: colors.surface, text: colors.ink, border: colors.border },
  ghost: { bg: 'transparent', text: colors.ink },
  outline: { bg: colors.surface, text: colors.ink, border: colors.ink },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  style,
  onPress,
  ...props
}: ButtonProps) {
  const v = variantStyles[variant];

  const handlePress = (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        size === 'lg' && styles.lg,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : undefined,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        style,
      ]}
      {...props}
    >
      <Text variant="heading3" color={v.text} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  sm: {
    paddingVertical: spacing.sm,
    minHeight: 36,
  },
  lg: {
    paddingVertical: spacing.lg,
    minHeight: 56,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 16,
  },
});
