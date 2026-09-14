import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { VenueDetail } from '@/src/types';

interface Fact {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

/**
 * The practical facts a parent scans for, as compact chips rather than a specification
 * table. Only confirmed facts appear: an absent chip means "not reviewed", which the
 * unreviewed note below the row spells out, so nothing is ever implied by omission.
 */
export function FamilyFactRow({ venue }: { venue: VenueDetail }) {
  const facts = venue.trustedFacts;
  const chips: Fact[] = [];

  if (facts?.environment === 'indoor') chips.push({ key: 'indoor', icon: 'home-outline', label: 'Indoor' });
  if (facts?.environment === 'outdoor') chips.push({ key: 'outdoor', icon: 'leaf-outline', label: 'Outdoor' });
  if (facts?.environment === 'mixed') {
    chips.push({ key: 'mixed', icon: 'partly-sunny-outline', label: 'Indoor & outdoor' });
  }
  if (facts?.freeParking === 'yes') {
    chips.push({ key: 'freeParking', icon: 'car-outline', label: 'Free parking' });
  } else if (facts?.parking === 'yes') {
    chips.push({ key: 'parking', icon: 'car-outline', label: 'Parking on site' });
  }
  if (facts?.babyChanging === 'yes') {
    chips.push({ key: 'babyChanging', icon: 'happy-outline', label: 'Baby changing' });
  }
  if (facts?.pushchairSuitability === 'excellent' || facts?.pushchairSuitability === 'good') {
    chips.push({ key: 'pushchair', icon: 'accessibility-outline', label: 'Buggy friendly' });
  }
  if (facts?.toilets === 'yes') chips.push({ key: 'toilets', icon: 'water-outline', label: 'Toilets' });
  if (venue.facilities?.includes('cafe')) {
    chips.push({ key: 'cafe', icon: 'cafe-outline', label: 'Food on site' });
  }
  if (venue.bestAges) {
    chips.push({ key: 'ages', icon: 'people-outline', label: `Ages ${venue.bestAges}` });
  }
  if (venue.visitDurationMinutes) {
    const hours = venue.visitDurationMinutes / 60;
    chips.push({
      key: 'duration',
      icon: 'time-outline',
      label: hours >= 1 ? `~${Number.isInteger(hours) ? hours : hours.toFixed(1)}h visit` : `~${venue.visitDurationMinutes} min visit`,
    });
  }

  if (chips.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="help-circle-outline" size={18} color={colors.text.tertiary} />
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.emptyText}>
          We have not confirmed the family facilities here yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <View key={chip.key} style={styles.chip}>
          <Ionicons name={chip.icon} size={15} color={colors.text.primary} />
          <Text variant="bodySmall" color={colors.text.primary} style={styles.chipLabel}>
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: {
    fontFamily: 'Inter_500Medium',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    flex: 1,
  },
});
