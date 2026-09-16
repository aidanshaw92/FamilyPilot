import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

export interface PillOption {
  id: string;
  label: string;
}

interface PillSelectorProps {
  options: PillOption[];
  value: string;
  onChange: (id: string) => void;
  /** Horizontal scroll (a category rail) or a fixed row that fits the width (segmented tabs). */
  scroll?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

/** The reference's continent selector: a rail of pills where the active one goes near-black.
 * Deliberately overflows the screen so it reads as scrollable rather than a complete list. */
export function PillSelector({
  options,
  value,
  onChange,
  scroll = true,
  accessibilityLabel,
  style,
  contentStyle,
}: PillSelectorProps) {
  const pills = options.map((option) => {
    const active = option.id === value;
    return (
      <Pressable
        key={option.id}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={option.label}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(option.id);
        }}
        style={({ pressed }) => [
          styles.pill,
          active ? styles.pillActive : styles.pillIdle,
          !scroll && styles.pillFlex,
          pressed && styles.pressed,
        ]}
      >
        <Text
          variant="bodySmall"
          color={active ? colors.text.inverse : FRAME_INK}
          numberOfLines={1}
          style={styles.label}
        >
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (!scroll) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={[styles.row, style]}>
        {pills}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      style={style}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
    >
      {pills}
    </ScrollView>
  );
}

/**
 * From the approved frame "01 — Home" (node "Category pills"): 44pt chips, 20 of padding either
 * side, 10 between, and an 18pt line box. Compact and secondary — the deck is what carries the
 * screen, not the rail.
 */
const PILL_HEIGHT = 44;
const PILL_PADDING_X = 20;
const PILL_GAP = 10;
const PILL_FONT_SIZE = 14.5;
const PILL_LINE_HEIGHT = 18;
/** The near-black the frame uses for ink and for the selected chip. */
const FRAME_INK = '#141416';

const styles = StyleSheet.create({
  scrollContent: {
    gap: PILL_GAP,
    paddingRight: spacing.screenPadding,
  },
  row: {
    flexDirection: 'row',
    gap: PILL_GAP,
  },
  pill: {
    height: PILL_HEIGHT,
    paddingHorizontal: PILL_PADDING_X,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillFlex: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  pillIdle: {
    // The frame's idle chip is plain white with no outline: secondary, not a bordered control.
    backgroundColor: colors.surface,
  },
  pillActive: {
    backgroundColor: FRAME_INK,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: PILL_FONT_SIZE,
    lineHeight: PILL_LINE_HEIGHT,
  },
  pressed: {
    opacity: 0.85,
  },
});
