import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';

import { colors, radius, shadows } from '@/src/design-system/tokens';

export type CircleButtonTone = 'light' | 'dark' | 'glass';

interface CircleButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  /** light = white on photography, dark = the primary near-black control, glass = translucent. */
  tone?: CircleButtonTone;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  style?: ViewStyle;
  disabled?: boolean;
}

const TONE_BACKGROUND: Record<CircleButtonTone, string> = {
  light: colors.surface,
  // The approved frames use a near-black control, not the purple brand primary.
  dark: colors.text.primary,
  glass: colors.glass.light,
};

const TONE_ICON: Record<CircleButtonTone, string> = {
  light: colors.text.primary,
  dark: colors.text.inverse,
  glass: colors.text.primary,
};

/** The floating round control the reference uses for back, favourite, filter and "go". */
export function CircleButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'light',
  size = 44,
  iconSize,
  iconColor,
  style,
  disabled,
}: CircleButtonProps) {
  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: TONE_BACKGROUND[tone],
        },
        tone === 'light' && styles.lightElevation,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSize ?? Math.round(size * 0.45)}
        color={iconColor ?? TONE_ICON[tone]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightElevation: {
    ...shadows.card,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
