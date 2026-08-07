import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { FamilyMatch, Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';

interface VenueCardProps {
  venue: Venue;
  variant?: 'carousel' | 'list';
}

export function VenueCard({ venue, variant = 'carousel' }: VenueCardProps) {
  const router = useRouter();
  const isCarousel = variant === 'carousel';
  const classification = getMatchClassification(venue.familyScore.score);

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/venue/${venue.id}` as never);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${classification}, ${venue.driveMinutes} minutes away`}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        isCarousel ? styles.carousel : styles.list,
        pressed && styles.pressed,
      ]}
    >
      <Image source={{ uri: venue.imageUrl }} style={styles.image} contentFit="cover" />
      <View style={styles.scoreOverlay}>
        <FamilyMatch score={venue.familyScore.score} variant="card" />
      </View>
      <View style={styles.content}>
        <Text variant="heading3" numberOfLines={1}>
          {venue.name}
        </Text>
        <Text variant="caption" color={colors.text.secondary} style={styles.metaLine}>
          {venue.driveMinutes} min away
          {venue.estimatedSpend ? ` · Estimated ${venue.estimatedSpend}` : ''}
        </Text>
        {venue.familyScore.explanation[0] ? (
          <Text variant="caption" numberOfLines={2} style={styles.reason}>
            {venue.familyScore.explanation[0]}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  carousel: {
    width: 260,
    marginRight: spacing.lg,
  },
  list: {
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  image: {
    width: '100%',
    height: 140,
  },
  scoreOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  content: {
    padding: spacing.lg,
  },
  metaLine: {
    marginTop: spacing.xs,
  },
  reason: {
    marginTop: spacing.sm,
    color: colors.secondary[600],
  },
});
