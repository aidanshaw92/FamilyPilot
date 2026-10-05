import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, PressableProps, StyleSheet, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

import { ArrowGlyph } from './icons';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  /** A glyph after the label (Welcome's "Get started →"). Decorative: the label is the name. */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

/**
 * The identity's one emphasised action is a deep-green pill (Home's "See more", Welcome's "Get
 * started"), so primary is the action green. Everything quieter is green text on white: `secondary`
 * with a hairline, `outline` with a green rule, `ghost` with nothing. No variant is purple or ink.
 */
const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.action, text: colors.text.inverse },
  secondary: { bg: colors.surface, text: colors.action, border: colors.border },
  ghost: { bg: 'transparent', text: colors.action },
  outline: { bg: colors.surface, text: colors.action, border: colors.action },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  trailingIcon,
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
      {trailingIcon === 'arrow-forward' ? (
        // Welcome's CTA arrow is the frame's own vector (node 172:241), not the icon font's.
        <ArrowGlyph size={14} color={v.text} />
      ) : trailingIcon ? (
        <Ionicons name={trailingIcon} size={20} color={v.text} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    gap: spacing.sm,
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
