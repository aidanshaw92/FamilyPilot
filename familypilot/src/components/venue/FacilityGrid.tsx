import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FacilityType } from '@/src/types';

const FACILITY_CONFIG: Record<
  FacilityType,
  { icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  cafe: { icon: 'cafe-outline', label: 'Café' },
  toilets: { icon: 'water-outline', label: 'Toilets' },
  baby_changing: { icon: 'happy-outline', label: 'Baby changing' },
  playground: { icon: 'game-controller-outline', label: 'Playground' },
  parking: { icon: 'car-outline', label: 'Parking' },
  shade: { icon: 'partly-sunny-outline', label: 'Shade' },
  splash_pad: { icon: 'water-outline', label: 'Splash pad' },
  picnic: { icon: 'restaurant-outline', label: 'Picnic' },
  dog_friendly: { icon: 'paw-outline', label: 'Dog friendly' },
  cycling: { icon: 'bicycle-outline', label: 'Cycling' },
  highchairs: { icon: 'restaurant-outline', label: 'Highchairs' },
  swimming: { icon: 'water-outline', label: 'Swimming' },
  soft_play: { icon: 'game-controller-outline', label: 'Soft play' },
  pushchair_friendly: { icon: 'accessibility-outline', label: 'Pushchair OK' },
};

interface FacilityGridProps {
  facilities?: FacilityType[];
}

export function FacilityGrid({ facilities }: FacilityGridProps) {
  const list = facilities ?? [];

  if (list.length === 0) {
    return (
      <Text variant="caption" color={colors.text.secondary}>
        Not confirmed — family facilities not yet reviewed
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
      {list.map((facility) => {
        const config = FACILITY_CONFIG[facility];
        return (
          <View key={facility} style={styles.item}>
            <View style={styles.iconContainer}>
              <Ionicons name={config.icon} size={22} color={colors.primary[500]} />
            </View>
            <Text variant="caption" style={styles.label}>
              {config.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  item: {
    width: '22%',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    textAlign: 'center',
  },
});
