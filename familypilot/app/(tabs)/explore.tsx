import { useMemo, useState, useEffect } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { estimateLineCount } from '@/src/utils/home-header-layout';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { RestaurantCard } from '@/src/components/restaurant/RestaurantCard';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { PlaceCredits } from '@/src/components/shared/PlaceCredits';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, ErrorState, EXPLORE_CHIP, ScreenArt, SearchBar, SectionHeader, SkeletonCard, Text, railTint } from '@/src/components/ui';
import { EXPLORE_ART_BEHIND, EXPLORE_ART_FRONT } from '@/src/assets/art/figma-art';
import { isPilotFeatureVisible, visibleExploreCategoryIds } from '@/src/config/pilot-features';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues, useRestaurants } from '@/src/hooks/use-queries';
import { venueService } from '@/src/services/api';
import { useFiltersStore } from '@/src/stores/filters-store';
import { RestaurantDetail, Venue } from '@/src/types';
import { buildExploreEditorialSections } from '@/src/utils/explore-editorial-sections';
import { EXPLORE_CATEGORIES, exploreCategoriesFor, filterVenues } from '@/src/utils/filter-venues';
import { SAVED_EXAMPLES_NOTICE, showingSavedExamples } from '@/src/utils/saved-examples-notice';

export default function ExploreScreen() {
  const { width } = useWindowDimensions();
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
  // The subtitle wraps on a narrow phone; everything under it, and the art beside that, moves down by the
  // extra line instead of the text being shrunk.
  const subtitleText = isRestaurantMode ? RESTAURANT_SUBTITLE : SUBTITLE;
  const subtitleShift = Math.max(0, estimateLineCount(subtitleText, 13.6, width - spacing.screenPadding * 2) - 1) * SUBTITLE_LINE_HEIGHT;

  useEffect(() => {
    if (categoryFilter === 'restaurants' && !isPilotFeatureVisible('explore_restaurants')) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, setCategoryFilter]);

  const sourceVenues = areaVenues ?? venues;
  // The same taxonomy as Home, and a category is offered only if the venues in hand can fill it.
  const exploreCategories = useMemo(
    () =>
      exploreCategoriesFor(sourceVenues ?? []).filter((category) =>
        visibleExploreCategoryIds().includes(category.id),
      ),
    [sourceVenues],
  );
  useEffect(() => {
    if (sourceVenues && !exploreCategories.some((c) => c.id === categoryFilter)) setCategoryFilter('all');
  }, [sourceVenues, exploreCategories, categoryFilter, setCategoryFilter]);

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
      {/* The decoration is the approved Explore frame's own artwork (294:133), drawn from its vectors.
          It sits on the canvas only: the header's marks and the section title's blob and sprigs are
          anchored to the top edge, the foot's blob and wave to the bottom, and the leaves and yellow
          strokes at the foot are drawn again above the list, because the approved frame shows them
          over the cards' photographs. All of it ignores the pointer and assistive technology. */}
      {/* Marks beside the heading, the search and the section title follow the fixed-size type, so they
          are drawn at the reference scale from the left; the leaves and blobs off the right edge follow
          the screen's edge, so they scale with the width and stay on it. */}
      <ScreenArt
        art={EXPLORE_ART_BEHIND}
        from={0}
        to={HEADER_SEAM_PX}
        anchor="top"
        clipX={[0, EDGE_ART_X]}
        width={Math.min(width, 393)}
      />
      {/* Below the heading the marks sit beside the search, the chips and the section title, which all move
          down when the subtitle wraps to a second line; the marks move with them. */}
      <ScreenArt
        art={EXPLORE_ART_BEHIND}
        from={HEADER_SEAM_PX}
        to={760}
        anchor="top"
        clipX={[0, EDGE_ART_X]}
        width={Math.min(width, 393)}
        style={{ top: HEADER_SEAM_PX * (Math.min(width, 393) / EXPLORE_ART_BEHIND.width) + subtitleShift }}
      />
      <ScreenArt art={EXPLORE_ART_BEHIND} from={0} to={760} anchor="top" clipX={[EDGE_ART_X, EXPLORE_ART_BEHIND.width]} align="right" />
      <ScreenArt art={EXPLORE_ART_BEHIND} from={1500} to={1844} anchor="bottom" />
      <View style={styles.header}>
        <Text variant="heading1" style={styles.heading}>Explore London</Text>
        <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
          {subtitleText}
        </Text>
      </View>

      <View style={styles.searchRow}>
        <SearchBar
          variant="explore"
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
      </View>
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
            size="explore"
            tint={railTint(index - 1)}
            onPress={() => setCategoryFilter(category.id)}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingList}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : resultCount === 0 ? (
        <>
        {/* The header, with its Filters link, stays when nothing matches: the empty state suggests loosening
            the filters, so the sheet that holds them must still be reachable. */}
        <View style={styles.listHeader}>
          <SectionHeader
            title={areaVenues ? `Around ${search.trim()}` : activeCategoryLabel}
            subtitle={`0 ${isRestaurantMode ? 'restaurants' : 'places'} ${areaVenues ? 'near this area' : 'across London'}`}
            titleStyle={styles.sectionTitle}
            subtitleStyle={styles.sectionCount}
            actionLabel={activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
            onAction={() => setFilterSheetOpen(true)}
            actionAlign="end"
          />
        </View>
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
        </>
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
            <SectionHeader
              title={areaVenues ? `Around ${search.trim()}` : activeCategoryLabel}
              subtitle={`${resultCount} ${isRestaurantMode ? 'restaurant' : 'place'}${resultCount === 1 ? '' : 's'} ${areaVenues ? 'near this area' : 'across London'}`}
              titleStyle={styles.sectionTitle}
              subtitleStyle={styles.sectionCount}
              // The approved frame's rail is the category chips alone, so filtering is reached through
              // this quiet link on the count line (the count says how many places the filters leave).
              actionLabel={activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
              onAction={() => setFilterSheetOpen(true)}
              actionAlign="end"
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
                tintColor={colors.action}
                colors={[colors.action]}
              />
            }
          />
        </>
      )}

      <ScreenArt art={EXPLORE_ART_FRONT} from={1500} to={1844} anchor="bottom" />
      <FilterSheet visible={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} />
    </ScreenContainer>
  );
}

