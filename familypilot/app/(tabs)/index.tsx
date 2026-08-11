import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FocusedRecommendationCard } from '@/src/components/home/FocusedRecommendationCard';
import { ScreenContainer, ScreenHeader } from '@/src/components/shared/ScreenContainer';
import { EmptyState, ErrorState, SectionHeader, SkeletonDecisionCard, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import {
  useFamilyProfile,
  useFocusedRecommendations,
  useProactiveHomeRequest,
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
  const { parsedRequest, isProactive } = useProactiveHomeRequest();

  const {
    data: focusedResult,
    isLoading: recsLoading,
    isError: recsError,
    refetch,
  } = useFocusedRecommendations(parsedRequest);

  const parentName = profile?.parentName ?? 'there';
  const recommendations = focusedResult?.recommendations ?? [];
  const topPick = recommendations[0];
  const moreIdeas = recommendations.slice(1);

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
        ) : null}

        {!recsLoading && recommendations.length === 0 ? (
          <EmptyState
            icon="compass-outline"
            title="No matches with confirmed details"
            message={
              focusedResult?.message ??
              'Try describing what you need below, or explore nearby venues.'
            }
            actionLabel="Explore"
            onAction={() => router.push('/(tabs)/explore' as never)}
          />
        ) : null}

        {topPick ? (
          <View style={styles.heroSection}>
              <View style={styles.sectionEyebrow}>
                <View style={styles.eyebrowDot} />
                <Text variant="caption" style={styles.eyebrowText}>
                  Today&apos;s Pick
                </Text>
              </View>
              <Text variant="heading1" style={styles.sectionTitle}>
                A great fit for today
              </Text>
            {isProactive ? (
              <Text variant="bodySmall" style={styles.heroSubtitle}>
                Our best suggestion for your family right now
              </Text>
            ) : null}
            <FocusedRecommendationCard recommendation={topPick} variant="hero" index={0} />
          </View>
        ) : null}

        {moreIdeas.length > 0 ? (
          <View style={styles.moreIdeasSection}>
            <SectionHeader
              title="Also worth considering"
              subtitle="Up to three evidence-backed suggestions"
              actionLabel="Explore"
              onAction={() => router.push('/(tabs)/explore' as never)}
            />
            {moreIdeas.map((rec, index) => (
              <FocusedRecommendationCard key={rec.venueId} recommendation={rec} index={index + 1} />
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
    paddingBottom: spacing['3xl'],
  },
  heroSection: {
    marginBottom: spacing.xl,
  },
  moreIdeasSection: {
    marginBottom: spacing.xl,
  },
  skeletonRow: {
    marginBottom: spacing['2xl'],
  },
  sectionEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
  },
  eyebrowText: {
    color: colors.primary[600],
    letterSpacing: 1.2,
    fontFamily: 'Inter_700Bold',
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    marginBottom: spacing.md,
    color: colors.text.secondary,
  },
  error: {
    color: '#b45309',
    marginTop: spacing.sm,
  },
});
