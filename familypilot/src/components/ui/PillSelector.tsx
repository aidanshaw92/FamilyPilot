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
          color={active ? colors.text.inverse : colors.text.secondary}
          numberOfLines={1}
          style={active ? styles.labelActive : styles.label}
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

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.screenPadding,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    height: 42,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillFlex: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  pillIdle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary[500],
  },
  label: {
    fontFamily: 'Inter_500Medium',
  },
  labelActive: {
    fontFamily: 'Inter_600SemiBold',
  },
  pressed: {
    opacity: 0.85,
  },
});
