import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, radius, spacing } from '@/src/design-system/tokens';

/**
 * Where the parent is looking from, and the way to change it. In Nearby it is the point distances are measured from; in Search all
 * it still is (every card says how far it is from there), and the row also says how many places FamilyPilot knows.
 */
export function WhereRow({ title, detail, onChange }: { title: string; detail: string; onChange: () => void }) {
  return (
    <View style={styles.row} testID="explore-where">
      <View style={styles.pin} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="location-outline" size={18} color={colors.action} />
      </View>
      <View style={styles.text}>
        <Text variant="bodySmall" style={styles.title} numberOfLines={1} testID="explore-where-title">{title}</Text>
        <Text variant="caption" color={colors.text.secondary} numberOfLines={2} testID="explore-where-detail">{detail}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change where you are looking from. Now: ${title}`}
        onPress={onChange}
        style={styles.change}
        testID="explore-where-change"
      >
        <Text variant="link">Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: 4, minHeight: 56 },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Inter_600SemiBold' },
  change: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
});
