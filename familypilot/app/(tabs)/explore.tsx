import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ActiveFilters } from '@/src/components/explore/ActiveFilters';
import { ExploreCardEvidence } from '@/src/components/explore/ExploreCardEvidence';
import { ExploreMap } from '@/src/components/explore/ExploreMap';
import { ExploreSwitch } from '@/src/components/explore/ExploreSwitch';
import { CoverageNote, EmptyExplanation, ListHeading, ToggleRow } from '@/src/components/explore/ExploreStatus';
import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { WhereRow } from '@/src/components/explore/WhereRow';
import { WhereSheet } from '@/src/components/explore/WhereSheet';
import { BrandLockup, BRAND_ROW_TOP } from '@/src/components/navigation/PageHeader';
import { RestaurantCard } from '@/src/components/restaurant/RestaurantCard';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { PlaceCredits } from '@/src/components/shared/PlaceCredits';
import { MAP_OFF_MESSAGE, mapAllowedFor } from '@/src/utils/map-compliance';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, ErrorState, EXPLORE_CHIP, SearchBar, SkeletonCard, Text, railTint } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { isPilotFeatureVisible, visibleExploreCategoryIds } from '@/src/config/pilot-features';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import { useFamilyProfile, useNearbyVenues, useRestaurants } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { usePlanningStore } from '@/src/stores/planning-store';
import { RestaurantDetail } from '@/src/types';
import { familyDisplayName } from '@/src/utils/family-title';
import { buildListItems, ListItem } from '@/src/utils/explore-list';
import { DEFAULT_RADIUS_MILES, formatMiles, homeAnchor, RADIUS_MILES } from '@/src/utils/explore-geo';
import { ResultRow, runExplore } from '@/src/utils/explore-results';
import { exploreCategoriesFor, hasPriceCoverage } from '@/src/utils/filter-venues';
import { SAVED_EXAMPLES_NOTICE, showingSavedExamples } from '@/src/utils/saved-examples-notice';
import { isTravelTimeKnown, travelTimeLabel } from '@/src/utils/travel-time';
import { classify, groupLabel } from '@/src/utils/venue-classification';
import { environmentOf } from '@/src/utils/venue-taxonomy';
import { Venue } from '@/src/types';

/** The first rail of quick filters. Everything else is behind More. */
const QUICK_FILTERS: { id: string; label: string }[] = [
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'open_now', label: 'Open now' },
];
const QUICK_IDS = QUICK_FILTERS.map((f) => f.id);

const ENVIRONMENT_WORDS = { indoor: 'indoor', outdoor: 'outdoor', mixed: 'indoors and out' } as const;

/** "Outdoor", or "Usually outdoor" when only the kind of place says so. Never a confirmed fact unless it is one. */
function environmentWords(venue: Venue): string | null {
  const { environment, confirmed } = environmentOf(venue);
  if (environment === 'unknown') return null;
  const word = ENVIRONMENT_WORDS[environment];
  return confirmed ? `${word[0].toUpperCase()}${word.slice(1)}` : `Usually ${word}`;
}

function metaFor(row: ResultRow): string {
  const parts = [classify(row.venue).label, environmentWords(row.venue), formatMiles(row.miles)];
  if (isTravelTimeKnown(row.driveMinutes)) parts.push(`${travelTimeLabel(row.driveMinutes, 'estimated')} drive (estimated)`);
  return parts.filter(Boolean).join(' · ');
}

