import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { useFiltersStore } from '@/src/stores/filters-store';
import { PostVisitInbox } from '@/src/components/planning/VisitFeedback';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FocusedRecommendationCard } from '@/src/components/home/FocusedRecommendationCard';
import { OutingPreferences } from '@/src/components/home/OutingPreferences';
import { ScreenContainer, ScreenHeader } from '@/src/components/shared/ScreenContainer';
import { EmptyState, ErrorState, SectionHeader, SkeletonDecisionCard, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import {
  useFamilyProfile,
  useNearbyVenues,
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
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const { data: places, isLoading: placesLoading, isError: placesError, refetch: retryPlaces } = useNearbyVenues();
  const browse = (category: string) => { useFiltersStore.getState().resetExploreFilters(); useFiltersStore.getState().setCategoryFilter(category); router.push('/(tabs)/explore' as never); };
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
  // "Top picks" and "Today's Pick"/"Also worth considering" draw on two different ranking
  // systems (see the architecture review) that can legitimately disagree about a venue's fit.
  // Until they're merged into one, at least never show the *same* venue twice on one screen
  // with two different framings — that reads as the app contradicting itself.
  const featuredVenueIds = new Set(recommendations.map((rec) => rec.venueId));
  const otherPlaces = (places ?? []).filter((venue) => !featuredVenueIds.has(venue.id));

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
        <Text variant="heading3" style={styles.quickActionHeading}>What would you like to do today?</Text>
        <View style={styles.quickActionRow}>
          {([
            ['Go outside','leaf-outline','parks','#E9F8EF',colors.secondary[600]],
            ['Indoor activities','home-outline','museums','#F0EDFF',colors.primary[600]],
            ['Plan a day','calendar-outline','plan','#EAF4FF',colors.accent[600]],
            ['Explore London','compass-outline','all','#FFF0F4',colors.coral],
          ] as const).map(([label,icon,category,bg,iconColor]) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={() => category === 'plan' ? router.push('/(tabs)/trips' as never) : browse(category)}
              style={[styles.quickAction,{backgroundColor:bg}]}
            >
              <Ionicons name={icon} size={25} color={iconColor}/>
              <Text variant="caption" style={styles.quickActionLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setPreferencesOpen(!preferencesOpen)} style={styles.preferencesToggle}>
          <Text variant="bodySmall" color={colors.primary[600]}>Adjust today's preferences {preferencesOpen ? '−' : '+'}</Text>
        </Pressable>
        {preferencesOpen ? <OutingPreferences request={parsedRequest} /> : null}
        <PostVisitInbox/>
        {recsError ? <ErrorState onRetry={() => void refetch()} /> : null}
        {recsLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonDecisionCard />
          </View>
        ) : null}

        {!recsLoading && recommendations.length === 0 ? <Text variant="bodySmall" color={colors.text.secondary} style={styles.recommendationHint}>Explore real places below. We’ll show personalised matches when the details meet your family’s requirements.</Text> : null}
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

        {placesLoading || placesError || otherPlaces.length > 0 || (!topPick && places?.length === 0) ? (
          <>
            <SectionHeader
              title={topPick ? 'More nearby options' : 'Top picks for your family'}
              subtitle="Real places across London · family details shown when verified"
              actionLabel="See all"
              onAction={() => browse('all')}
            />
            {placesLoading ? <SkeletonDecisionCard/> : null}
            {placesError ? <ErrorState onRetry={() => void retryPlaces()}/> : null}
            {!placesLoading && !placesError && places?.length === 0 ? (
              <EmptyState
                icon="search-outline"
                title="No places found nearby"
                message="Try exploring a wider area or adjusting your preferences."
                actionLabel="Explore"
                onAction={() => browse('all')}
              />
            ) : null}
            {otherPlaces.slice(0,8).map((venue,index) => (
              <DecisionCard key={venue.id} venue={venue} variant={!topPick && index === 0 ? 'hero' : 'list'} index={index}/>
            ))}
          </>
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
  quickActionHeading: {
    marginBottom: spacing.md,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
  },
  quickActionLabel: {
    textAlign: 'center',
  },
  preferencesToggle: {
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  recommendationHint: {
    marginBottom: spacing.lg,
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
