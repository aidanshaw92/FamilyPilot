import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { PlanStopView } from '@/src/services/planning/plan-view-model';

/**
 * One stop in the day, expanded or collapsed.
 *
 * The approved design opens the first stop and leaves the rest closed, so the day reads as a shape
 * before it reads as a schedule. A collapsed stop still shows its name and its times, because those
 * are what a parent scans for; what expanding adds is the detail underneath.
 *
 * A row the planner could not confirm is marked here rather than left off. The planner says what
 * nobody has checked, and dropping that on the way to the screen would turn an unconfirmed opening
 * into an apparently confirmed one.
 */

export interface PlanStopCardProps {
  stop: PlanStopView;
  expanded: boolean;
  onToggle: () => void;
  /** The period label, shown only on the first stop of each period. */
  periodLabel?: string;
}

export function PlanStopCard({ stop, expanded, onToggle, periodLabel }: PlanStopCardProps) {
  return (
    <View>
      {periodLabel ? (
        <Text variant="eyebrow" style={styles.period}>
          {periodLabel.toUpperCase()}
        </Text>
      ) : null}

      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${stop.name}, ${stop.timeRange}`}
        style={[styles.card, expanded && styles.cardExpanded]}
        testID={`plan-stop-${stop.index}`}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text variant="caption" color={colors.text.secondary}>
              {stop.timeRange}
            </Text>
            <Text variant="heading3">{stop.name}</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.text.tertiary}
          />
        </View>

        {expanded ? (
          <View style={styles.rows}>
            {stop.rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text variant="bodySmall" color={colors.text.secondary} style={styles.rowLabel}>
                  {row.label}
                </Text>
                <Text
                  variant="bodySmall"
                  color={row.unconfirmed ? colors.warning[600] : colors.text.primary}
                  style={styles.rowValue}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  period: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardExpanded: { borderColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 2 },
  rows: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowLabel: { width: 96 },
  rowValue: { flex: 1 },
});
