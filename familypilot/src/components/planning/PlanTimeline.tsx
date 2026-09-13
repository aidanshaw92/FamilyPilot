import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

export interface TimelineEvent {
  time: string;
  label: string;
  detail?: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** A vertical dot-and-line itinerary, the way a day plan actually gets read: what happens,
 * in order, and when. Replaces a flat stack of paragraphs with the same facts. */
export function PlanTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <View style={styles.wrap}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        return (
          <View key={`${event.label}-${index}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={styles.dot}>
                <Ionicons name={event.icon} size={14} color={colors.text.inverse} />
              </View>
              {!isLast ? <View style={styles.line} /> : null}
            </View>
            <View style={[styles.content, isLast ? undefined : styles.contentSpacing]}>
              <Text variant="label" color={colors.primary[500]}>
                {event.time}
              </Text>
              <Text variant="heading3" style={styles.eventLabel}>
                {event.label}
              </Text>
              {event.detail ? (
                <Text variant="bodySmall" color={colors.text.secondary} style={styles.eventDetail}>
                  {event.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
  },
  rail: {
    width: 32,
    alignItems: 'center',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 24,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  content: {
    flex: 1,
    paddingLeft: spacing.md,
  },
  contentSpacing: {
    paddingBottom: spacing.lg,
  },
  eventLabel: {
    marginTop: 2,
  },
  eventDetail: {
    marginTop: 2,
    lineHeight: 18,
  },
});
