import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { CarEquipment } from '@/src/types';

import { Text } from '@/src/components/ui/Text';

interface BootVisualisationProps {
  equipment: CarEquipment[];
  capacityLitres: number;
  usedLitres: number;
}

export function BootVisualisation({ equipment, capacityLitres, usedLitres }: BootVisualisationProps) {
  const usedPercent = Math.min((usedLitres / capacityLitres) * 100, 100);

  return (
    <View style={styles.container}>
      <Text variant="heading3" style={styles.title}>
        Boot layout (estimate)
      </Text>
      <Text variant="caption" color={colors.text.secondary} style={styles.subtitle}>
        Capacity is approximate — verify with your vehicle manual.
      </Text>
      <View style={styles.boot}>
        <View style={[styles.usedArea, { width: `${usedPercent}%` }]}>
          {equipment.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.itemBlock,
                {
                  backgroundColor: item.fits ? colors.secondary[100] : colors.error[100],
                  flex: item.volumeLitres,
                  marginLeft: index > 0 ? 2 : 0,
                },
              ]}
            >
              <Text variant="caption" numberOfLines={2} style={styles.itemLabel}>
                {item.name.split(' ')[0]}
              </Text>
            </View>
          ))}
        </View>
        {usedPercent < 100 ? (
          <View style={[styles.spareArea, { flex: 100 - usedPercent }]}>
            <Text variant="caption" color={colors.text.secondary}>
              Spare
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        {equipment.map((item) => (
          <View key={item.id} style={styles.legendRow}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: item.fits ? colors.secondary[500] : colors.error[500] },
              ]}
            />
            <Text variant="caption" color={colors.text.secondary} style={styles.legendText}>
              {item.name} ({item.volumeLitres}L)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing['2xl'],
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  boot: {
    flexDirection: 'row',
    height: 80,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  usedArea: {
    flexDirection: 'row',
    height: '100%',
  },
  itemBlock: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xs,
    minWidth: 24,
  },
  itemLabel: {
    textAlign: 'center',
    fontSize: 9,
    color: colors.text.primary,
  },
  spareArea: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.borderLight,
  },
  legend: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    flex: 1,
  },
});
