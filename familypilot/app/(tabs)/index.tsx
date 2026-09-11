import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { useFiltersStore } from '@/src/stores/filters-store';
import { PostVisitInbox } from '@/src/components/planning/VisitFeedback';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FocusedRecommendationCard } from '@/src/components/home/FocusedRecommendationCard';
import { OutingPreferences } from '@/src/components/home/OutingPreferences';
import { Button } from '@/src/components/ui/Button';
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
        <Text variant="heading3" style={{marginBottom:12}}>What would you like to do today?</Text>
        <View style={{flexDirection:'row',gap:8,marginBottom:20}}>
          {([
            ['Go outside','leaf-outline','parks','#E9F8EF'],
            ['Indoor activities','home-outline','museums','#F0EDFF'],
            ['Plan a day','calendar-outline','plan','#EAF4FF'],
            ['Explore London','compass-outline','all','#FFF0F4'],
          ] as const).map(([label,icon,category,bg]) => <Pressable key={label} accessibilityRole="button" onPress={() => category === 'plan' ? router.push('/(tabs)/trips' as never) : browse(category)} style={{flex:1,alignItems:'center',gap:8,paddingVertical:14,paddingHorizontal:4,borderRadius:14,backgroundColor:bg}}><Ionicons name={icon} size={25} color={colors.primary[600]}/><Text variant="caption" style={{textAlign:'center'}}>{label}</Text></Pressable>)}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setPreferencesOpen(!preferencesOpen)} style={{paddingVertical:12,marginBottom:12}}><Text variant="bodySmall" color={colors.primary[600]}>Adjust today's preferences {preferencesOpen ? '−' : '+'}</Text></Pressable>
        {preferencesOpen ? <OutingPreferences request={parsedRequest} /> : null}
        <PostVisitInbox/>
        {recsError ? <ErrorState onRetry={() => void refetch()} /> : null}
        {recsLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonDecisionCard />
          </View>
        ) : null}

        {!recsLoading && recommendations.length === 0 ? <Text variant="bodySmall" color={colors.text.secondary} style={{marginBottom:16}}>Explore real places below. We’ll show personalised matches when the details meet your family’s requirements.</Text> : null}
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

        <SectionHeader title="Explore London" subtitle="Real places across the city · check family facilities before visiting" actionLabel="See all" onAction={() => browse('all')}/>
        {placesLoading ? <SkeletonDecisionCard/> : null}
        {placesError ? <ErrorState onRetry={() => void retryPlaces()}/> : null}
        {places?.slice(0,8).map((venue,index) => <DecisionCard key={venue.id} venue={venue} variant={index === 0 ? 'hero' : 'list'} index={index}/>)}
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
