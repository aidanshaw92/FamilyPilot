import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

/**
 * The approved frames' one emphasised action with an arrow disc: Home's "See more" (node 8:18),
 * Venue Detail's "Create a plan" (72:2), Create a plan's "Build my plan" (76:65) and the Plan's
 * "Invite family & friends" (71:32) are all this shape: a deep-green pill 58 tall, the label centred
 * in SemiBold 16, a 46 white disc inset 6 on the right with a 20 green arrow.
 *
 * `size="compact"` is the Explore result card's CTA (Figma "Arrow CTA / Size=Compact"): 48 tall, a
 * 36 mint disc, the label SemiBold 14. Explore's cards use `disc="mint"`.
 */
const SIZES = {
  default: { height: 58, disc: 46, inset: 6, font: 16, line: 20, arrow: 20 },
  compact: { height: 48, disc: 36, inset: 6, font: 14, line: 18, arrow: 18 },
} as const;

/** Compact's label space is the pill minus these: the left pad and the disc with its insets. */
export const COMPACT_LABEL_INSET = 10 + SIZES.compact.disc + SIZES.compact.inset * 2;

interface ArrowCtaProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The arrow disc: white on a card or sheet, mint on Explore's result cards. */
  disc?: 'white' | 'mint';
  size?: keyof typeof SIZES;
  testID?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function ArrowCta({
  label,
  onPress,
  disabled = false,
  disc = 'white',
  size = 'default',
  testID,
  accessibilityLabel,
  style,
}: ArrowCtaProps) {
  const s = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        {
          height: s.height,
          borderRadius: s.height / 2,
          paddingLeft: size === 'compact' ? 10 : s.disc + spacing.md,
          paddingRight: size === 'compact' ? s.disc + s.inset * 2 : s.disc + spacing.md,
        },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, { fontSize: s.font, lineHeight: s.line }]} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={[
          styles.disc,
          { right: s.inset, top: s.inset, width: s.disc, height: s.disc, borderRadius: s.disc / 2 },
          disc === 'mint' && styles.discMint,
        ]}
      >
        <Ionicons name="arrow-forward" size={s.arrow} color={colors.action} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.4 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text.inverse,
    textAlign: 'center',
  },
  disc: {
    position: 'absolute',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discMint: {
    backgroundColor: colors.actionSoft,
  },
});
