import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { VenueCard } from '@/src/components/shared/VenueCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useNearbyVenues } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';

export default function ExploreScreen() {
  const { data: venues } = useNearbyVenues();
  const { filters, toggleFilter } = useFiltersStore();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Explore</Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Places near Bushey
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((filter) => (
          <Chip
            key={filter.id}
            label={filter.label}
            active={filter.active}
            onPress={() => toggleFilter(filter.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.mapPlaceholder}>
        <Ionicons name="map-outline" size={48} color={colors.primary[200]} />
        <Text variant="bodySmall" color={colors.text.tertiary} style={styles.mapLabel}>
          Map view — connect Mapbox in Phase 4
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        <Text variant="heading3" style={styles.listTitle}>
          Nearby
        </Text>
        {venues?.map((venue) => (
          <VenueCard key={venue.id} venue={venue} variant="list" />
        ))}
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
  filterScroll: {
    maxHeight: 48,
    marginTop: spacing.lg,
  },
  filterContent: {
    paddingHorizontal: spacing.screenPadding,
  },
  mapPlaceholder: {
    height: 180,
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.lg,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLabel: {
    marginTop: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['5xl'],
  },
  listTitle: {
    marginBottom: spacing.lg,
  },
});
