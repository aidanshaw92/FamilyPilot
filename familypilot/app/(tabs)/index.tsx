import { ScrollView, StyleSheet, View } from 'react-native';

import { ContinuePlanningCard, TodayHeroCard } from '@/src/components/home/TodayHeroCard';
import { QuickActionGrid } from '@/src/components/home/QuickActionGrid';
import { RecommendationCarousel } from '@/src/components/home/RecommendationCarousel';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer, ScreenHeader } from '@/src/components/shared/ScreenContainer';
import { ErrorState, SectionHeader, SkeletonDecisionCard, Text } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import {
  useFamilyProfile,
  useHomeRecommendations,
  useRecentVenues,
  useTrips,
  useWeather,
} from '@/src/hooks/use-queries';
import { mockVenues } from '@/src/data/mock-data';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const { data: profile } = useFamilyProfile();
  const { data: weather } = useWeather();
  const {
    data: recommendations,
    isLoading: recsLoading,
    isError: recsError,
    refetch,
  } = useHomeRecommendations();
  const { data: recentVenues } = useRecentVenues();
  const { data: trips } = useTrips();

  const parentName = profile?.parentName ?? 'there';
  const todayPick = recommendations?.[0]?.venues[0] ?? mockVenues[0];
  const activeTrip = trips?.[0];

  if (recsError) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={() => void refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        timeGreeting={getTimeGreeting()}
        name={parentName}
        weather={weather}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {recsLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonDecisionCard />
          </View>
        ) : (
          <TodayHeroCard venue={todayPick} weather={weather} />
        )}

        {activeTrip ? (
          <ContinuePlanningCard
            tripTitle={activeTrip.title}
            tripDate={activeTrip.date}
            nextStop={activeTrip.stops[0]?.title ?? 'Plan your day'}
          />
        ) : null}

        <View style={styles.section}>
          <Text variant="heading2" style={styles.sectionTitle}>
            What shall we do?
          </Text>
          <QuickActionGrid />
        </View>

        {recsLoading
          ? null
          : recommendations?.map((section, i) => (
              <RecommendationCarousel
                key={section.id}
                section={section}
                startIndex={i * 3}
              />
            ))}

        {recentVenues && recentVenues.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Recent places" subtitle="Pick up where you left off" />
            {recentVenues.map((venue, index) => (
              <DecisionCard key={venue.id} venue={venue} variant="list" index={index} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  section: {
    marginBottom: spacing['3xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  skeletonRow: {
    marginBottom: spacing['3xl'],
  },
});
