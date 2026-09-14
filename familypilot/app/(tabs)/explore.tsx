import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { PlaceTile } from '@/src/components/shared/PlaceTile';
import {
  EmptyState,
  ErrorState,
  PillSelector,
  SearchBar,
  Skeleton,
  Text,
} from '@/src/components/ui';
import { visibleExploreCategoryIds } from '@/src/config/pilot-features';
import { colors, layout, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues } from '@/src/hooks/use-queries';
import { venueService } from '@/src/services/api';
import { useFiltersStore } from '@/src/stores/filters-store';
import { Venue } from '@/src/types';
import { getCardSignals } from '@/src/utils/family-signals';
import { EXPLORE_CATEGORIES, filterVenues } from '@/src/utils/filter-venues';
import { formatCategory } from '@/src/utils/format-category';

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [areaVenues, setAreaVenues] = useState<Venue[] | null>(null);
  const [searchingArea, setSearchingArea] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: venues, isLoading: venuesLoading, isError, refetch } = useNearbyVenues();
  const { data: profile } = useFamilyProfile();
  const {
    categoryFilter,
    exploreMaxDrive,
    exploreBudget,
    advancedFilters,
    filterSheetOpen,
    setCategoryFilter,
    setFilterSheetOpen,
    resetExploreFilters,
  } = useFiltersStore();

  const categories = useMemo(() => {
    const visible = visibleExploreCategoryIds();
    return EXPLORE_CATEGORIES.filter((category) => visible.includes(category.id));
  }, []);

  const sourceVenues = areaVenues ?? venues;
  const results = useMemo(
    () =>
      sourceVenues
        ? filterVenues(
            sourceVenues,
            categoryFilter,
            advancedFilters,
            exploreMaxDrive,
            profile?.maxDriveMinutes ?? 30,
            exploreBudget,
          ).filter((venue) =>
            areaVenues
              ? true
              : `${venue.name} ${venue.address ?? ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase().trim()),
          )
        : [],
    [
      sourceVenues,
      areaVenues,
      categoryFilter,
      advancedFilters,
      exploreMaxDrive,
      exploreBudget,
      profile?.maxDriveMinutes,
      search,
    ],
  );

  const activeFilterCount =
    (exploreMaxDrive !== 'any' ? 1 : 0) + (exploreBudget !== 'any' ? 1 : 0) + advancedFilters.length;
  const isLoading = searchingArea || venuesLoading;

  const handleAreaSearch = async () => {
    const query = search.trim();
    if (!query) {
      setAreaVenues(null);
      setSearchMessage('');
      return;
    }
    setSearchingArea(true);
    setSearchMessage('');
    try {
      const found = await venueService.searchArea(query);
      setAreaVenues(found);
      setSearchMessage(`Showing live places around ${query}.`);
    } catch (error) {
      setAreaVenues([]);
      setSearchMessage(error instanceof Error ? error.message : 'Could not search that area.');
    } finally {
      setSearchingArea(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (areaVenues) await handleAreaSearch();
      else await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleClear = () => {
    setSearch('');
    setAreaVenues(null);
    setSearchMessage('');
    setCategoryFilter('all');
    resetExploreFilters();
  };

  if (isError && !areaVenues) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing['3xl'] }]}>
        <ErrorState onRetry={() => void refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
      >
        <View style={styles.gutter}>
          <Text variant="display">Explore</Text>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.sub}>
            Family days out across London
          </Text>

          <SearchBar
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setAreaVenues(null);
              setSearchMessage('');
            }}
            onSubmit={() => void handleAreaSearch()}
            placeholder="Search a place or area"
            onFilterPress={() => setFilterSheetOpen(true)}
            filterActive={activeFilterCount > 0}
            style={styles.search}
          />
        </View>

        <PillSelector
          options={categories}
          value={categoryFilter}
          onChange={setCategoryFilter}
          accessibilityLabel="Place categories"
          style={styles.rail}
          contentStyle={styles.railContent}
        />

        <View style={styles.gutter}>
          {searchMessage ? (
            <Text variant="bodySmall" color={colors.text.secondary} style={styles.message}>
              {searchMessage}
            </Text>
          ) : null}

          {!isLoading ? (
            <Text variant="caption" color={colors.text.tertiary} style={styles.count}>
              {results.length} {results.length === 1 ? 'place' : 'places'}
              {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ''}
            </Text>
          ) : null}

          {isLoading ? (
            <>
              <Skeleton height={248} borderRadius={radius['2xl']} style={styles.skeleton} />
              <Skeleton height={248} borderRadius={radius['2xl']} />
            </>
          ) : null}

          {!isLoading && results.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Nothing matches yet"
              message="Try a wider travel time, fewer must-haves, or search a different area."
              actionLabel="Clear filters"
              onAction={handleClear}
            />
          ) : null}

          {results.map((venue) => (
            <PlaceTile
              key={venue.id}
              id={venue.id}
              name={venue.name}
              imageUrl={venue.imageUrl}
              category={venue.category}
              meta={`${formatCategory(venue.category)} · ${venue.driveMinutes} min away${
                venue.estimatedSpend ? ` · ${venue.estimatedSpend}` : ''
              }`}
              detail={
                getCardSignals(venue, 4)
                  .slice(1)
                  .map((signal) => signal.label)
                  .join(' · ') || undefined
              }
              score={venue.familyScore.score}
              enrichmentStatus={venue.enrichmentStatus}
              saveVenue={venue}
              onPress={() => router.push(`/venue/${venue.id}` as never)}
              imageHeight={186}
              style={styles.tile}
            />
          ))}
        </View>
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
  sub: {
    marginTop: 4,
  },
  search: {
    marginTop: spacing.xl,
  },
  rail: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  railContent: {
    paddingLeft: spacing.screenPadding,
  },
  message: {
    marginBottom: spacing.md,
  },
  count: {
    marginBottom: spacing.lg,
  },
  skeleton: {
    marginBottom: spacing.lg,
  },
  tile: {
    marginBottom: spacing.lg,
  },
});
