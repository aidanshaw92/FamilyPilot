import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { RestaurantDetail } from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';
import { restaurantFeatureHighlights } from '@/src/services/scoring/restaurant-score';

interface RestaurantCardProps {
  restaurant: RestaurantDetail;
  index?: number;
}

export function RestaurantCard({ restaurant, index = 0 }: RestaurantCardProps) {
  const router = useRouter();
  const classification = getMatchClassification(restaurant.familyScore.score);
  const highlights = restaurantFeatureHighlights(restaurant.restaurantFeatures, 3);
  const caution = restaurant.goodToKnow?.[0];

  const handleView = () => {
    router.push(`/restaurant/${restaurant.id}` as never);
  };

  return (
    <Pressable
      onPress={handleView}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name}, ${classification}`}
      style={[styles.card, index > 0 && styles.cardSpacing]}
    >
      <Image source={{ uri: restaurant.imageUrl }} style={styles.image} contentFit="cover" />
      <View style={styles.content}>
        <Text variant="heading3" numberOfLines={1}>
          {restaurant.name}
        </Text>
        {restaurant.cuisineType ? (
          <Text variant="caption" color={colors.text.secondary}>
            {restaurant.cuisineType}
          </Text>
        ) : null}
        <Text variant="bodySmall" color={colors.secondary[600]} style={styles.classification}>
          {classification}
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          {restaurant.driveMinutes} min away · Estimated{' '}
          {restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend ?? 'spend varies'}
        </Text>
        {highlights.length > 0 ? (
          <Text variant="bodySmall" style={styles.highlights}>
            {highlights.join(' · ')}
          </Text>
        ) : null}
        {caution ? (
          <Text variant="caption" color={colors.warning[600]} style={styles.caution}>
            {caution}
          </Text>
        ) : null}
        <Button label="View restaurant" onPress={handleView} size="md" style={styles.cta} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardSpacing: {
    marginTop: spacing.lg,
  },
  image: {
    width: '100%',
    height: 140,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  classification: {
    fontFamily: 'Inter_600SemiBold',
    marginTop: spacing.xs,
  },
  highlights: {
    color: colors.text.primary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  caution: {
    marginTop: spacing.xs,
  },
  cta: {
    marginTop: spacing.md,
  },
});
