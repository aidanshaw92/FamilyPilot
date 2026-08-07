import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FacilityStatus, RestaurantFeatures } from '@/src/types';

const FEATURE_LABELS: { key: keyof RestaurantFeatures; label: string }[] = [
  { key: 'kidsMenu', label: 'Kids menu' },
  { key: 'highChairs', label: 'High chairs' },
  { key: 'babyChanging', label: 'Baby changing' },
  { key: 'pushchairSpace', label: 'Pushchair space' },
  { key: 'stepFreeAccess', label: 'Step-free access' },
  { key: 'accessibleToilet', label: 'Accessible toilet' },
  { key: 'outdoorSeating', label: 'Outdoor seating' },
  { key: 'playArea', label: 'Play area' },
  { key: 'activityPacks', label: 'Activity packs' },
  { key: 'parking', label: 'Parking' },
];

function statusLabel(status: FacilityStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'not_available':
      return 'Not available';
    default:
      return 'Not confirmed';
  }
}

function statusColor(status: FacilityStatus) {
  switch (status) {
    case 'confirmed':
      return colors.secondary[600];
    case 'not_available':
      return colors.text.tertiary;
    default:
      return colors.text.secondary;
  }
}

interface RestaurantFacilitiesProps {
  features: RestaurantFeatures;
}

export function RestaurantFacilities({ features }: RestaurantFacilitiesProps) {
  const rows = FEATURE_LABELS.map(({ key, label }) => ({
    label,
    status: features[key] as FacilityStatus,
  })).filter((row) => row.status !== undefined);

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text variant="bodySmall" style={styles.label}>
            {row.label}
          </Text>
          <Text variant="bodySmall" color={statusColor(row.status)} style={styles.value}>
            {statusLabel(row.status)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.md,
    minHeight: 44,
  },
  label: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
  },
  value: {
    fontFamily: 'Inter_500Medium',
  },
});
