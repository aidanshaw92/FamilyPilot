import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FadeInView } from '@/src/components/ui/FadeInView';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Card, EmptyState, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useTrips } from '@/src/hooks/use-queries';

export default function TripsScreen() {
  const { data: trips, isLoading } = useTrips();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Trips</Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Your planned days out
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isLoading && (!trips || trips.length === 0) ? (
          <EmptyState
            icon="calendar-outline"
            title="No trips yet"
            message="Plan a day out from the home screen and it will appear here."
          />
        ) : (
          trips?.map((trip, tripIndex) => (
            <FadeInView key={trip.id} delay={tripIndex * 80}>
              <Card style={styles.tripCard}>
                <Text variant="heading2">{trip.title}</Text>
                <Text variant="bodySmall" style={styles.date}>
                  {trip.date}
                </Text>

                <View style={styles.timeline}>
                  {trip.stops.map((stop, index) => (
                    <View key={stop.id} style={styles.stopRow}>
                      <View style={styles.timelineLeft}>
                        <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                        {index < trip.stops.length - 1 ? (
                          <View style={styles.timelineLine} />
                        ) : null}
                      </View>
                      <View style={styles.stopContent}>
                        <Text variant="caption" color={colors.primary[500]}>
                          {stop.time}
                        </Text>
                        <View style={styles.stopDetail}>
                          <Image
                            source={{ uri: stop.imageUrl }}
                            style={styles.stopImage}
                            contentFit="cover"
                            transition={200}
                          />
                          <View style={styles.stopText}>
                            <Text variant="heading3">{stop.title}</Text>
                            {stop.subtitle ? (
                              <Text variant="bodySmall">{stop.subtitle}</Text>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeInView>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  content: {
    padding: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  tripCard: {
    marginBottom: spacing['2xl'],
  },
  date: {
    marginTop: spacing.xs,
    marginBottom: spacing['2xl'],
  },
  timeline: {
    marginTop: spacing.sm,
  },
  stopRow: {
    flexDirection: 'row',
    minHeight: 80,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: colors.primary[500],
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  stopContent: {
    flex: 1,
    paddingBottom: spacing['2xl'],
  },
  stopDetail: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  stopImage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  stopText: {
    flex: 1,
    justifyContent: 'center',
  },
});
