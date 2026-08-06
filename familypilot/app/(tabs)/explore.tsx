import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, ErrorState, SectionHeader, SkeletonCard, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useNearbyVenues } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { filterVenues, PRIMARY_FILTERS } from '@/src/utils/filter-venues';
import { Venue } from '@/src/types';

export default function ExploreScreen() {
  const { data: venues, isLoading, isError, refetch } = useNearbyVenues();
  const {
    primaryFilter,
    advancedFilters,
    filterSheetOpen,
    setPrimaryFilter,
    setFilterSheetOpen,
  } = useFiltersStore();

  const filteredVenues = useMemo(
    () => (venues ? filterVenues(venues, primaryFilter, advancedFilters) : []),
    [venues, primaryFilter, advancedFilters],
  );

  const activeFilterLabel =
    PRIMARY_FILTERS.find((f) => f.id === primaryFilter)?.label ?? 'Results';

  const renderItem = useCallback(
    ({ item, index }: { item: Venue; index: number }) => (
      <DecisionCard venue={item} variant="list" index={index} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: Venue) => item.id, []);

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
          {filteredVenues.length} places near you
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {PRIMARY_FILTERS.map((filter) => (
          <Chip
            key={filter.id}
            label={filter.label}
            active={primaryFilter === filter.id}
            onPress={() => setPrimaryFilter(filter.id)}
          />
        ))}
        <Pressable
          style={styles.moreFilters}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="More filters"
        >
          <Text variant="bodySmall" color={colors.primary[500]}>
            More
          </Text>
          {advancedFilters.length > 0 ? (
            <View style={styles.filterBadge}>
              <Text variant="caption" color={colors.text.inverse}>
                {advancedFilters.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      <View style={styles.listToggleRow}>
        <Text variant="caption" color={colors.text.tertiary}>
          List view
        </Text>
        <View style={styles.mapToggleDisabled} accessibilityState={{ disabled: true }}>
          <Text variant="caption" color={colors.text.tertiary}>
            Map (coming soon)
          </Text>
        </View>
      </View>

      <View style={styles.listHeader}>
        <SectionHeader
          title={activeFilterLabel}
          subtitle={`${filteredVenues.length} result${filteredVenues.length === 1 ? '' : 's'}`}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingList}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : filteredVenues.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No places found"
          message="Try a different filter or expand your search area."
          actionLabel="Clear filters"
          onAction={() => {
            setPrimaryFilter('popular');
            useFiltersStore.getState().clearAdvancedFilters();
          }}
        />
      ) : (
        <FlatList
          data={filteredVenues}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
        />
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
  filterScroll: {
    maxHeight: 52,
    marginTop: spacing.lg,
  },
  filterContent: {
    paddingHorizontal: spacing.screenPadding,
    alignItems: 'center',
  },
  moreFilters: {
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
  listToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing.md,
  },
  mapToggleDisabled: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.borderLight,
    opacity: 0.7,
  },
  listHeader: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  loadingList: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.lg,
  },
});
