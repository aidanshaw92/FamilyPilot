import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { SavedPlaceRow } from '@/src/components/shared/SavedPlaceRow';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, EmptyState, Text } from '@/src/components/ui';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useSavedItems } from '@/src/hooks/use-queries';
import { useSavedStore } from '@/src/stores/saved-store';
import { SavedGroup, SavedItem } from '@/src/types';

type SortOption = 'recent' | 'closest' | 'match';
type TypeFilter = 'all' | 'places' | 'restaurants';

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'places', label: 'Places' },
  { id: 'restaurants', label: 'Restaurants' },
].filter(
  (filter) => filter.id !== 'restaurants' || isPilotFeatureVisible('saved_restaurants'),
);

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'closest', label: 'Closest' },
  { id: 'match', label: 'Best match' },
];

const SAVED_GROUPS: { id: SavedGroup; label: string }[] = [
  { id: 'want', label: 'Want to go' },
  { id: 'favourite', label: 'Favourites' },
  { id: 'been', label: 'Been before' },
];

export default function SavedScreen() {
  const { data: savedItems, isLoading } = useSavedItems();
  const { savedIds } = useSavedStore();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('recent');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [removedId, setRemovedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let items = savedItems ?? [];
    if (typeFilter === 'places') {
      items = items.filter((item) => item.type === 'place');
    } else if (typeFilter === 'restaurants') {
      items = items.filter((item) => item.type === 'restaurant');
    }
    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter((item) => item.venue.name.toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => {
      if (sort === 'closest') return a.venue.driveMinutes - b.venue.driveMinutes;
      if (sort === 'match') return b.venue.familyScore.score - a.venue.familyScore.score;
      return savedIds.has(b.venue.id) === savedIds.has(a.venue.id) ? 0 : 1;
    });
  }, [savedItems, search, sort, savedIds, typeFilter]);

  const groupedSections = useMemo(() => {
    if (search.trim()) return null;
    const byGroup = new Map<SavedGroup, SavedItem[]>();
    for (const item of filteredItems) {
      const group = item.group ?? 'want';
      const list = byGroup.get(group) ?? [];
      list.push(item);
      byGroup.set(group, list);
    }
    return SAVED_GROUPS.filter((section) => byGroup.has(section.id)).map((section) => ({
      ...section,
      items: byGroup.get(section.id) ?? [],
    }));
  }, [filteredItems, search]);

  const isEmpty = !isLoading && filteredItems.length === 0;

  const handleUndo = () => {
    if (removedId) {
      useSavedStore.getState().toggleSaved(removedId);
      setRemovedId(null);
    }
  };

  const renderItem = (item: SavedItem) => (
    <SavedPlaceRow
      key={item.id}
      venue={item.venue}
      itemType={item.type}
      onRemoved={(id) => {
        setRemovedId(id);
        setTimeout(() => setRemovedId(null), 5000);
      }}
    />
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Saved</Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          Places your family wants to remember
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search saved places"
          placeholderTextColor={colors.text.tertiary}
          style={styles.searchInput}
          accessibilityLabel="Search saved places"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
      >
        {TYPE_FILTERS.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            active={typeFilter === option.id}
            onPress={() => setTypeFilter(option.id)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
      >
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            active={sort === option.id}
            onPress={() => setSort(option.id)}
          />
        ))}
      </ScrollView>

      {removedId ? (
        <View style={styles.undoBar}>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Place removed
          </Text>
          <Pressable onPress={handleUndo} accessibilityRole="button" accessibilityLabel="Undo remove">
            <Text variant="bodySmall" color={colors.primary[500]}>
              Undo
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <EmptyState
            icon="heart-outline"
            title="Nothing saved yet"
            message="Tap the heart on any place to save it for later."
          />
        ) : groupedSections ? (
          groupedSections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text variant="heading3" style={styles.sectionTitle}>
                {section.label}
              </Text>
              {section.items.map(renderItem)}
            </View>
          ))
        ) : (
          filteredItems.map(renderItem)
        )}
      </ScrollView>
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
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.text.primary,
  },
  sortRow: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  undoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
});
