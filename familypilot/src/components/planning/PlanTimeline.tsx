import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { planClock } from '@/src/services/planning/plan-view-model';
import { Provenance, TimelineEdit, TimelineRow } from '@/src/services/planning/plan-timeline';

/**
 * The day, top to bottom: one row per step along a rail, the time on the left, the title and its lines on the right,
 * and on each line a small tag saying where the claim came from. Rows the parent can change end in a link
 * ("Change arrival", "Change how long", "Change lunch", "Leave earlier") that the screen turns into a real re-plan.
 *
 * A tight margin draws its row in the warning tone, as the advice above does, so the two never disagree.
 */
const PROVENANCE_LABEL: Record<Provenance, string> = {
  confirmed: 'confirmed',
  estimated: 'estimated',
  inferred: 'suggested',
  reported: 'reported',
  unknown: 'unknown',
};

const EDIT_LABEL: Record<TimelineEdit, string> = {
  arrival: 'Change arrival',
  visit: 'Change how long',
  lunch: 'Change lunch',
  'leave-earlier': 'Leave earlier',
};

export function PlanTimeline({ rows, onEdit }: { rows: TimelineRow[]; onEdit?: (edit: TimelineEdit, row: TimelineRow) => void }) {
  if (!rows.length) return null;
  return (
    <View style={styles.wrap} testID="plan-timeline">
      <View style={styles.legend}>
        <Text variant="caption" color={colors.text.tertiary}>
          Times are from your routines, the place’s hours and the journeys. Each line says whether it is confirmed, estimated, suggested by
          FamilyPilot, reported by you or the mappers, or not yet known.
        </Text>
      </View>
      {rows.map((row, index) => {
        const last = index === rows.length - 1;
        const dot = row.tone === 'tight' ? colors.warning[600] : row.tone === 'warn' ? colors.warning[600] : row.kind === 'home' || row.kind === 'leave-home' ? colors.ink : colors.action;
        return (
          <View key={row.id} style={styles.row} testID={`plan-timeline-${row.kind}`}>
            <View style={styles.timeColumn}>
              <Text style={styles.time}>{planClock(row.time)}</Text>
              {row.until !== undefined && row.until > row.time ? <Text style={styles.until}>to {planClock(row.until)}</Text> : null}
            </View>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dot }]} />
              {last ? null : <View style={styles.line} />}
            </View>
            <View style={[styles.body, row.tone === 'tight' || row.tone === 'warn' ? styles.bodyWarn : null, last ? styles.bodyLast : null]}>
              <Text style={[styles.title, row.tone === 'tight' || row.tone === 'warn' ? styles.titleWarn : null]}>{row.title}</Text>
              {row.lines.map((line, i) => (
                <View key={`${row.id}-${i}`} style={styles.lineRow}>
                  <Text variant="bodySmall" color={row.tone === 'tight' && i > 0 ? colors.warning[600] : colors.text.secondary} style={styles.lineText}>
                    {line.text}
                  </Text>
                  {line.provenance ? (
                    <View style={[styles.tag, line.provenance === 'confirmed' ? styles.tagConfirmed : line.provenance === 'unknown' ? styles.tagUnknown : null]} testID={`plan-provenance-${line.provenance}`}>
                      <Text style={[styles.tagText, line.provenance === 'confirmed' ? styles.tagTextConfirmed : null]}>{PROVENANCE_LABEL[line.provenance]}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
              {row.edit && onEdit ? (
                <Pressable
                  onPress={() => onEdit(row.edit!, row)}
                  accessibilityRole="button"
                  accessibilityLabel={`${EDIT_LABEL[row.edit]}: ${row.title}`}
                  hitSlop={8}
                  style={styles.edit}
                  testID={`plan-timeline-edit-${row.edit}`}
                >
                  <Ionicons name={row.edit === 'leave-earlier' ? 'time-outline' : 'create-outline'} size={15} color={colors.action} />
                  <Text style={styles.editText}>{EDIT_LABEL[row.edit]}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  legend: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  timeColumn: { width: 56, paddingTop: 2, alignItems: 'flex-end', paddingRight: spacing.sm },
  time: { fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 18, color: colors.ink },
  until: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 14, color: colors.text.tertiary },
  rail: { width: 18, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5, borderWidth: 2, borderColor: colors.surface },
  line: { flex: 1, width: 2, backgroundColor: colors.borderLight, marginTop: 2 },
  body: { flex: 1, paddingLeft: spacing.sm, paddingBottom: spacing.lg, gap: 4 },
  bodyLast: { paddingBottom: 0 },
  bodyWarn: {},
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 21, color: colors.ink },
  titleWarn: { color: colors.warning[600] },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' },
  lineText: { flexShrink: 1, flexGrow: 1, flexBasis: 160 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight, marginTop: 2 },
  tagConfirmed: { backgroundColor: colors.actionSoft, borderColor: colors.actionSoft },
  tagUnknown: { borderStyle: 'dashed' },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 13, color: colors.text.secondary },
  tagTextConfirmed: { color: colors.action },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, alignSelf: 'flex-start' },
  editText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 17, color: colors.action },
});
