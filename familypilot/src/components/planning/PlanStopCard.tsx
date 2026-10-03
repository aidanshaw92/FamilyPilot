import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, spacing } from '@/src/design-system/tokens';
import { PlanStopView } from '@/src/services/planning/plan-view-model';

/**
 * One stop in the day, expanded or collapsed, drawn as frame 03's stop card (nodes 73:2, 73:19): a
 * 62 thumbnail, "Stop 1" above the arrival time above the name, a chevron, and when expanded a
 * two-column list of small uppercase labels and values.
 *
 * The approved design opens the first stop and leaves the rest closed, so the day reads as a shape
 * before it reads as a schedule. A collapsed stop still shows its name and its time, because those
 * are what a parent scans for; what expanding adds is the detail underneath.
 *
 * A row the planner could not confirm is marked here rather than left off. The planner says what
 * nobody has checked, and dropping that on the way to the screen would turn an unconfirmed opening
 * into an apparently confirmed one. The time is not underlined: the frame's "tap to edit" is not a
 * thing this product does yet, and an underline would promise it.
 */

export interface PlanStopCardProps {
  stop: PlanStopView;
  expanded: boolean;
  onToggle: () => void;
}

export function PlanStopCard({ stop, expanded, onToggle }: PlanStopCardProps) {
  const arrive = stop.timeRange.split('–')[0];
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`Stop ${stop.index + 1}, ${stop.name}, ${stop.timeRange}`}
      style={[styles.card, expanded && styles.cardExpanded]}
      testID={`plan-stop-${stop.index}`}
    >
      <View style={styles.headerRow}>
        <VenueImage uri={stop.imageUrl} category={stop.category} alt={stop.name} style={styles.thumbnail} borderRadius={16} />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Stop {stop.index + 1}</Text>
          <Text style={styles.time}>{arrive}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {stop.name}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
      </View>

      {expanded ? (
        <View style={styles.rows}>
          {stop.rows.map((row) => (
            <View key={row.label} style={styles.row}>
              {/* Uppercased by style, not by string, so the text itself stays "Arrive" for readers
                  and for the verifier that looks for it. */}
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.unconfirmed && styles.rowValueWarn]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Node 73:2: white, hairline, radius 24, 15 inside; 16 between cards.
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 15,
    marginBottom: spacing.lg,
  },
  cardExpanded: { borderColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumbnail: { width: 62, height: 62 },
  headerText: { flex: 1, gap: 2 },
  // Node 73:4: Medium 11.5, +0.345 tracking, tertiary ink.
  eyebrow: { fontFamily: 'Inter_500Medium', fontSize: 11.5, lineHeight: 14, letterSpacing: 0.345, color: colors.text.tertiary },
  // Node 73:5: SemiBold 13 ink.
  time: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16, color: colors.ink },
  // Node 73:6: SemiBold 17, -0.255 tracking.
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 21, letterSpacing: -0.255, color: colors.ink },
  rows: { marginTop: spacing.lg, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  // Nodes 73:9 to 73:18: labels in a 136 column, SemiBold 10.5 +0.525 tertiary; values Regular 14.5/21 ink.
  rowLabel: { width: 136, paddingTop: 4, fontFamily: 'Inter_600SemiBold', fontSize: 10.5, lineHeight: 13, letterSpacing: 0.525, color: colors.text.tertiary, textTransform: 'uppercase' },
  rowValue: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14.5, lineHeight: 21, color: colors.ink },
  rowValueWarn: { color: colors.warning[600] },
});
