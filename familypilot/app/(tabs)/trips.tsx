import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { TripStopCard } from '@/src/components/shared/TripStopCard';
import { DeferredPilotGate } from '@/src/components/shared/DeferredPilotGate';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, EmptyState, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useTrips } from '@/src/hooks/use-queries';

export default function TripsScreen() {
  return (
    <DeferredPilotGate feature="trips_tab" title="Trips coming later">
      <TripsScreenContent />
    </DeferredPilotGate>
  );
}

function TripsScreenContent() {
  const router = useRouter();
  const { data: trips, isLoading } = useTrips();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Trips</Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          Your planned days out
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isLoading && (!trips || trips.length === 0) ? (
          <EmptyState
            icon="calendar-outline"
            title="No trips yet"
            message="Plan a day out from the home screen and it will appear here."
            actionLabel="Plan something"
            onAction={() => router.push('/(tabs)' as never)}
          />
        ) : (
          trips?.map((trip, tripIndex) => (
            <FadeInView key={trip.id} delay={tripIndex * 80}>
              <Card style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <View>
                    <View style={styles.dateBadge}>
                      <Text variant="caption" color={colors.primary[600]}>
                        {trip.date}
                      </Text>
                    </View>
                    <Text variant="heading2" style={styles.tripTitle}>
                      {trip.title}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryRow}>
                  {trip.totalDriveMinutes ? (
                    <SummaryPill icon="car-outline" label={`${trip.totalDriveMinutes} min drive`} />
                  ) : null}
                  {trip.estimatedCost ? (
                    <SummaryPill icon="wallet-outline" label={`Est. ${trip.estimatedCost}`} />
                  ) : null}
                  {trip.totalDurationHours ? (
                    <SummaryPill icon="time-outline" label={`~${trip.totalDurationHours}h total`} />
                  ) : null}
                </View>

                <View style={styles.timeline}>
                  {trip.stops.map((stop, index) => (
                    <TripStopCard
                      key={stop.id}
                      stop={stop}
                      isActive={index === 0}
                      isLast={index === trip.stops.length - 1}
                    />
                  ))}
                </View>

                <View style={styles.actions}>
                  <Button label="Start trip" style={styles.primaryAction} />
                  <Button label="Edit" variant="outline" style={styles.secondaryAction} />
                </View>
              </Card>
            </FadeInView>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function SummaryPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.summaryPill}>
      <Text variant="caption" color={colors.text.secondary}>
        {label}
      </Text>
    </View>
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
    paddingBottom: spacing['3xl'],
  },
  tripCard: {
    marginBottom: spacing['2xl'],
  },
  tripHeader: {
    marginBottom: spacing.lg,
  },
  dateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  tripTitle: {
    marginTop: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  summaryPill: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  timeline: {
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryAction: {
    flex: 1,
  },
  secondaryAction: {
    minWidth: 88,
  },
});
