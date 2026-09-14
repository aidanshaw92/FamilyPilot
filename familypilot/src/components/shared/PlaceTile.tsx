import { StyleSheet, View, ViewStyle } from 'react-native';

import { CircleButton } from '@/src/components/ui/CircleButton';
import { FamilyFitBadge } from '@/src/components/ui/FamilyFitBadge';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';

interface PlaceTileProps {
  /** Any venue-shaped record: an activity, a restaurant, a saved place. */
  id: string;
  name: string;
  imageUrl?: string;
  category?: string;
  /** "5 mins walk", "18 min away". Left as free text so each surface can be specific. */
  meta: string;
  /** A short second line: confirmed facilities, a suitability note. */
  detail?: string;
  score?: number;
  enrichmentStatus?: Venue['enrichmentStatus'];
  onPress: () => void;
  /** Passing a venue turns on the heart overlay, wired to the real saved store. */
  saveVenue?: Venue;
  imageHeight?: number;
  style?: ViewStyle;
}

/** The reference's "Iconic Brazil" tour card: photo on top, a tight block of type below,
 * and a dark circular arrow anchored bottom-right. Used in every horizontal rail and list. */
export function PlaceTile({
  id,
  name,
  imageUrl,
  category,
  meta,
  detail,
  score,
  enrichmentStatus,
  onPress,
  saveVenue,
  imageHeight = 152,
  style,
}: PlaceTileProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      style={[styles.card, style]}
    >
      <View style={styles.imageWrap}>
        <VenueImage
          uri={imageUrl}
          category={category}
          alt={name}
          style={{ width: '100%', height: imageHeight }}
          borderRadius={0}
        />
        {saveVenue ? (
          <View style={styles.saveSlot}>
            <SaveButton
              venueId={id}
              venue={saveVenue}
              size={18}
              color={colors.text.primary}
              filledColor={colors.coral}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text variant="heading3" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
        {detail ? (
          <Text variant="caption" color={colors.text.tertiary} numberOfLines={1} style={styles.detail}>
            {detail}
          </Text>
        ) : null}

        <View style={styles.footer}>
          {score !== undefined ? (
            <FamilyFitBadge score={score} enrichmentStatus={enrichmentStatus} style={styles.fit} />
          ) : (
            <View />
          )}
          <CircleButton
            icon="arrow-forward"
            accessibilityLabel={`Open ${name}`}
            tone="dark"
            size={38}
            iconSize={17}
            onPress={onPress}
          />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imageWrap: {
    position: 'relative',
  },
  saveSlot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.lg,
  },
  meta: {
    marginTop: 2,
  },
  detail: {
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  fit: {
    borderWidth: 0,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.sm,
  },
});
