import { useMemo, useState, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { RestaurantCard } from '@/src/components/restaurant/RestaurantCard';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, ErrorState, SectionHeader, SkeletonCard, Text } from '@/src/components/ui';
import { isPilotFeatureVisible, visibleExploreCategoryIds } from '@/src/config/pilot-features';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues, useRestaurants } from '@/src/hooks/use-queries';
import { venueService } from '@/src/services/api';
import { useFiltersStore } from '@/src/stores/filters-store';
import { Venue } from '@/src/types';
import { buildExploreEditorialSections } from '@/src/utils/explore-editorial-sections';
import { EXPLORE_CATEGORIES, filterVenues } from '@/src/utils/filter-venues';

export default function ExploreScreen() {
  const [search, setSearch] = useState('');
  const [areaVenues, setAreaVenues] = useState<Venue[] | null>(null);
  const [searchingArea, setSearchingArea] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const { data: venues, isLoading: venuesLoading, isError: venuesError, refetch: refetchVenues } =
    useNearbyVenues();
  const {
    data: restaurants,
    isLoading: restaurantsLoading,
    isError: restaurantsError,
    refetch: refetchRestaurants,
  } = useRestaurants();
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

  const isRestaurantMode =
    categoryFilter === 'restaurants' && isPilotFeatureVisible('explore_restaurants');

  useEffect(() => {
    if (categoryFilter === 'restaurants' && !isPilotFeatureVisible('explore_restaurants')) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, setCategoryFilter]);

  const exploreCategories = useMemo(
    () => EXPLORE_CATEGORIES.filter((category) => visibleExploreCategoryIds().includes(category.id)),
    [],
  );

  const sourceVenues = areaVenues ?? venues;
  const filteredVenues = useMemo(
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
              : `${venue.name} ${venue.address ?? ''}`.toLowerCase().includes(search.toLowerCase().trim()),
          )
        : [],
    [sourceVenues, areaVenues, categoryFilter, advancedFilters, exploreMaxDrive, exploreBudget, profile?.maxDriveMinutes, search],
  );

  const useEditorialLayout = false &&
    !isRestaurantMode &&
    categoryFilter === 'all' &&
    advancedFilters.length === 0 &&
    exploreMaxDrive === 'any' &&
    exploreBudget === 'any';

  const editorialSections = useMemo(
    () => (useEditorialLayout ? buildExploreEditorialSections(filteredVenues) : []),
    [filteredVenues, useEditorialLayout],
  );

  const activeCategoryLabel =
    EXPLORE_CATEGORIES.find((c) => c.id === categoryFilter)?.label ?? 'Places';

  const activeFilterCount =
    (exploreMaxDrive !== 'any' ? 1 : 0) +
    (exploreBudget !== 'any' ? 1 : 0) +
    advancedFilters.length;

  const isLoading = searchingArea || (isRestaurantMode ? restaurantsLoading : venuesLoading);
  const isError = isRestaurantMode ? restaurantsError : venuesError;
  const refetch = isRestaurantMode ? refetchRestaurants : refetchVenues;
  const resultCount = isRestaurantMode ? (restaurants?.length ?? 0) : filteredVenues.length;

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
      const results = await venueService.searchArea(query);
      setAreaVenues(results);
      setSearchMessage(`Showing live places around ${query}.`);
    } catch (error) {
      setAreaVenues([]);
      setSearchMessage(error instanceof Error ? error.message : 'Could not search that area.');
    } finally {
      setSearchingArea(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setAreaVenues(null);
    setSearchMessage('');
    if (isRestaurantMode) {
      setCategoryFilter('restaurants');
      useFiltersStore.getState().setExploreMaxDrive('any');
      useFiltersStore.getState().setExploreBudget('any');
      useFiltersStore.getState().clearAdvancedFilters();
    } else {
      setCategoryFilter('all');
      resetExploreFilters();
    }
  };

  if (isError && !areaVenues) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={() => void refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading2">Explore London</Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          {isRestaurantMode
            ? 'Family-friendly places to eat'
            : 'Parks, museums and family days out across London'}
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search a London area or postcode"
          placeholder="Search a London area or postcode"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setAreaVenues(null);
            setSearchMessage('');
          }}
          onSubmitEditing={() => void handleAreaSearch()}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search this London area"
          onPress={() => void handleAreaSearch()}
          style={styles.searchButton}
        >
          <Text variant="bodySmall" color={colors.text.inverse}>
            Search
          </Text>
        </Pressable>
      </View>
      {searchMessage ? (
        <Text
          variant="caption"
          color={areaVenues && areaVenues.length > 0 ? colors.text.secondary : colors.warning[600]}
          style={styles.searchMessage}
        >
          {searchMessage}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {exploreCategories.map((category) => (
          <Chip
            key={category.id}
            label={category.label}
            active={categoryFilter === category.id}
            onPress={() => setCategoryFilter(category.id)}
          />
        ))}
        <Pressable
          style={styles.filterButton}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Text variant="bodySmall" color={colors.primary[500]}>
            Filter
          </Text>
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text variant="caption" color={colors.text.inverse}>
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingList}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : resultCount === 0 ? (
        <EmptyState
          icon="search-outline"
          title={isRestaurantMode ? 'No restaurants found' : 'No places found'}
          message={
            isRestaurantMode
              ? 'Try adjusting your filters or explore a wider area.'
              : areaVenues
                ? 'Try a nearby London area or postcode, or clear the search to browse all London.'
                : 'Try another category, clear your filters, or search a different London area.'
          }
          actionLabel="Clear filters"
          onAction={handleClearFilters}
        />
      ) : useEditorialLayout && editorialSections.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.editorialContent}
          showsVerticalScrollIndicator={false}
        >
          {editorialSections.map((section) => (
            <View key={section.id} style={styles.editorialSection}>
              <SectionHeader title={section.title} subtitle={section.subtitle} />
              {section.venues.map((venue, index) => (
                <DecisionCard key={venue.id} venue={venue} variant="list" index={index} />
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={styles.listHeader}>
            <SectionHeader
              title={areaVenues ? `Around ${search.trim()}` : activeCategoryLabel}
              subtitle={`${resultCount} ${isRestaurantMode ? 'restaurant' : 'place'}${resultCount === 1 ? '' : 's'} ${areaVenues ? 'near this area' : 'across London'}`}
            />
          </View>
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {isRestaurantMode
              ? restaurants?.map((restaurant, index) => (
                  <RestaurantCard key={restaurant.id} restaurant={restaurant} index={index} />
                ))
              : filteredVenues.map((venue, index) => (
                  <DecisionCard key={venue.id} venue={venue} variant="list" index={index} />
                ))}
          </ScrollView>
        </>
      )}

      <FilterSheet visible={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} />
    </ScreenContainer>
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
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.text.primary,
  },
  searchButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchMessage: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.sm,
  },
  categoryScroll: {
    maxHeight: 52,
    marginTop: spacing.sm,
  },
  categoryContent: {
    paddingHorizontal: spacing.screenPadding,
    alignItems: 'center',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    marginLeft: spacing.sm,
  },
  filterBadge: {
    backgroundColor: colors.primary[500],
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  listHeader: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  editorialContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.lg,
  },
  editorialSection: {
    marginBottom: spacing['2xl'],
  },
  loadingList: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
});
