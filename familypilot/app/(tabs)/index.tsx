import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { FocusedRecommendationCard } from '@/src/components/home/FocusedRecommendationCard';
import { OutingPreferences } from '@/src/components/home/OutingPreferences';
import { PostVisitInbox } from '@/src/components/planning/VisitFeedback';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { EmptyState, ErrorState, SectionHeader, SkeletonDecisionCard, Text } from '@/src/components/ui';
import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';
import { useFiltersStore } from '@/src/stores/filters-store';
import { useFamilyProfile, useNearbyVenues, useFocusedRecommendations, useProactiveHomeRequest, useWeather } from '@/src/hooks/use-queries';

function getTimeGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

const categories = [
  ['Parks', 'leaf-outline', 'parks'],
  ['Museums', 'business-outline', 'museums'],
  ['Playgrounds', 'happy-outline', 'parks'],
  ['Restaurants', 'restaurant-outline', 'restaurants'],
  ['All places', 'compass-outline', 'all'],
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data: places, isLoading: placesLoading, isError: placesError, refetch: retryPlaces } = useNearbyVenues();
  const { data: profile } = useFamilyProfile();
  const { data: weather, refetch: refetchWeather } = useWeather();
  const { parsedRequest, isProactive } = useProactiveHomeRequest();
  const { data: focusedResult, isLoading: recsLoading, isError: recsError, refetch } = useFocusedRecommendations(parsedRequest);
  const recommendations = focusedResult?.recommendations ?? [];
  const topPick = recommendations[0];
  const moreIdeas = recommendations.slice(1);
  const featuredVenueIds = new Set(recommendations.map((rec) => rec.venueId));
  const otherPlaces = (places ?? []).filter((venue) => !featuredVenueIds.has(venue.id));
  const browse = (category: string) => {
    useFiltersStore.getState().resetExploreFilters();
    useFiltersStore.getState().setCategoryFilter(category);
    router.push('/(tabs)/explore' as never);
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([retryPlaces(), refetch(), refetchWeather()]); } finally { setRefreshing(false); }
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.primary[500]} />}>
        <View style={styles.header}>
          <View>
            <Text variant="heading2" style={styles.greeting}>{getTimeGreeting()}, {profile?.parentName ?? 'there'}</Text>
            <Text variant="bodySmall" color={colors.text.secondary} style={styles.welcome}>Find something lovely to do together</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.parentName ?? 'F').slice(0, 1).toUpperCase()}</Text></View>
        </View>

        <Pressable style={styles.searchBar} onPress={() => router.push('/(tabs)/explore' as never)} accessibilityRole="button" accessibilityLabel="Search family activities">
          <Ionicons name="search-outline" size={23} color={colors.text.primary} />
          <Text variant="body" color={colors.text.secondary}>Search activities, places...</Text>
          <View style={styles.filterButton}><Ionicons name="options-outline" size={20} color={colors.text.inverse} /></View>
        </Pressable>

        <Text variant="heading3" style={styles.sectionTitle}>What are you in the mood for?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map(([label, icon, category], index) => (
            <Pressable key={label} onPress={() => browse(category)} style={[styles.categoryChip, index === 0 && styles.categoryChipActive]} accessibilityRole="button">
              <Ionicons name={icon} size={17} color={index === 0 ? colors.text.inverse : colors.text.primary} />
              <Text variant="bodySmall" style={index === 0 ? styles.activeChipText : undefined}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.headingRow}><Text variant="heading2">A great fit for today</Text><Pressable onPress={() => router.push('/(tabs)/explore' as never)}><Text variant="bodySmall" style={styles.seeAll}>See all</Text></Pressable></View>
        {isProactive ? <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>Picked around your family&apos;s needs</Text> : null}
        <Pressable onPress={() => setPreferencesOpen(!preferencesOpen)} style={styles.preferenceLink}><Text variant="caption" color={colors.primary[600]}>Adjust today&apos;s preferences {preferencesOpen ? '−' : '+'}</Text></Pressable>
        {preferencesOpen ? <OutingPreferences request={parsedRequest} /> : null}
        <PostVisitInbox />
        {recsError ? <ErrorState onRetry={() => void refetch()} /> : null}
        {recsLoading ? <SkeletonDecisionCard /> : null}
        {!recsLoading && !topPick ? <Text variant="bodySmall" color={colors.text.secondary} style={styles.emptyHint}>Explore real places below. We&apos;ll show personalised matches when available.</Text> : null}
        {topPick ? <FocusedRecommendationCard recommendation={topPick} variant="hero" index={0} /> : null}

        {moreIdeas.length > 0 ? <>
          <SectionHeader title="More ideas for you" actionLabel="Explore" onAction={() => router.push('/(tabs)/explore' as never)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreIdeasScroll}>{moreIdeas.map((rec, index) => <View key={rec.venueId} style={styles.moreIdeasItem}><FocusedRecommendationCard recommendation={rec} index={index + 1} /></View>)}</ScrollView>
        </> : null}

        {placesLoading || placesError || otherPlaces.length > 0 ? <>
          <SectionHeader title={topPick ? 'More nearby options' : 'Top picks for your family'} actionLabel="See all" onAction={() => browse('all')} />
          {placesLoading ? <SkeletonDecisionCard /> : null}
          {placesError ? <ErrorState onRetry={() => void retryPlaces()} /> : null}
          {otherPlaces.slice(0, 6).map((venue, index) => <DecisionCard key={venue.id} venue={venue} variant={!topPick && index === 0 ? 'hero' : 'list'} index={index} />)}
        </> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing['3xl'] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.lg },
  greeting: { fontSize: 24, lineHeight: 30 },
  welcome: { marginTop: spacing.xs },
  avatar: { width: 46, height: 46, borderRadius: radius.full, backgroundColor: colors.primary[100], alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary[700], fontFamily: fontFamily.bold, fontSize: 18 },
  searchBar: { height: 60, borderRadius: radius.full, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl, shadowColor: '#172026', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  filterButton: { marginLeft: 'auto', marginRight: 6, width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginBottom: spacing.md },
  categoryRow: { gap: spacing.sm, paddingBottom: spacing.xl, paddingRight: spacing.md },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, height: 42, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  categoryChipActive: { backgroundColor: colors.text.primary, borderColor: colors.text.primary },
  activeChipText: { color: colors.text.inverse, fontFamily: fontFamily.semiBold },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  seeAll: { color: colors.primary[600], textDecorationLine: 'underline' },
  subtitle: { marginBottom: spacing.sm },
  preferenceLink: { paddingVertical: spacing.sm, marginBottom: spacing.md },
  emptyHint: { marginBottom: spacing.lg },
  moreIdeasScroll: { gap: spacing.md, paddingRight: spacing.md },
  moreIdeasItem: { width: 260 },
});
