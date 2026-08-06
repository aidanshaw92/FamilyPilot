import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { FamilyScoreBadge, Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';

interface VenueCardProps {
  venue: Venue;
  variant?: 'carousel' | 'list';
}

export function VenueCard({ venue, variant = 'carousel' }: VenueCardProps) {
  const router = useRouter();
  const isCarousel = variant === 'carousel';

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/venue/${venue.id}` as never);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, family score ${venue.familyScore.score}, ${venue.driveMinutes} minutes drive`}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        isCarousel ? styles.carousel : styles.list,
        pressed && styles.pressed,
      ]}
    >
      <Image source={{ uri: venue.imageUrl }} style={styles.image} contentFit="cover" />
      <View style={styles.scoreOverlay}>
        <FamilyScoreBadge score={venue.familyScore.score} size="sm" />
      </View>
      <View style={styles.content}>
        <Text variant="heading3" numberOfLines={1}>
          {venue.name}
        </Text>
        <View style={styles.meta}>
          <Ionicons name="car-outline" size={14} color={colors.text.tertiary} />
          <Text variant="caption" style={styles.metaText}>
            {venue.driveMinutes} min
          </Text>
          {venue.estimatedSpend ? (
            <>
              <Text variant="caption" color={colors.text.tertiary}>
                ·
              </Text>
              <Text variant="caption">{venue.estimatedSpend}</Text>
            </>
          ) : null}
        </View>
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
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  metaText: {
    marginLeft: 2,
  },
  reason: {
    marginTop: spacing.sm,
    color: colors.secondary[600],
  },
});
