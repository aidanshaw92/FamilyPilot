import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { OpeningHoursSchedule, WeatherInfo } from '@/src/types';
import { describeWeatherToday } from '@/src/utils/day-conditions';
import { describeOpeningToday, OpeningTodayState, weeklyHoursLines } from '@/src/utils/opening-today';

/**
 * "Will it work TODAY?": the useful current state first ("Open until 5pm", "Closed today · opens Wed 10am"), the
 * detailed week a tap away. Worked out from the stored schedule and the clock, so it is true at the moment you open
 * the page whatever time the venue was last fetched. When there is no schedule it says so once and offers nothing to
 * expand, rather than printing a "Not confirmed" row.
 */
const TINT: Record<OpeningTodayState, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  open_now: { icon: 'time-outline', color: colors.secondary[500] },
  open_all_day: { icon: 'time-outline', color: colors.secondary[500] },
  closing_soon: { icon: 'time-outline', color: colors.warning[600] },
  opens_later: { icon: 'time-outline', color: colors.secondary[500] },
  closed_for_today: { icon: 'moon-outline', color: colors.warning[600] },
  closed_today: { icon: 'close-circle-outline', color: colors.error[600] },
  never_open: { icon: 'close-circle-outline', color: colors.error[600] },
  unknown: { icon: 'help-circle-outline', color: colors.text.tertiary },
};

export function TodayCard({
  hours,
  now,
  weather,
  environment,
  sourceNote,
}: {
  hours?: OpeningHoursSchedule;
  /** Said when the venue's own hours and the provider's disagree: which was used and what the other said. */
  sourceNote?: string | null;
  now?: Date;
  /** Today's forecast, shown as a condition of the day. Optional and late-arriving: it is never part of Family Fit. */
  weather?: WeatherInfo | null;
  environment?: 'indoor' | 'outdoor' | 'mixed' | 'unknown';
}) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => describeOpeningToday(hours, now ?? new Date()), [hours, now]);
  const week = useMemo(() => weeklyHoursLines(hours), [hours]);
  const tint = TINT[today.state];
  const conditions = describeWeatherToday(weather, environment);

  return (
    <View style={styles.card} testID="today-card">
      <View style={styles.head}>
        <Ionicons name={tint.icon} size={20} color={tint.color} />
        <View style={styles.headText}>
          <Text variant="eyebrow">TODAY</Text>
          <Text variant="body" style={styles.state} testID="today-state">
            {today.label}
          </Text>
        </View>
        {week.length > 0 ? (
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? 'Hide opening hours for the week' : 'Show opening hours for the week'}
            hitSlop={8}
            style={styles.toggle}
          >
            <Text variant="link">{open ? 'Hide week' : 'See week'}</Text>
          </Pressable>
        ) : null}
      </View>
      {conditions ? (
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.conditions} testID="today-conditions">
          {conditions}
        </Text>
      ) : null}
      {sourceNote ? (
        <Text variant="bodySmall" color={colors.warning[600]} style={styles.conditions} testID="today-source-note">
          {sourceNote}
        </Text>
      ) : null}
      {open && week.length > 0 ? (
        <View style={styles.week} testID="today-week">
          {week.map((line) => (
            <Text key={line} variant="bodySmall" color={colors.text.secondary}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  state: { fontFamily: 'Inter_600SemiBold', color: colors.ink },
  conditions: { marginTop: spacing.sm },
  toggle: { minHeight: 44, justifyContent: 'center' },
  week: { marginTop: spacing.md, gap: 6, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
});
