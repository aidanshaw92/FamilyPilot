import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { FadeInView } from '@/src/components/ui/FadeInView';
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
  zoo: 'Zoo',
  attraction: 'Attraction',
  activity: 'Activity',
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
  index?: number;
}

export function SavedPlaceRow({ venue, itemType, onRemoved, index = 0 }: SavedPlaceRowProps) {
  const router = useRouter();
  const { removeSaved } = useSavedStore();

  const isRestaurant =
    itemType === 'restaurant' || venue.category === 'restaurant' || venue.category === 'cafe';
  const detailPath = isRestaurant ? `/restaurant/${venue.id}` : `/venue/${venue.id}`;

  const handleRemove = () => {
    removeSaved(venue.id);
    onRemoved?.(venue.id);
  };

  const classification = getMatchClassification(venue.familyScore.score);
  const categoryLabel = isRestaurant ? 'Restaurant' : CATEGORY_LABELS[venue.category];

  return (
    <FadeInView delay={index * 60}>
      <PressableScale
        onPress={() => router.push(detailPath as never)}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${classification}, ${venue.driveMinutes} minutes away`}
      >
        <View style={styles.imageWrap}>
          <VenueImage
            uri={venue.imageUrl}
            category={venue.category}
            alt={venue.name}
            style={styles.image}
            borderRadius={0}
          />
          <View style={styles.badgeOverlay}>
            <FamilyMatch score={venue.familyScore.score} variant="card" />
          </View>
          <Pressable
            onPress={handleRemove}
            style={styles.removeBadge}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${venue.name} from saved`}
            hitSlop={8}
          >
            <Ionicons name="heart" size={18} color={colors.coral} />
          </Pressable>
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text variant="heading3" numberOfLines={2} style={styles.title}>
              {venue.name}
            </Text>
            <View style={styles.cta}>
              <Ionicons name="arrow-forward" size={14} color={colors.text.inverse} />
            </View>
          </View>
          <Text variant="caption" color={colors.text.secondary}>
            {categoryLabel} · {venue.driveMinutes} min away
            {venue.estimatedSpend ? ` · Estimated ${venue.estimatedSpend}` : ''}
          </Text>
        </View>
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  imageWrap: {
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 130,
  },
  badgeOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  removeBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: spacing.xs,
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  cta: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
