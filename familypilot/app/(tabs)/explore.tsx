import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, ErrorState, SectionHeader, SkeletonCard, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { buildExploreEditorialSections } from '@/src/utils/explore-editorial-sections';
import { EXPLORE_CATEGORIES, filterVenues } from '@/src/utils/filter-venues';

export default function ExploreScreen() {
  const { data: venues, isLoading, isError, refetch } = useNearbyVenues();
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

  const filteredVenues = useMemo(
    () =>
      venues
        ? filterVenues(
            venues,
            categoryFilter,
            advancedFilters,
            exploreMaxDrive,
            profile?.maxDriveMinutes ?? 30,
            exploreBudget,
          )
        : [],
    [venues, categoryFilter, advancedFilters, exploreMaxDrive, exploreBudget, profile?.maxDriveMinutes],
  );

  const useEditorialLayout =
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

  if (isError) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={() => void refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Explore</Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          Curated places for your family
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {EXPLORE_CATEGORIES.map((category) => (
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
      ) : filteredVenues.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No places found"
          message="Try a different category or adjust your filters."
          actionLabel="Clear filters"
          onAction={() => {
            setCategoryFilter('all');
            resetExploreFilters();
          }}
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
              title={activeCategoryLabel}
              subtitle={`${filteredVenues.length} place${filteredVenues.length === 1 ? '' : 's'} near you`}
            />
          </View>
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {filteredVenues.map((venue, index) => (
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
  categoryScroll: {
    maxHeight: 52,
    marginTop: spacing.lg,
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
