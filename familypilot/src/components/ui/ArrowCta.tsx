import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { ArrowGlyph } from './icons';
import { Text } from './Text';

/**
 * The approved frames' one emphasised action with an arrow disc: Home's "See more" (node 8:18),
 * Venue Detail's "Create a plan" (72:2), Create a plan's "Build my plan" (76:65) and the Plan's
 * "Invite family & friends" (71:32) are all this shape: a deep-green pill 58 tall, the label centred
 * in SemiBold 16, a 46 white disc inset 6 on the right with the frame's own 14pt green arrow.
 *
 * `size="compact"` is the Explore result card's CTA, to the approved Explore reference: 44 tall (the
 * reference draws 42; 44 keeps the touch target), a 32 mint disc, the label SemiBold 14. Explore's
 * cards use `disc="mint"`.
 */
const SIZES = {
  default: { height: 58, disc: 46, inset: 6, right: 6, font: 16, line: 20, arrow: 14 },
  // Approved Explore frame 294:133: the pill 93px / 2.17 = 42.8 (44 keeps the touch target), the disc
  // 77px = 35.5 inset 6.4 from the right, the label SemiBold 28.3px = 13 set from the left edge with
  // its own trailing arrow ("View family details →") and 20 of padding.
  compact: { height: 44, disc: 36, inset: 4, right: 6, font: 13, line: 17, arrow: 13 },
} as const;

/** Compact's label space is the pill minus these: the left pad and the disc with its insets. */
export const COMPACT_LABEL_INSET = 20 + SIZES.compact.disc + SIZES.compact.right + 8;

interface ArrowCtaProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The arrow disc: white on a card or sheet, mint on Explore's result cards. */
  disc?: 'white' | 'mint';
  size?: keyof typeof SIZES;
  testID?: string;
  accessibilityLabel?: string;
  /**
   * Draws the pill without being a control. For a CTA that sits inside a card which is itself the one
   * button: two buttons nested in each other cannot both be reached by assistive technology, so the
   * card carries the action and the CTA is its visible cue. It ignores the pointer, so a tap lands on
   * the card.
   */
  decorative?: boolean;
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
  decorative = false,
  style,
}: ArrowCtaProps) {
  const s = SIZES[size];
  const pillStyle = (pressed: boolean) => [
        styles.pill,
        {
          height: s.height,
          borderRadius: s.height / 2,
          paddingLeft: size === 'compact' ? 20 : s.disc + spacing.md,
          paddingRight: size === 'compact' ? s.disc + s.right + 8 : s.disc + spacing.md,
        },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ];
  const content = (
    <>
      <Text
        style={[
          styles.label,
          { fontSize: s.font, lineHeight: s.line },
          size === 'compact' && styles.labelStart,
        ]}
        numberOfLines={1}
      >
        {size === 'compact' ? `${label} →` : label}
      </Text>
      <View
        style={[
          styles.disc,
          { right: s.right, top: (s.height - s.disc) / 2, width: s.disc, height: s.disc, borderRadius: s.disc / 2 },
          disc === 'mint' && styles.discMint,
        ]}
      >
        <ArrowGlyph size={s.arrow} color={colors.action} />
      </View>
    </>
  );

  if (decorative) {
    return (
      <View
        testID={testID}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={pillStyle(false)}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => pillStyle(pressed)}
    >
      {content}
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
  labelStart: {
    textAlign: 'left',
    alignSelf: 'stretch',
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
