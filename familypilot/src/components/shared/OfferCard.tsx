import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Card, FamilyMatch, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { HolidayOffer } from '@/src/types';

const PROVIDER_LABELS: Record<string, string> = {
  jet2: 'Jet2holidays',
  tui: 'TUI',
  loveholidays: 'loveholidays',
  easyjet: 'easyJet holidays',
  booking: 'Booking.com',
};

interface OfferCardProps {
  offer: HolidayOffer;
}

export function OfferCard({ offer }: OfferCardProps) {
  return (
    <Card style={[styles.offerCard, offer.recommended && styles.recommendedCard]}>
      {offer.recommended ? (
        <View style={styles.recommendedBadge}>
          <Text variant="caption" color={colors.text.inverse}>
            Best for your family
          </Text>
        </View>
      ) : null}
      <Image source={{ uri: offer.imageUrl }} style={styles.offerImage} contentFit="cover" />
      <View style={styles.offerContent}>
        <View style={styles.offerHeader}>
          <View style={styles.offerInfo}>
            <Text variant="caption" color={colors.text.secondary}>
              {PROVIDER_LABELS[offer.provider]}
            </Text>
            <Text variant="heading3">{offer.hotelName}</Text>
          </View>
          <FamilyMatch score={offer.familyScore.score} variant="compact" />
        </View>
        <Text variant="heading2" style={styles.price}>
          £{offer.price.toLocaleString()}
        </Text>
        <Text variant="caption" color={colors.text.tertiary}>
          Estimated total for your family
        </Text>
        {offer.highlights.map((h) => (
          <Text key={h} variant="bodySmall" color={colors.text.secondary} style={styles.highlight}>
            · {h}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  offerCard: {
    marginBottom: spacing['2xl'],
    padding: 0,
    overflow: 'hidden',
  },
  recommendedCard: {
    borderWidth: 2,
    borderColor: colors.primary[200],
  },
  recommendedBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 1,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  offerImage: {
    width: '100%',
    height: 160,
  },
  offerContent: {
    padding: spacing.lg,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  offerInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  price: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  highlight: {
    marginTop: spacing.xs,
  },
});
