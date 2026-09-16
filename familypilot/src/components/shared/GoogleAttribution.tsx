import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { GOOGLE_MAPS_MARK } from '@/src/design-system/google-maps-mark';
import { PhotoAttribution } from '@/src/services/places/place-photo-url';

/**
 * Google requires places content shown without a Google map to carry the Google Maps mark, and a
 * photo to carry its photographer. Where a photo is a space-constrained preview the per-photo
 * author attribution may be omitted, provided the user can reach a larger version that carries it
 * in full — so Home shows the mark once and the venue screen shows the photographer.
 *
 * The mark renders from Google's own supplied file when we have it, scaled at its true aspect
 * ratio and never redrawn. Until then it is the wordmark set in text, which the policy allows
 * where space is limited — and which says "Google Maps" rather than only "Google", as the current
 * guidance asks of new implementations.
 */
export function GoogleMapsMark({ compact = true }: { compact?: boolean }) {
  // 18 is the asset's own height; the compact size is the largest that still clears the bottom
  // navigation in the gap the frame leaves under the deck.
  const height = compact ? 16 : 18;

  if (GOOGLE_MAPS_MARK) {
    return (
      <Image
        source={GOOGLE_MAPS_MARK.source}
        // The asset must not be stretched, so the width follows its own ratio.
        style={{ height, width: height * GOOGLE_MAPS_MARK.aspectRatio }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Google Maps"
      />
    );
  }

  return (
    <Text variant="caption" color={ATTRIBUTION_INK} style={styles.wordmark}>
      Google Maps
    </Text>
  );
}

/**
 * The grey Google permits for attribution on a light background. Darker and more neutral than the
 * app's own tertiary ink, which is a light purple-grey and would sit under the required contrast.
 */
const ATTRIBUTION_INK = '#5E5E5E';

/** The mark on its own, for a screen whose place content is a preview. */
export function GoogleMapsAttribution({ compact = true }: { compact?: boolean }) {
  return (
    <View style={styles.markRow} accessible accessibilityLabel="Place information from Google Maps">
      <GoogleMapsMark compact={compact} />
    </View>
  );
}

interface PhotoAttributionLineProps {
  attribution: PhotoAttribution;
}

/**
 * The full attribution a photograph carries at size: the photographer, their Google Maps profile
 * where Google supplied one, and a way to open the individual photo on Google Maps.
 */
export function PhotoAttributionLine({ attribution }: PhotoAttributionLineProps) {
  const { author, authorUri, photoUri } = attribution;
  const open = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <View style={styles.photoLine}>
      <GoogleMapsMark />
      <Text variant="caption" color={ATTRIBUTION_INK} numberOfLines={2} style={styles.photoText}>
        Photo by{' '}
        {authorUri ? (
          <Text
            variant="caption"
            color={colors.text.secondary}
            style={styles.link}
            onPress={() => open(authorUri)}
            accessibilityRole="link"
            accessibilityLabel={`${author} on Google Maps`}
          >
            {author}
          </Text>
        ) : (
          <Text variant="caption" color={colors.text.secondary}>
            {author}
          </Text>
        )}
      </Text>
      {photoUri ? (
        <Pressable
          onPress={() => open(photoUri)}
          accessibilityRole="link"
          accessibilityLabel="View this photo on Google Maps"
          hitSlop={8}
        >
          <Text variant="caption" color={colors.text.secondary} style={styles.link}>
            View on Google Maps
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  markRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    // Google's attribution is set at a normal weight, not emphasised.
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0,
  },
  photoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoText: {
    flexShrink: 1,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
