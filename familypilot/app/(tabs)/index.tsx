import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ContinuePlanningCard, TodayHeroCard } from '@/src/components/home/TodayHeroCard';
import { QuickActionGrid } from '@/src/components/home/QuickActionGrid';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer, ScreenHeader } from '@/src/components/shared/ScreenContainer';
import { EmptyState, ErrorState, SectionHeader, SkeletonDecisionCard } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { mockVenues } from '@/src/data/mock-data';
import {
  useEatNearby,
  useFamilyProfile,
  useHomeRecommendations,
  useTrips,
  useWeather,
} from '@/src/hooks/use-queries';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { data: profile } = useFamilyProfile();
  const { data: weather } = useWeather();
  const {
    data: recommendations,
    isLoading: recsLoading,
    isError: recsError,
    refetch,
  } = useHomeRecommendations();
  const { data: trips } = useTrips();

  const parentName = profile?.parentName ?? 'there';
  const todayPick = recommendations?.[0]?.venues[0] ?? mockVenues[0];
  const { data: eatNearby } = useEatNearby(todayPick?.id);
  const activeTrip = trips?.[0];

  const diningHint =
    eatNearby?.[0] && eatNearby[0].familyScore.score >= 75
      ? `Great family lunch ${eatNearby[0].driveMinutes} mins away`
      : undefined;

  const moreIdeasVenues = (recommendations ?? [])
    .flatMap((section) => section.venues)
    .filter((venue, index, all) => all.findIndex((v) => v.id === venue.id) === index)
    .filter((venue) => venue.id !== todayPick?.id)
    .slice(0, 5);

  if (recsError) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={() => void refetch()} />
      </ScreenContainer>
    );
  }

  if (!recsLoading && !todayPick) {
    return (
      <ScreenContainer>
        <ScreenHeader
          greeting={`${getTimeGreeting()}, ${parentName}`}
          location={profile?.homeLocation}
          weather={weather}
        />
        <EmptyState
          icon="compass-outline"
          title="No recommendations right now"
          message="We could not find suitable places for today. Try exploring nearby venues."
          actionLabel="Explore"
          onAction={() => router.push('/(tabs)/explore' as never)}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        greeting={`${getTimeGreeting()}, ${parentName}`}
        location={profile?.homeLocation}
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
          <TodayHeroCard venue={todayPick} diningHint={diningHint} />
        )}

        <View style={styles.section}>
          <QuickActionGrid />
        </View>

        {!recsLoading && moreIdeasVenues.length > 0 ? (
          <View style={styles.moreIdeasSection}>
            <SectionHeader
              title="More ideas"
              subtitle="Other places worth a look"
              actionLabel="See all"
              onAction={() => router.push('/(tabs)/explore' as never)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
            >
              {moreIdeasVenues.map((venue, index) => (
                <DecisionCard key={venue.id} venue={venue} variant="carousel" index={index} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {activeTrip ? (
          <ContinuePlanningCard
            tripTitle={activeTrip.title}
            tripDate={activeTrip.date}
            nextStop={activeTrip.stops[0]?.title ?? 'Plan your day'}
          />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  section: {
    marginBottom: spacing.xl,
  },
  moreIdeasSection: {
    marginBottom: spacing.xl,
    opacity: 0.92,
  },
  skeletonRow: {
    marginBottom: spacing['2xl'],
  },
  carouselContent: {
    paddingRight: spacing.screenPadding,
  },
});
