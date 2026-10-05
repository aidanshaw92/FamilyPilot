import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';

import { spacing } from '@/src/design-system/tokens';

import { Chip, CHIP_GAP, HOME_CHIP, railTint } from './Chip';

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
  /** `home` is the approved Home rail's chip (frame 229:133); `default` is the shared 44pt pill. */
  size?: 'default' | 'home';
  accessibilityLabel?: string;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

/**
 * A single-choice rail of `Chip`s — the approved Home frame's category pills. The chips are the
 * shared primitive; this only arranges them, so the rail and every other chip in the app cannot
 * drift apart again. Deliberately overflows the screen so it reads as scrollable rather than a
 * complete list.
 */
export function PillSelector({
  options,
  value,
  onChange,
  scroll = true,
  size = 'default',
  accessibilityLabel,
  style,
  contentStyle,
}: PillSelectorProps) {
  // A scrolling rail tints its idle chips by position (the identity's mint, blush, lilac after the
  // leading chip); a fixed segmented row stays plain. The tint says nothing about the option.
  const pills = options.map((option, index) => (
    <Chip
      key={option.id}
      label={option.label}
      active={option.id === value}
      appearance="plain"
      size={size}
      tint={scroll ? railTint(index - 1) : 'none'}
      onPress={() => onChange(option.id)}
      style={scroll ? undefined : styles.pillFlex}
    />
  ));

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
      contentContainerStyle={[styles.scrollContent, size === 'home' && { gap: HOME_CHIP.gap }, contentStyle]}
    >
      {pills}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: CHIP_GAP,
    paddingRight: spacing.screenPadding,
  },
  row: {
    flexDirection: 'row',
    gap: CHIP_GAP,
  },
  pillFlex: {
    flex: 1,
  },
});
