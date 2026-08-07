import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { EatNearbyCompactCard } from '@/src/components/restaurant/EatNearbyCompactCard';
import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { useEatNearby } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { EatNearbyRecommendation } from '@/src/types';

interface EatNearbySectionProps {
  activityVenueId: string;
  activityVenueName: string;
  /** Static fallback when service unavailable */
  fallback?: EatNearbyRecommendation[];
}

export function EatNearbySection({
  activityVenueId,
  activityVenueName,
  fallback = [],
}: EatNearbySectionProps) {
  const router = useRouter();
  const setCategoryFilter = useFiltersStore((s) => s.setCategoryFilter);
  const { data, isLoading, isError } = useEatNearby(activityVenueId);

  const recommendations = data ?? fallback;

  const openRestaurantExplore = () => {
    setCategoryFilter('restaurants');
    router.push('/(tabs)/explore' as never);
  };

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text variant="heading3" style={styles.title}>
          Good places to eat nearby
        </Text>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.section}>
        <Text variant="heading3" style={styles.title}>
          Eat nearby
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          Restaurant suggestions are temporarily unavailable.
        </Text>
      </View>
    );
  }

  if (recommendations.length === 0) {
    return (
      <View style={styles.section}>
        <Text variant="heading3" style={styles.title}>
          Eat nearby
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.emptyText}>
          We couldn&apos;t find a strong family-friendly option nearby after your visit to{' '}
          {activityVenueName}.
        </Text>
        <Button
          label="Explore restaurants"
          variant="outline"
          onPress={openRestaurantExplore}
          style={styles.emptyCta}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text variant="heading3" style={styles.title}>
        After your visit
      </Text>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
        Good places to eat near {activityVenueName}
      </Text>
      {recommendations.map((rec) => (
        <EatNearbyCompactCard
          key={rec.restaurantId}
          recommendation={rec}
          activityVenueId={activityVenueId}
        />
      ))}
      <Pressable
        onPress={openRestaurantExplore}
        accessibilityRole="button"
        accessibilityLabel="See all nearby restaurants"
        style={styles.seeAll}
      >
        <Text variant="bodySmall" color={colors.primary[500]}>
          See all nearby restaurants
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing['2xl'],
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  emptyText: {
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  emptyCta: {
    alignSelf: 'flex-start',
  },
  seeAll: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
