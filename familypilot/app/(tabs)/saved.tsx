import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceTile } from '@/src/components/shared/PlaceTile';
import {
  EmptyState,
  PillSelector,
  SearchBar,
  SectionHeader,
  Skeleton,
  Text,
} from '@/src/components/ui';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors, layout, radius, spacing } from '@/src/design-system/tokens';
import { useSavedItems } from '@/src/hooks/use-queries';
import { SavedGroup, SavedItem } from '@/src/types';
import { getCardSignals } from '@/src/utils/family-signals';
import { formatCategory } from '@/src/utils/format-category';

type SortOption = 'recent' | 'closest' | 'match';

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'places', label: 'Places' },
  ...(isPilotFeatureVisible('saved_restaurants') ? [{ id: 'restaurants', label: 'Restaurants' }] : []),
];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'closest', label: 'Closest' },
  { id: 'match', label: 'Best fit' },
];

const SAVED_GROUPS: { id: SavedGroup; label: string }[] = [
  { id: 'want', label: 'Want to go' },
  { id: 'favourite', label: 'Favourites' },
  { id: 'been', label: 'Been before' },
];

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: savedItems, isLoading, refetch } = useSavedItems();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('recent');
  const [typeFilter, setTypeFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const items = useMemo(() => {
    let rows = savedItems ?? [];
    if (typeFilter === 'places') rows = rows.filter((item) => item.type === 'place');
    else if (typeFilter === 'restaurants') rows = rows.filter((item) => item.type === 'restaurant');
    if (search.trim()) {
      const query = search.toLowerCase();
      rows = rows.filter((item) => item.venue.name.toLowerCase().includes(query));
    }
    return [...rows].sort((a, b) => {
      if (sort === 'closest') return a.venue.driveMinutes - b.venue.driveMinutes;
      if (sort === 'match') return b.venue.familyScore.score - a.venue.familyScore.score;
      return (b.savedAt ?? '').localeCompare(a.savedAt ?? '');
    });
  }, [savedItems, typeFilter, search, sort]);

  const groups = SAVED_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => (item.group ?? 'want') === group.id),
  })).filter((group) => group.items.length > 0);

  const detailPath = (item: SavedItem) =>
    item.type === 'restaurant' ? `/restaurant/${item.venue.id}` : `/venue/${item.venue.id}`;

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
          <Text variant="display">Saved</Text>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.sub}>
            Places your family wants to remember
          </Text>

          {(savedItems?.length ?? 0) > 0 ? (
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search saved places"
              style={styles.search}
            />
          ) : null}
        </View>

        {(savedItems?.length ?? 0) > 0 ? (
          <>
            {/* A type rail with one real choice is just chrome, so it only appears once
                restaurants are part of the build. */}
            {TYPE_FILTERS.length > 2 ? (
              <PillSelector
                options={TYPE_FILTERS}
                value={typeFilter}
                onChange={setTypeFilter}
                accessibilityLabel="Saved types"
                style={styles.rail}
                contentStyle={styles.railContent}
              />
            ) : null}
            <PillSelector
              options={SORT_OPTIONS}
              value={sort}
              onChange={(id) => setSort(id as SortOption)}
              accessibilityLabel="Sort saved places"
              style={TYPE_FILTERS.length > 2 ? styles.railTight : styles.railSolo}
              contentStyle={styles.railContent}
            />
          </>
        ) : null}

        <View style={styles.gutter}>
          {isLoading ? (
            <>
              <Skeleton height={248} borderRadius={radius['2xl']} style={styles.skeleton} />
              <Skeleton height={248} borderRadius={radius['2xl']} />
            </>
          ) : null}

          {!isLoading && (savedItems?.length ?? 0) === 0 ? (
            <EmptyState
              icon="heart-outline"
              title="Nothing saved yet"
              message="Tap the heart on any place to keep it here for later."
              actionLabel="Find somewhere to go"
              onAction={() => router.push('/(tabs)/explore' as never)}
            />
          ) : null}

          {!isLoading && (savedItems?.length ?? 0) > 0 && items.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Nothing matches"
              message="Try a different search or filter."
              actionLabel="Clear search"
              onAction={() => {
                setSearch('');
                setTypeFilter('all');
              }}
            />
          ) : null}

          {groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <SectionHeader title={group.label} />
              {group.items.map((item) => (
                <PlaceTile
                  key={item.id}
                  id={item.venue.id}
                  name={item.venue.name}
                  imageUrl={item.venue.imageUrl}
                  category={item.venue.category}
                  meta={`${formatCategory(item.venue.category)} · ${item.venue.driveMinutes} min away`}
                  detail={
                    getCardSignals(item.venue, 4)
                      .slice(1)
                      .map((signal) => signal.label)
                      .join(' · ') || undefined
                  }
                  score={item.venue.familyScore.score}
                  enrichmentStatus={item.venue.enrichmentStatus}
                  saveVenue={item.venue}
                  onPress={() => router.push(detailPath(item) as never)}
                  imageHeight={172}
                  style={styles.tile}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
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
  },
  railTight: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  railSolo: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  railContent: {
    paddingLeft: spacing.screenPadding,
  },
  skeleton: {
    marginBottom: spacing.lg,
  },
  group: {
    marginBottom: spacing.xl,
  },
  tile: {
    marginBottom: spacing.lg,
  },
});
