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

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary[500], text: colors.text.inverse },
  secondary: { bg: colors.secondary[500], text: colors.text.inverse },
  ghost: { bg: 'transparent', text: colors.primary[500] },
  outline: { bg: colors.surface, text: colors.primary[500], border: colors.primary[500] },
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
    borderRadius: radius.md,
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
