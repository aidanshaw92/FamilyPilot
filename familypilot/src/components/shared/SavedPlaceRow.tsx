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
import { isTravelTimeKnown, travelTimeLabel, travelTimeSpoken } from '@/src/utils/travel-time';

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

  /**
   * A SAVED PLACE MAY NOT HAVE BEEN SCORED YET, AND THEN IT MUST NOT CLAIM A SCORE.
   *
   * A place restored from a cloud backup arrives with no match and no travel time on purpose: the backup
   * does not carry either, because both are derived from the family (where they live, how old the
   * children are) and because a cached one is wrong rather than merely stale once any of that changes.
   *
   * So this row has to render an absence. Passing a non-finite score to `getMatchClassification` would
   * fall through every threshold and label the place "Limited match", which is not an absence -- it is a
   * judgement about a place nobody has judged.
   */
  const isScored = Number.isFinite(venue.familyScore?.score);
  const classification = isScored
    ? getMatchClassification(venue.familyScore.score)
    : 'Match not worked out on this device yet';
  const hasTravelTime = isTravelTimeKnown(venue.driveMinutes);
  const categoryLabel = isRestaurant ? 'Restaurant' : CATEGORY_LABELS[venue.category];

  return (
    <FadeInView delay={index * 60}>
      <PressableScale
        onPress={() => router.push(detailPath as never)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={
          hasTravelTime
            ? `${venue.name}, ${classification}, ${travelTimeSpoken(venue.driveMinutes, 'estimated')}`
            : `${venue.name}, ${classification}. Open it to work out the journey.`
        }
      >
        <VenueImage
          uri={venue.imageUrl}
          category={venue.category}
          alt={venue.name}
          style={styles.thumbnail}
          borderRadius={radius.md}
        />
        <View style={styles.content}>
          <Text variant="heading3" numberOfLines={2}>
            {venue.name}
          </Text>
          <Text variant="caption" color={colors.text.secondary}>
            {categoryLabel}
          </Text>
          <View style={styles.meta}>
            {/* Omitted rather than shown at zero. A 0% badge on a place nobody has scored reads as a
                verdict, and this product does not render a fact it does not have. */}
            {isScored ? (
              <FamilyMatch score={venue.familyScore.score} enrichmentStatus={venue.enrichmentStatus} />
            ) : null}
            <Text variant="caption" color={colors.text.secondary}>
              {hasTravelTime ? travelTimeLabel(venue.driveMinutes, 'estimated') : 'Open to see the journey'}
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
            <Text variant="link">
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
    </FadeInView>
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
  // Stacked, not side by side: next to the badge the travel line wrapped to three words deep at
  // 390 wide once the badge carried its number.
  meta: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
