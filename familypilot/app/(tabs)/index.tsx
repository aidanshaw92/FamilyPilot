import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DayRequestInput } from '@/src/components/home/DayRequestInput';
import { FocusedRecommendationCard } from '@/src/components/home/FocusedRecommendationCard';
import { QuickActionGrid } from '@/src/components/home/QuickActionGrid';
import { ScreenContainer, ScreenHeader } from '@/src/components/shared/ScreenContainer';
import { EmptyState, ErrorState, SectionHeader, SkeletonDecisionCard, Text } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useFocusedRecommendations, useWeather } from '@/src/hooks/use-queries';
import { recommendationService } from '@/src/services/api';
import { useDayRequestStore } from '@/src/stores/day-request-store';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { data: profile } = useFamilyProfile();
  const { data: weather } = useWeather();
  const { rawText, parsedRequest, setRawText, setParsedRequest } = useDayRequestStore();
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

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

  const handleSubmitRequest = useCallback(async () => {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const request = await recommendationService.parseDayRequest(rawText.trim());
      setParsedRequest(request);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not understand request');
    } finally {
      setParsing(false);
    }
  }, [rawText, setParsedRequest]);

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
        <DayRequestInput
          value={rawText}
          onChange={setRawText}
          onSubmit={() => void handleSubmitRequest()}
          loading={parsing}
        />

        {parseError ? (
          <Text variant="bodySmall" style={styles.error}>
            {parseError}
          </Text>
        ) : null}

        {parsedRequest && recsLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonDecisionCard />
          </View>
        ) : null}

        {parsedRequest && !recsLoading && recommendations.length === 0 ? (
          <EmptyState
            icon="compass-outline"
            title="No matches with confirmed details"
            message={
              focusedResult?.message ??
              'Try relaxing a requirement or explore nearby venues.'
            }
            actionLabel="Explore"
            onAction={() => router.push('/(tabs)/explore' as never)}
          />
        ) : null}

        {topPick ? (
          <View>
            <Text variant="heading3" style={styles.sectionTitle}>
              Today&apos;s best match
            </Text>
            <FocusedRecommendationCard recommendation={topPick} variant="hero" index={0} />
          </View>
        ) : null}

        <View style={styles.section}>
          <QuickActionGrid />
        </View>

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
  section: {
    marginBottom: spacing.xl,
  },
  moreIdeasSection: {
    marginBottom: spacing.xl,
  },
  skeletonRow: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  error: {
    color: '#b45309',
    marginBottom: spacing.md,
  },
});
