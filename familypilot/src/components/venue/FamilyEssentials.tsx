import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { VenueDetail } from '@/src/types';
import { familyEssentialRows } from '@/src/utils/family-essentials';

/**
 * Frame 02's "Family essentials" (nodes 72:7 to 72:24): label left in Medium 14.5 ink, value right in
 * Regular 14, hairline between rows, 48 tall. A confirmed value reads in secondary ink; the honest
 * "Not confirmed" reads one step quieter, which is how the frame draws it.
 */
export function FamilyEssentials({ venue }: { venue: VenueDetail }) {
  const rows = familyEssentialRows(venue);
  return (
    <View testID="family-essentials">
      {rows.map((item, index) => (
        <View key={item.key} style={[styles.row, index === rows.length - 1 && styles.last]}>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={[styles.value, item.confirmed ? styles.confirmed : styles.unknown]} numberOfLines={3}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  last: { borderBottomWidth: 0 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 14.5, lineHeight: 18, color: colors.ink },
  value: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 18, textAlign: 'right' },
  confirmed: { color: colors.text.secondary },
  unknown: { color: colors.text.tertiary },
});
