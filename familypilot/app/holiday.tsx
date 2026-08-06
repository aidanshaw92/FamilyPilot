import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Card, FamilyScoreBadge, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useHolidayOffers } from '@/src/hooks/use-queries';

const PROVIDER_LABELS: Record<string, string> = {
  jet2: 'Jet2holidays',
  tui: 'TUI',
  loveholidays: 'loveholidays',
  easyjet: 'easyJet holidays',
  booking: 'Booking.com',
};

export default function HolidayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: offers } = useHolidayOffers();

  const recommended = offers?.find((o) => o.recommended);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="heading1">Plan a holiday</Text>
          <Text variant="bodySmall">Tenerife, Spain · Aug 2026</Text>
        </View>
      </View>

      {recommended ? (
        <Card style={styles.recommendBanner}>
          <Text variant="label" color={colors.primary[500]}>
            WE RECOMMEND
          </Text>
          <Text variant="heading2" style={styles.recommendTitle}>
            {PROVIDER_LABELS[recommended.provider]} — £{recommended.price.toLocaleString()}
          </Text>
          {recommended.familyScore.explanation.map((reason) => (
            <Text key={reason} variant="bodySmall" style={styles.recommendReason}>
              · {reason}
            </Text>
          ))}
        </Card>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {offers?.map((offer) => (
          <Card
            key={offer.id}
            style={[styles.offerCard, offer.recommended && styles.recommendedCard]}
          >
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
                  <Text variant="caption" color={colors.text.tertiary}>
                    {PROVIDER_LABELS[offer.provider]}
                  </Text>
                  <Text variant="heading3">{offer.hotelName}</Text>
                </View>
                <FamilyScoreBadge score={offer.familyScore.score} size="sm" />
              </View>
              <Text variant="heading2" style={styles.price}>
                £{offer.price.toLocaleString()}
              </Text>
              {offer.highlights.map((h) => (
                <Text key={h} variant="bodySmall" style={styles.highlight}>
                  · {h}
                </Text>
              ))}
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  recommendBanner: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.lg,
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[100],
    borderWidth: 1,
  },
  recommendTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  recommendReason: {
    color: colors.text.secondary,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
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
  },
  offerInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  price: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  highlight: {
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