export default function ExploreScreen() {
  const isFocused = useIsFocused();
  const tabBarClearance = useTabBarClearance();
  const { data: venues, isLoading: venuesLoading, isError: venuesError, refetch: refetchVenues } = useNearbyVenues();
  const { data: restaurants, isLoading: restaurantsLoading, isError: restaurantsError, refetch: refetchRestaurants } = useRestaurants();
  const { data: profile } = useFamilyProfile();

  const {
    categoryFilter, exploreBudget, advancedFilters, filterSheetOpen, exploreScope, exploreView, exploreRadius, exploreQuery, exploreAnchor, exploreShowHidden,
    setCategoryFilter, setFilterSheetOpen, toggleAdvancedFilter, setExploreBudget, setExploreScope, setExploreView, setExploreRadius, setExploreQuery,
    setExploreAnchor, setExploreShowHidden, clearAllExplore, clearAdvancedFilters,
  } = useFiltersStore();

  const isRestaurantMode = categoryFilter === 'restaurants' && isPilotFeatureVisible('explore_restaurants');
  useEffect(() => {
    if (categoryFilter === 'restaurants' && !isPilotFeatureVisible('explore_restaurants')) setCategoryFilter('all');
  }, [categoryFilter, setCategoryFilter]);

  const planningFamilies = usePlanningStore((s) => s.families);
  const planningWith = usePlanningStore((s) => s.planningWith ?? null);
  const setPlanningWith = usePlanningStore((s) => s.setPlanningWith);
  const together = planningWith ? planningFamilies.find((f) => f.id === planningWith) ?? null : null;

  const [whereOpen, setWhereOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [showNotChecked, setShowNotChecked] = useState(false);
  const [mapSelected, setMapSelected] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const home = useMemo(() => homeAnchor(profile), [profile]);
  const anchor = exploreAnchor ?? home;
  const priceFiltersAvailable = useMemo(() => hasPriceCoverage(venues ?? []), [venues]);

  // The groups are offered from everything FamilyPilot knows (each only with at least three places in hand), not from what
  // is near, so a parent can always ask for soft play and be told honestly how few there are near them.
  const categories = useMemo(
    () => exploreCategoriesFor(venues ?? []).filter((category) => visibleExploreCategoryIds().includes(category.id)),
    [venues],
  );
  useEffect(() => {
    if (venues && !categories.some((c) => c.id === categoryFilter)) setCategoryFilter('all');
  }, [venues, categories, categoryFilter, setCategoryFilter]);

  const result = useMemo(
    () =>
      venues && !isRestaurantMode
        ? runExplore(venues, {
            anchor, scope: exploreScope, radius: exploreRadius, query: exploreQuery, category: categoryFilter,
            advanced: advancedFilters, budget: exploreBudget, priceFiltersAvailable,
          })
        : null,
    [venues, isRestaurantMode, anchor, exploreScope, exploreRadius, exploreQuery, categoryFilter, advancedFilters, exploreBudget, priceFiltersAvailable],
  );

  const items = useMemo(
    () => (result ? buildListItems(result, { radius: exploreRadius, scope: exploreScope, showHidden: exploreShowHidden, showNotChecked }) : []),
    [result, exploreRadius, exploreScope, exploreShowHidden, showNotChecked],
  );

  const mapRows = useMemo(() => (result ? [...result.matches, ...result.also.flatMap((g) => g.rows)] : []), [result]);
  // Google's Places terms do not allow Places content on a map that is not Google's, and this map is drawn on the device. So the Map is
  // offered only when every place it would show is independently located (utils/map-compliance.ts); otherwise the screen is the list.
  const canMap = mapAllowedFor(mapRows.map((r) => r.venue));
  const shownView: 'list' | 'map' = canMap ? exploreView : 'list';
  const selectedRow = mapRows.find((row) => row.venue.id === mapSelected) ?? mapRows[0];
  const selectedIndex = selectedRow ? mapRows.indexOf(selectedRow) : -1;

  const removeChip = (id: string) => {
    if (id.startsWith('category:')) setCategoryFilter('all');
    else if (id.startsWith('filter:')) toggleAdvancedFilter(id.slice('filter:'.length));
    else if (id === 'budget') setExploreBudget('any');
    else if (id === 'radius') setExploreRadius(DEFAULT_RADIUS_MILES);
  };
  const relax = (id: string) => {
    if (id === 'category') setCategoryFilter('all');
    else if (id.startsWith('filter:')) toggleAdvancedFilter(id.slice('filter:'.length));
    else if (id === 'query') setExploreQuery('');
    else if (id.startsWith('radius:')) setExploreRadius(Number(id.slice('radius:'.length)) as (typeof RADIUS_MILES)[number]);
    else if (id === 'scope') setExploreScope('all');
  };
  const chooseDistance = (value: number | 'any') => {
    if (value === 'any') setExploreScope('all');
    else {
      setExploreScope('nearby');
      setExploreRadius(value as (typeof RADIUS_MILES)[number]);
    }
    setRadiusOpen(false);
  };

  const isLoading = isRestaurantMode ? restaurantsLoading : venuesLoading;
  const isError = isRestaurantMode ? restaurantsError : venuesError;
  const refetch = isRestaurantMode ? refetchRestaurants : refetchVenues;
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const moreCount = advancedFilters.filter((id) => !QUICK_IDS.includes(id)).length + (exploreBudget !== 'any' ? 1 : 0);
  const filterCount = advancedFilters.length + (exploreBudget !== 'any' ? 1 : 0);
  const distanceLabel = exploreScope === 'all' ? 'Any distance' : `Within ${exploreRadius} miles`;

  if (isError && !venues) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={() => void refetch()} />
      </ScreenContainer>
    );
  }

  const header = (
    <>
      <View style={styles.brandRow}>
        <BrandLockup testID="explore-brand-row" gap={0} />
      </View>
      <View style={styles.header}>
        <Text variant="heading1" accessibilityRole="header" style={styles.heading} testID="explore-title">Explore</Text>
        {together ? (
          <View style={styles.planningWithRow} testID="explore-planning-with">
            <View style={styles.planningWithPill}>
              <Text variant="caption" style={styles.planningWithText} numberOfLines={1}>Planning with {familyDisplayName(together.label)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Done planning with ${familyDisplayName(together.label)}`} onPress={() => setPlanningWith(null)} style={styles.planningWithDone} testID="explore-planning-with-done">
              <Text variant="caption" style={styles.planningWithDoneText} numberOfLines={1}>Done</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );

  // ---- Restaurants (a separate mode behind a pilot flag): its own list, its own filters.
  if (isRestaurantMode) {
    return (
      <ScreenContainer>
        {header}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
          {categories.map((category, index) => (
            <Chip key={category.id} label={category.label} active={categoryFilter === category.id} appearance="plain" size="explore" tint={railTint(index - 1)} onPress={() => setCategoryFilter(category.id)} />
          ))}
        </ScrollView>
        {isLoading ? (
          <View style={styles.loadingList}><SkeletonCard /><SkeletonCard /></View>
        ) : (restaurants?.length ?? 0) === 0 ? (
          <EmptyState icon="search-outline" title="No restaurants found" message="Try adjusting your filters or explore a wider area." actionLabel="Clear filters" onAction={() => { clearAllExplore(); setCategoryFilter('restaurants'); }} />
        ) : (
          <FlatList
            data={restaurants ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => <RestaurantCard restaurant={item as RestaurantDetail} index={index} />}
            ListHeaderComponent={
              <Pressable accessibilityRole="button" accessibilityLabel={filterCount > 0 ? `Filters (${filterCount})` : 'Filters'} onPress={() => setFilterSheetOpen(true)} style={styles.filtersLink}>
                <Text variant="link">{filterCount > 0 ? `Filters (${filterCount})` : 'Filters'}</Text>
              </Pressable>
            }
            ListFooterComponent={<View style={styles.credits}><PlaceCredits places={restaurants ?? []} /></View>}
            contentContainerStyle={[styles.restaurantList, { paddingBottom: tabBarClearance }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.action} colors={[colors.action]} />}
          />
        )}
        <FilterSheet visible={filterSheetOpen && isFocused} onClose={() => setFilterSheetOpen(false)} priceFiltersAvailable={false} />
      </ScreenContainer>
    );
  }

  const matchCount = result ? result.matches.length + result.also.reduce((n, g) => n + g.rows.length, 0) : 0;
  const nothing = Boolean(result) && matchCount === 0 && (result?.outside.length ?? 0) === 0;
  const thinNearby = Boolean(result) && exploreScope === 'nearby' && result!.inScope > 0 && result!.inScope < 10;
  const countText = !result
    ? ''
    : `${result.interpretation ? `${result.interpretation}: ` : categoryFilter !== 'all' ? `${groupLabel(categoryFilter as never)}: ` : ''}${matchCount} ${matchCount === 1 ? 'place' : 'places'}${
        exploreScope === 'nearby' ? ` within ${exploreRadius} miles` : ''
      } · ranked by Family Fit${exploreScope === 'all' ? `, then distance` : ''}`;

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    let row;
    if (item.type === 'heading') row = <ListHeading text={item.text} testID={item.testID} />;
    else if (item.type === 'toggle') {
      row = (
        <ToggleRow
          text={item.text}
          actionLabel={item.actionLabel}
          testID={item.testID}
          onPress={() => (item.kind === 'hidden' ? setExploreShowHidden(!exploreShowHidden) : setShowNotChecked(!showNotChecked))}
        />
      );
    } else {
      row = (
        <DecisionCard
          venue={item.row.venue}
          variant="list"
          index={index}
          metaLine={metaFor(item.row)}
          extra={<ExploreCardEvidence venue={item.row.venue} reason={item.row.reason} />}
          testID={`explore-card-${item.row.venue.id}`}
        />
      );
    }
    return <View style={styles.row}>{row}</View>;
  };

  const listHeader = result ? (
    <View>
      {!isLoading && showingSavedExamples(venues) ? (
        <Text variant="caption" color={colors.warning[600]} style={styles.savedNotice}>{SAVED_EXAMPLES_NOTICE}</Text>
      ) : null}
      {nothing ? (
        <EmptyExplanation
          scope={exploreScope}
          radius={exploreRadius}
          coverage={result.coverage}
          filterCount={filterCount + (categoryFilter !== 'all' ? 1 : 0) + (exploreQuery.trim() ? 1 : 0)}
          relaxations={result.relaxations}
          onRelax={relax}
          onClearAll={() => { clearAllExplore(); setShowNotChecked(false); }}
        />
      ) : thinNearby ? (
        <CoverageNote count={result.inScope} radius={exploreRadius} onSearchAll={() => setExploreScope('all')} />
      ) : null}
    </View>
  ) : null;

  // EVERYTHING ABOVE THE RESULTS SCROLLS WITH THEM. The heading, the mode, where you are looking from, the search, the groups, the quick
  // filters, the chips and the count are one block at the top of the list (an element, not a component, so typing in the search never
  // remounts it). Pinned, they took more than half of a small phone and left one card of room; scrolling, the results have the whole
  // screen, and the block is one swipe back up.
  const top = (
    <>
      {header}

      <View style={styles.controls}>
        <ExploreSwitch scope={exploreScope} onChange={setExploreScope} />
        <WhereRow
          title={exploreScope === 'nearby' ? anchor.label : 'All of London'}
          detail={
            exploreScope === 'nearby'
              ? anchor.detail
              : `The places FamilyPilot knows: ${result ? `about ${result.located.length}` : 'loading'} so far. Distances from ${anchor.label.replace(/^Near /, '')}.`
          }
          onChange={() => setWhereOpen(true)}
        />
        <SearchBar
          variant="explore"
          value={exploreQuery}
          onChangeText={setExploreQuery}
          placeholder="Search places, or try “soft play”"
          accessibilityLabel="Search places by name or kind"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
        {categories.map((category, index) => (
          <Chip key={category.id} label={category.label} active={categoryFilter === category.id} appearance="plain" size="explore" tint={railTint(index - 1)} onPress={() => setCategoryFilter(category.id)} testID={`explore-category-${category.id}`} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll} contentContainerStyle={styles.categoryContent}>
        <Chip label={`${distanceLabel}${radiusOpen ? ' ▴' : ' ▾'}`} active={exploreScope === 'nearby' && exploreRadius !== DEFAULT_RADIUS_MILES} appearance="outlined" size="explore" onPress={() => setRadiusOpen(!radiusOpen)} testID="explore-distance-chip" />
        {QUICK_FILTERS.map((filter) => (
          <Chip key={filter.id} label={filter.label} active={advancedFilters.includes(filter.id)} appearance="outlined" size="explore" onPress={() => toggleAdvancedFilter(filter.id)} testID={`explore-quick-${filter.id}`} />
        ))}
        <Chip label={moreCount > 0 ? `More (${moreCount})` : 'More'} active={moreCount > 0} appearance="outlined" size="explore" onPress={() => setFilterSheetOpen(true)} testID="explore-more" />
      </ScrollView>

      {radiusOpen ? (
        <View style={styles.radiusRow} accessibilityRole="radiogroup" accessibilityLabel="How far" testID="explore-radius-row">
          {([2, 5, 10, 'any'] as const).map((value) => {
            const active = value === 'any' ? exploreScope === 'all' : exploreScope === 'nearby' && exploreRadius === value;
            return (
              <Pressable
                key={String(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                aria-checked={active}
                accessibilityLabel={value === 'any' ? 'Any distance, search all' : `Within ${value} miles`}
                onPress={() => chooseDistance(value)}
                style={[styles.radiusOption, active && styles.radiusOptionOn]}
                testID={`explore-radius-${value}`}
              >
                <Text style={[styles.radiusText, active && styles.radiusTextOn]}>{value === 'any' ? 'Any distance' : `${value} miles`}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {result ? <ActiveFilters chips={result.activeFilters} onRemove={removeChip} onClearAll={() => { clearAllExplore(); setShowNotChecked(false); }} /> : null}

      {isLoading || !result ? (
        <View style={styles.loadingList}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <View style={styles.countRow}>
          <Text variant="caption" color={colors.text.secondary} style={styles.countText} accessibilityLiveRegion="polite" testID="explore-count">{countText}</Text>
          {canMap ? (
          <View style={styles.viewToggle} accessibilityRole="radiogroup" accessibilityLabel="Show as">
            {(['list', 'map'] as const).map((view) => (
              <Pressable
                key={view}
                accessibilityRole="radio"
                accessibilityState={{ checked: exploreView === view }}
                aria-checked={exploreView === view}
                accessibilityLabel={view === 'list' ? 'List' : 'Map'}
                onPress={() => setExploreView(view)}
                style={[styles.viewSeg, exploreView === view && styles.viewSegOn]}
                testID={`explore-view-${view}`}
              >
                <Text style={[styles.viewSegText, exploreView === view && styles.viewSegTextOn]}>{view === 'list' ? 'List' : 'Map'}</Text>
              </Pressable>
            ))}
          </View>
          ) : null}
        </View>
      )}
      {!isLoading && result && !canMap ? (
        <Text variant="caption" color={colors.text.secondary} style={styles.mapOff} testID="explore-map-off">{MAP_OFF_MESSAGE}</Text>
      ) : null}
      {!isLoading && result ? listHeader : null}
    </>
  );

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.action} colors={[colors.action]} />;
  const shown = [...(result?.matches ?? []), ...(result?.also.flatMap((g) => g.rows) ?? [])];

  return (
    <ScreenContainer>
      {shownView === 'map' && result && !isLoading ? (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarClearance }} showsVerticalScrollIndicator={false} refreshControl={refresh}>
          {top}
          <View style={styles.mapContent}>
            {mapRows.length > 0 ? (
              <>
                <ExploreMap
                  anchor={anchor}
                  radiusMiles={exploreScope === 'nearby' ? exploreRadius : null}
                  places={mapRows.map((r) => ({ id: r.venue.id, name: r.venue.name, latitude: r.venue.latitude, longitude: r.venue.longitude }))}
                  selectedId={selectedRow?.venue.id}
                  onSelect={setMapSelected}
                />
                {selectedRow ? (
                  <View style={styles.selected} testID="explore-map-selected">
                    <Text variant="caption" color={colors.text.secondary} style={styles.selectedCount}>{selectedIndex + 1} of {mapRows.length} · same list, same filters</Text>
                    <DecisionCard
                      venue={selectedRow.venue}
                      variant="list"
                      metaLine={metaFor(selectedRow)}
                      extra={<ExploreCardEvidence venue={selectedRow.venue} reason={selectedRow.reason} />}
                      testID={`explore-card-${selectedRow.venue.id}`}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            <View style={styles.credits}><PlaceCredits places={mapRows.map((r) => r.venue)} /></View>
          </View>
        </ScrollView>
      ) : (
        // A FlatList, not a ScrollView with `.map`: every row carries a photograph, and every photograph a parent never sees is
        // money (each uncached one is a Place Details and a Place Photos request). Windowing keeps unseen rows out of the tree.
        <FlatList
          data={isLoading || !result ? [] : items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          extraData={[exploreShowHidden, showNotChecked]}
          ListHeaderComponent={top}
          ListFooterComponent={<View style={styles.credits}><PlaceCredits places={shown.map((r) => r.venue)} /></View>}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          windowSize={3}
          removeClippedSubviews={false}
          refreshControl={refresh}
        />
      )}

      <FilterSheet visible={filterSheetOpen && isFocused} onClose={() => setFilterSheetOpen(false)} priceFiltersAvailable={hasPriceCoverage(venues ?? [])} />
      <WhereSheet visible={whereOpen && isFocused} onClose={() => setWhereOpen(false)} home={home} current={anchor} onChoose={setExploreAnchor} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brandRow: { paddingTop: BRAND_ROW_TOP },
  header: { paddingHorizontal: spacing.screenPadding, paddingTop: 2 },
  heading: { fontSize: 28.4, lineHeight: 34.5 },
  planningWithRow: { height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  planningWithPill: { flexShrink: 1, height: 36, justifyContent: 'center', backgroundColor: colors.actionSoft, borderRadius: radius.full, paddingHorizontal: spacing.md },
  planningWithText: { color: colors.action, fontFamily: 'Inter_600SemiBold' },
  planningWithDone: { flexShrink: 0, minHeight: MIN_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm },
  planningWithDoneText: { color: colors.action, fontFamily: 'Inter_600SemiBold' },
  controls: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, gap: spacing.sm },
  categoryScroll: { height: EXPLORE_CHIP.height + spacing.sm, flexGrow: 0, flexShrink: 0, marginTop: spacing.sm },
  quickScroll: { height: EXPLORE_CHIP.height + spacing.xs, flexGrow: 0, flexShrink: 0 },
  categoryContent: { paddingHorizontal: spacing.screenPadding, alignItems: 'center', gap: EXPLORE_CHIP.gap },
  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm },
  radiusOption: { minHeight: MIN_TARGET, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  radiusOptionOn: { backgroundColor: colors.action, borderColor: colors.action },
  radiusText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 18, color: colors.text.primary },
  radiusTextOn: { color: colors.text.inverse },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm },
  countText: { flex: 1 },
  mapOff: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.xs },
  viewToggle: { flexDirection: 'row', backgroundColor: colors.borderLight, borderRadius: radius.full, padding: 3 },
  viewSeg: { minHeight: MIN_TARGET, minWidth: MIN_TARGET + 8, paddingHorizontal: spacing.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  viewSegOn: { backgroundColor: colors.action },
  viewSegText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.text.secondary },
  viewSegTextOn: { color: colors.text.inverse },
  savedNotice: { marginHorizontal: spacing.screenPadding, marginBottom: spacing.sm },
  listContent: {},
  row: { paddingHorizontal: spacing.screenPadding },
  restaurantList: { paddingHorizontal: spacing.screenPadding },
  mapContent: { paddingHorizontal: spacing.screenPadding, gap: spacing.md, paddingTop: spacing.sm },
  selected: { gap: spacing.xs },
  selectedCount: { paddingTop: spacing.xs },
  filtersLink: { minHeight: MIN_TARGET, justifyContent: 'center', alignSelf: 'flex-end' },
  credits: { paddingTop: spacing.sm, alignItems: 'center' },
  loadingList: { paddingHorizontal: spacing.screenPadding, gap: spacing.lg, paddingTop: spacing.lg },
});
