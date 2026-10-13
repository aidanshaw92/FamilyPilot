import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, radius, spacing } from '@/src/design-system/tokens';

/**
 * What is narrowing the list, one chip each, and the way to take each off on its own. A removed chip removes only itself; Clear all
 * clears the search, the group, the filters and the distance. Both are targets of at least 44 points.
 */
export function ActiveFilters({ chips, onRemove, onClearAll }: { chips: { id: string; label: string }[]; onRemove: (id: string) => void; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <View style={styles.wrap} testID="explore-active-filters">
      {chips.map((chip) => (
        <Pressable
          key={chip.id}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${chip.label}`}
          onPress={() => onRemove(chip.id)}
          style={styles.chip}
          testID={`explore-active-${chip.id}`}
        >
          <Text style={styles.chipText} numberOfLines={1}>{chip.label}</Text>
          <Ionicons name="close" size={16} color={colors.text.inverse} />
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Clear all filters" onPress={onClearAll} style={styles.clear} testID="explore-clear-all">
        <Text variant="link">Clear all</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, paddingLeft: spacing.lg, paddingRight: spacing.md, borderRadius: radius.full, backgroundColor: colors.action, maxWidth: '100%' },
  chipText: { color: colors.text.inverse, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 18, flexShrink: 1 },
  clear: { minHeight: MIN_TARGET, paddingHorizontal: spacing.sm, justifyContent: 'center' },
});
