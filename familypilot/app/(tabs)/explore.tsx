import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FilterSheet } from '@/src/components/explore/FilterSheet';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, ErrorState, SkeletonCard, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { timing } from '@/src/design-system/animations/presets';
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
  const [showMap, setShowMap] = useState(true);
  const mapHeight = useSharedValue(200);

  const filteredVenues = useMemo(
    () => (venues ? filterVenues(venues, primaryFilter, advancedFilters) : []),
    [venues, primaryFilter, advancedFilters],
  );

  const toggleMap = useCallback(() => {
    setShowMap((prev) => {
      mapHeight.value = withTiming(prev ? 80 : 200, timing.normal);
      return !prev;
    });
  }, [mapHeight]);

  const mapAnimatedStyle = useAnimatedStyle(() => ({
    height: mapHeight.value,
  }));

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
        <Text variant="bodySmall" style={styles.subtitle}>
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
          <Ionicons name="options-outline" size={18} color={colors.primary[500]} />
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

      <Pressable onPress={toggleMap} accessibilityRole="button" accessibilityLabel="Toggle map">
        <Animated.View style={[styles.mapArea, mapAnimatedStyle]}>
          <Ionicons name="map-outline" size={showMap ? 40 : 24} color={colors.primary[200]} />
          <Text variant="caption" color={colors.text.tertiary} style={styles.mapLabel}>
            {showMap ? 'Map view — Phase 4' : 'Tap to expand map'}
          </Text>
        </Animated.View>
      </Pressable>

      <View style={styles.listHeader}>
        <Text variant="heading3">
          {PRIMARY_FILTERS.find((f) => f.id === primaryFilter)?.label ?? 'Results'}
        </Text>
        <Pressable onPress={toggleMap}>
          <Text variant="bodySmall" color={colors.primary[500]}>
            {showMap ? 'Hide map' : 'Show map'}
          </Text>
        </Pressable>
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
    paddingVertical: spacing.sm,
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
  mapArea: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mapLabel: {
    marginTop: spacing.sm,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  loadingList: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.lg,
  },
});
