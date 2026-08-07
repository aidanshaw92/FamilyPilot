import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { EatNearbyRecommendation } from '@/src/types';

interface EatNearbyCompactCardProps {
  recommendation: EatNearbyRecommendation;
  activityVenueId: string;
}

export function EatNearbyCompactCard({ recommendation, activityVenueId }: EatNearbyCompactCardProps) {
  const router = useRouter();

  const handleView = () => {
    router.push(`/restaurant/${recommendation.restaurantId}?from=${activityVenueId}` as never);
  };

  return (
    <Pressable
      style={styles.card}
      onPress={handleView}
      accessibilityRole="button"
      accessibilityLabel={`View ${recommendation.name}, ${recommendation.classification}`}
    >
      <Image source={{ uri: recommendation.imageUrl }} style={styles.image} contentFit="cover" />
      <View style={styles.content}>
        <Text variant="heading3" numberOfLines={1}>
          {recommendation.name}
        </Text>
        <Text variant="bodySmall" color={colors.secondary[600]} style={styles.classification}>
          {recommendation.classification}
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          {recommendation.driveMinutes} mins drive
          {recommendation.estimatedFamilySpend
            ? ` · ${recommendation.estimatedFamilySpend}`
            : ''}
        </Text>
        {recommendation.highlights.length > 0 ? (
          <Text variant="caption" color={colors.text.primary} style={styles.highlights}>
            {recommendation.highlights.join(' · ')}
          </Text>
        ) : null}
        <Button label="View restaurant" onPress={handleView} size="md" style={styles.cta} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  image: {
    width: 96,
    height: '100%',
    minHeight: 120,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  classification: {
    fontFamily: 'Inter_600SemiBold',
  },
  highlights: {
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  cta: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 140,
  },
});
