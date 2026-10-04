import { useMemo, useState, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { RestaurantCard } from '@/src/components/restaurant/RestaurantCard';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { PlaceCredits } from '@/src/components/shared/PlaceCredits';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, Doodle, EmptyState, ErrorState, SearchBar, SectionHeader, SkeletonCard, Text, CHIP_GAP, CHIP_HEIGHT, railTint } from '@/src/components/ui';
import { isPilotFeatureVisible, visibleExploreCategoryIds } from '@/src/config/pilot-features';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues, useRestaurants } from '@/src/hooks/use-queries';
import { venueService } from '@/src/services/api';
import { useFiltersStore } from '@/src/stores/filters-store';
import { RestaurantDetail, Venue } from '@/src/types';
import { buildExploreEditorialSections } from '@/src/utils/explore-editorial-sections';
import { EXPLORE_CATEGORIES, filterVenues } from '@/src/utils/filter-venues';
import { SAVED_EXAMPLES_NOTICE, showingSavedExamples } from '@/src/utils/saved-examples-notice';

export default function ExploreScreen() {
  const tabBarClearance = useTabBarClearance();
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

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (areaVenues) {
        await handleAreaSearch();
      } else {
        await refetch();
      }
    } finally {
      setRefreshing(false);
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
      {/* The identity's decoration lives on the canvas only (Figma "06 — Explore v2"): a leaf in the
          top corner, the strokes beside the heading, a blush blob by the section title. None sits
          on a card or a control, and all of them ignore the pointer and assistive technology. */}
      <View style={styles.header}>
        <Doodle kind="leaf" tint="green" size={40} rotate={24} style={styles.cornerLeaf} />
        <View style={styles.headingRow}>
          <Text variant="heading1">Explore London</Text>
          <Doodle kind="strokes" tint="yellow" size={30} style={styles.headingStrokes} />
        </View>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          {isRestaurantMode
            ? 'Family-friendly places to eat'
            : 'Parks, museums and family days out across London'}
        </Text>
      </View>

      <SearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setAreaVenues(null);
          setSearchMessage('');
        }}
        onSubmit={() => void handleAreaSearch()}
        placeholder="Area or postcode"
        accessibilityLabel="Search a London area or postcode"
        actionLabel="Search"
        actionAccessibilityLabel="Search this London area"
        onAction={() => void handleAreaSearch()}
        style={styles.search}
      />
      {!areaVenues && !isRestaurantMode && !isLoading && showingSavedExamples(venues) ? (
        <Text variant="caption" color={colors.warning[600]} style={styles.searchMessage}>
          {SAVED_EXAMPLES_NOTICE}
        </Text>
      ) : null}
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
        {exploreCategories.map((category, index) => (
          <Chip
            key={category.id}
            label={category.label}
            active={categoryFilter === category.id}
            appearance="plain"
            tint={railTint(index - 1)}
            onPress={() => setCategoryFilter(category.id)}
          />
        ))}
        <Pressable
          style={styles.filterButton}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Text variant="link">
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
          contentContainerStyle={[styles.editorialContent, { paddingBottom: tabBarClearance }]}
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
          <View style={styles.credits}>
            <PlaceCredits places={editorialSections.flatMap((section) => section.venues)} />
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={styles.listHeader}>
            <Doodle kind="blob" tint="blush" size={56} style={styles.sectionBlob} />
            <SectionHeader
              title={areaVenues ? `Around ${search.trim()}` : activeCategoryLabel}
              subtitle={`${resultCount} ${isRestaurantMode ? 'restaurant' : 'place'}${resultCount === 1 ? '' : 's'} ${areaVenues ? 'near this area' : 'across London'}`}
            />
          </View>
          {/*
            A FlatList, not a ScrollView with `.map`, because every row carries a venue photograph
            and every photograph a parent never sees is money.

            Measured at an iPhone viewport (390x844) against the local fixture: the mapped list
            mounted 15 photo elements and fired 12 proxy requests on open, while only FOUR were on
            screen -- eleven rows sat between 891px and 2511px down the page. Each proxy request
            that misses the CDN buys a Place Details call AND a Place Photos call, so those eight
            invisible thumbnails were sixteen billable Google requests per cold open.

            `loading="lazy"` on the image alone does not fix it. The attribute is set, and Chromium
            still fetched all twelve, because its near-viewport threshold is over a thousand pixels
            on a fast connection. Windowing the LIST is what keeps the row out of the tree, so there
            is no image to fetch at all, and it works the same way on native.

            Nothing about the design changes: the same rows, the same `listContent` padding, the
            same pull-to-refresh. `ScreenContainer` is a View, so there is no nested-list hazard.
          */}
          <FlatList
            data={isRestaurantMode ? (restaurants ?? []) : filteredVenues}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) =>
              isRestaurantMode ? (
                <RestaurantCard restaurant={item as RestaurantDetail} index={index} />
              ) : (
                <DecisionCard venue={item as Venue} variant="list" index={index} />
              )
            }
            ListFooterComponent={
              <View style={styles.credits}>
                <PlaceCredits
                  places={isRestaurantMode ? (restaurants ?? []) : filteredVenues}
                />
              </View>
            }
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={4}
            windowSize={2}
            removeClippedSubviews={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={colors.ink}
                colors={[colors.ink]}
              />
            }
          />
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
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headingStrokes: {
    position: 'relative',
    marginTop: -2,
  },
  cornerLeaf: {
    right: spacing.xs,
    top: 0,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  search: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionBlob: {
    right: spacing.screenPadding,
    top: spacing.md,
  },
  searchMessage: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.sm,
  },
  // A fixed, non-shrinking band: as a flex child with only a maxHeight the rail was squeezed to
  // 26px (17px once the list scrolled) and clipped the 44pt chips top and bottom.
  categoryScroll: {
    height: CHIP_HEIGHT + spacing.sm,
    flexGrow: 0,
    flexShrink: 0,
    marginTop: spacing.sm,
  },
  categoryContent: {
    paddingHorizontal: spacing.screenPadding,
    alignItems: 'center',
    gap: CHIP_GAP,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBadge: {
    backgroundColor: colors.action,
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
  // The credit line sits under the last row, inside the list's own padding, so it scrolls with the
  // results it describes rather than floating over them.
  credits: {
    paddingTop: spacing.sm,
    alignItems: 'center',
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
