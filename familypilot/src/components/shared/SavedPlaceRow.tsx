import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useSavedStore } from '@/src/stores/saved-store';
import { Venue, VenueCategory } from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';

const CATEGORY_LABELS: Record<VenueCategory, string> = {
  park: 'Park',
  farm: 'Farm',
  museum: 'Museum',
  soft_play: 'Soft play',
  cafe: 'Café',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  shop: 'Shop',
  beach: 'Beach',
};

interface SavedPlaceRowProps {
  venue: Venue;
  itemType?: 'place' | 'restaurant' | 'hotel' | 'shop';
  onRemoved?: (venueId: string) => void;
}

export function SavedPlaceRow({ venue, itemType, onRemoved }: SavedPlaceRowProps) {
  const router = useRouter();
  const { toggleSaved } = useSavedStore();

  const isRestaurant =
    itemType === 'restaurant' || venue.category === 'restaurant' || venue.category === 'cafe';
  const detailPath = isRestaurant ? `/restaurant/${venue.id}` : `/venue/${venue.id}`;

  const handleRemove = () => {
    toggleSaved(venue.id);
    onRemoved?.(venue.id);
  };

  const classification = getMatchClassification(venue.familyScore.score);
  const categoryLabel = isRestaurant ? 'Restaurant' : CATEGORY_LABELS[venue.category];

  return (
    <PressableScale
      onPress={() => router.push(detailPath as never)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${classification}, ${venue.driveMinutes} minutes away`}
    >
      <VenueImage
        uri={venue.imageUrl}
        category={venue.category}
        alt={venue.name}
        style={styles.thumbnail}
        borderRadius={radius.md}
      />
      <View style={styles.content}>
        <Text variant="heading3" numberOfLines={1}>
          {venue.name}
        </Text>
        <Text variant="caption" color={colors.text.secondary}>
          {categoryLabel}
        </Text>
        <View style={styles.meta}>
          <FamilyMatch score={venue.familyScore.score} variant="compact" style={styles.match} />
          <Text variant="caption" color={colors.text.secondary}>
            {venue.driveMinutes} min away
            {venue.estimatedSpend ? ` · Estimated ${venue.estimatedSpend}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push(detailPath as never)}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={`View ${venue.name}`}
        >
          <Text variant="caption" color={colors.primary[500]}>
            View details
          </Text>
        </Pressable>
        <Pressable
          onPress={handleRemove}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${venue.name} from saved`}
        >
          <Ionicons name="heart" size={20} color={colors.error[500]} />
        </Pressable>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
    gap: spacing.md,
  },
  thumbnail: {
    width: 64,
    height: 64,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  match: {
    minWidth: 52,
    minHeight: 32,
    paddingVertical: 2,
  },
  actions: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
