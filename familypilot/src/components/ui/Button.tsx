import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, PressableProps, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  /** A trailing circular arrow, the way the reference ends its primary actions. */
  trailingArrow?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary[500], text: colors.text.inverse },
  secondary: { bg: colors.surfaceSunken, text: colors.text.primary },
  ghost: { bg: 'transparent', text: colors.text.primary },
  outline: { bg: colors.surface, text: colors.text.primary, border: colors.border },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  trailingArrow = false,
  icon,
  style,
  onPress,
  disabled,
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
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        size === 'lg' && styles.lg,
        trailingArrow && styles.withArrow,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : undefined,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {icon ? <Ionicons name={icon} size={18} color={v.text} style={styles.icon} /> : null}
      <Text variant="heading3" color={v.text} style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {trailingArrow ? (
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={17} color={colors.text.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing['2xl'],
    minHeight: 52,
  },
  sm: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  lg: {
    minHeight: 58,
  },
  withArrow: {
    justifyContent: 'space-between',
    paddingRight: spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.4,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    letterSpacing: -0.1,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
