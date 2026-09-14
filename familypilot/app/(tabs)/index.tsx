import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { PlaceShowcaseCard } from '@/src/components/shared/PlaceShowcaseCard';
import { PlaceTile } from '@/src/components/shared/PlaceTile';
import {
  EmptyState,
  ErrorState,
  PillSelector,
  SearchBar,
  SectionHeader,
  Skeleton,
  SnapCarousel,
  Text,
} from '@/src/components/ui';
import { colors, layout, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues, useWeather } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { Venue } from '@/src/types';
import { getCardSignals } from '@/src/utils/family-signals';
import { formatCategory } from '@/src/utils/format-category';
import { filterByPlanCategory, PLAN_CATEGORIES } from '@/src/utils/plan-categories';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState('for_you');
  const [refreshing, setRefreshing] = useState(false);
  const filterSheetOpen = useFiltersStore((s) => s.filterSheetOpen);
  const setFilterSheetOpen = useFiltersStore((s) => s.setFilterSheetOpen);

  const { data: profile } = useFamilyProfile();
  const { data: weather } = useWeather();
  const {
    data: venues,
    isLoading,
    isError,
    refetch,
  } = useNearbyVenues();

  const firstName = profile?.parentName?.split(' ')[0] ?? 'there';
  const ranked = useMemo(
    () => [...(venues ?? [])].sort((a, b) => b.familyScore.score - a.familyScore.score),
    [venues],
  );
  const shortlist = useMemo(() => filterByPlanCategory(ranked, category), [ranked, category]);
  // The big cards carry the top few picks; everything else that passed the same filter goes
  // into the rail below, so a short list still fills the screen instead of trailing off.
  const showcase = shortlist.slice(0, 3);
  const alsoGood = shortlist.slice(3, 12);

  // The next card must peek, which is what tells a parent this rail swipes.
  const cardWidth = Math.round(width - spacing.screenPadding * 2 - 44);
  const cardHeight = Math.round(cardWidth * 1.22);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openVenue = (venue: Venue) => router.push(`/venue/${venue.id}` as never);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.primary[500]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Text variant="display" numberOfLines={1}>
              {getTimeGreeting()}, {firstName}
            </Text>
            <Text variant="bodySmall" color={colors.text.secondary} style={styles.greetingSub}>
              {weather
                ? `${weather.description}, ${weather.temperature}°. What shall we do today?`
                : 'What shall we do today?'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your family profile"
            onPress={() => router.push('/(tabs)/profile' as never)}
            style={styles.avatar}
          >
            <Text variant="heading3" color={colors.text.inverse}>
              {firstName.charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>

        <SearchBar
          placeholder="Search places and activities"
          onPress={() => router.push('/(tabs)/explore' as never)}
          onFilterPress={() => setFilterSheetOpen(true)}
          style={styles.search}
        />

        <Text variant="heading1" style={styles.railHeading}>
          Select your plan
        </Text>
        <PillSelector
          options={PLAN_CATEGORIES}
          value={category}
          onChange={setCategory}
          accessibilityLabel="Plan categories"
          style={styles.rail}
          contentStyle={styles.railContent}
        />

        {isError ? (
          <View style={styles.gutter}>
            <ErrorState onRetry={() => void refetch()} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.gutter}>
            <Skeleton height={cardHeight} borderRadius={radius['3xl']} />
          </View>
        ) : null}

        {!isLoading && !isError && showcase.length === 0 ? (
          <View style={styles.gutter}>
            <EmptyState
              icon="search-outline"
              title="Nothing confirmed here yet"
              message="We only show places once the family details we need have been reviewed. Try another category."
              actionLabel="See everything nearby"
              onAction={() => setCategory('for_you')}
            />
          </View>
        ) : null}

        {showcase.length > 0 ? (
          <SnapCarousel
            data={showcase}
            keyExtractor={(venue) => venue.id}
            itemWidth={cardWidth}
            gap={spacing.md}
            showDots
            renderItem={(venue) => (
              <PlaceShowcaseCard
                venue={venue}
                width={cardWidth}
                height={cardHeight}
                onPress={() => openVenue(venue)}
              />
            )}
          />
        ) : null}

        {alsoGood.length > 0 ? (
          <View style={styles.alsoGood}>
            <View style={styles.gutter}>
              <SectionHeader
                title="Also worth a look"
                actionLabel="See all"
                onAction={() => router.push('/(tabs)/explore' as never)}
              />
            </View>
            <SnapCarousel
              data={alsoGood}
              keyExtractor={(venue) => venue.id}
              itemWidth={228}
              gap={spacing.md}
              renderItem={(venue) => (
                <PlaceTile
                  id={venue.id}
                  name={venue.name}
                  imageUrl={venue.imageUrl}
                  category={venue.category}
                  meta={`${formatCategory(venue.category)} · ${venue.driveMinutes} min away`}
                  detail={getCardSignals(venue, 3)
                    .slice(1)
                    .map((s) => s.label)
                    .join(' · ')}
                  score={venue.familyScore.score}
                  enrichmentStatus={venue.enrichmentStatus}
                  saveVenue={venue}
                  onPress={() => openVenue(venue)}
                />
              )}
            />
          </View>
        ) : null}
      </ScrollView>

      <FilterSheet visible={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: layout.navClearance,
  },
  gutter: {
    paddingHorizontal: spacing.screenPadding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing.xl,
  },
  greeting: {
    flex: 1,
  },
  greetingSub: {
    marginTop: 4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing['2xl'],
  },
  railHeading: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing.lg,
  },
  rail: {
    marginBottom: spacing.xl,
  },
  railContent: {
    paddingLeft: spacing.screenPadding,
  },
  alsoGood: {
    marginTop: spacing['3xl'],
  },
});
