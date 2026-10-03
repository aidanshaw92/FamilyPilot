import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

/**
 * The approved frames' one emphasised action with an arrow disc: Home's "See more" (node 8:18),
 * Venue Detail's "Create a plan" (72:2), Create a plan's "Build my plan" (76:65) and the Plan's
 * "Invite family & friends" (71:32) are all this shape: an ink pill 58 tall, the label centred in
 * SemiBold 16, a 46 white disc inset 6 on the right with a 20 ink arrow.
 */
const HEIGHT = 58;
const DISC = 46;

interface ArrowCtaProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function ArrowCta({ label, onPress, disabled = false, testID, accessibilityLabel, style }: ArrowCtaProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [styles.pill, disabled && styles.disabled, pressed && !disabled && styles.pressed, style]}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.disc}>
        <Ionicons name="arrow-forward" size={20} color={colors.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: DISC + spacing.md,
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.4 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  disc: {
    position: 'absolute',
    right: (HEIGHT - DISC) / 2,
    top: (HEIGHT - DISC) / 2,
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