/** Frame x (of 853) where the right-edge marks begin: the leaves and blobs off the right side. */
const EDGE_ART_X = 690;
/** Frame y (of 1844) under the heading block: the strokes by the title are above it. */
const HEADER_SEAM_PX = 250;
/** The subtitle's line height: the styles and the art shift below both use it. */
const SUBTITLE_LINE_HEIGHT = 17;
const SUBTITLE = 'Parks, museums and family days out across London';
const RESTAURANT_SUBTITLE = 'Family-friendly places to eat';

const styles = StyleSheet.create({
  // Frame 294:133 at pt = px / 2.17: the title Bold 28.4 on a 34.6 line, the subtitle 13.6 on 16.6,
  // the search field 51.6 tall 15 below the subtitle, the chips 15 below the field.
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 2,
  },
  heading: {
    fontSize: 28.4,
    lineHeight: 34.5,
  },
  subtitle: {
    marginTop: 7,
    fontSize: 13.6,
    lineHeight: SUBTITLE_LINE_HEIGHT,
    // When it has to wrap on a narrow phone, split it evenly rather than leave "London" alone on a second line.
    // Web-only (native ignores it); the line count is unchanged, so the art shift below still holds.
    ...({ textWrap: 'balance' } as object),
  },
  searchRow: {
    marginTop: 19,
    marginBottom: spacing.sm,
  },
  search: {
    marginHorizontal: spacing.screenPadding,
  },
  // Section title Bold 26.3 on 31.8; count 13.2.
  sectionTitle: {
    fontSize: 26.3,
    lineHeight: 32,
  },
  sectionCount: {
    fontSize: 13.2,
    lineHeight: 16,
  },
  searchMessage: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.sm,
  },
  // A fixed, non-shrinking band: as a flex child with only a maxHeight the rail was squeezed to
  // 26px (17px once the list scrolled) and clipped the 44pt chips top and bottom.
  categoryScroll: {
    height: EXPLORE_CHIP.height + spacing.sm,
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 2,
  },
  categoryContent: {
    paddingHorizontal: spacing.screenPadding,
    alignItems: 'center',
    gap: EXPLORE_CHIP.gap,
  },
  listHeader: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 14,
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
