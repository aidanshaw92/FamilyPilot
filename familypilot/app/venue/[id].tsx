import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FacilityGrid } from '@/src/components/venue/FacilityGrid';
import { WhyRecommend } from '@/src/components/venue/WhyRecommend';
import { Button, FamilyScoreBadge, Text } from '@/src/components/ui';
import { BackButton } from '@/src/components/ui/BackButton';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useVenue } from '@/src/hooks/use-queries';

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: venue } = useVenue(id ?? '');

  if (!venue) {
    return (
      <View style={styles.loading}>
        <Text variant="body">Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heroContainer}>
          <Image source={{ uri: venue.photos[0] }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient
            colors={[colors.gradient.heroStart, colors.gradient.heroEnd]}
            style={styles.heroGradient}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.sm }]}>
            <BackButton onPress={() => router.back()} color={colors.text.inverse} />
            <FamilyScoreBadge score={venue.familyScore.score} size="lg" />
          </View>
          <View style={styles.heroTitle}>
            <Text variant="heading1" color={colors.text.inverse}>
              {venue.name}
            </Text>
            <View style={styles.heroMeta}>
              <Ionicons name="car-outline" size={16} color={colors.text.inverse} />
              <Text variant="bodySmall" color={colors.text.inverse}>
                {venue.driveMinutes} min · {venue.address?.trim()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <WhyRecommend reasons={venue.familyScore.explanation} />

          <Text variant="heading3" style={styles.sectionTitle}>
            Facilities
          </Text>
          <FacilityGrid facilities={venue.facilities} />

          <View style={styles.detailsGrid}>
            <DetailItem label="Best for ages" value={venue.bestAges} />
            <DetailItem label="Terrain" value={venue.terrain} />
            <DetailItem label="Opening hours" value={venue.openingHours} />
            <DetailItem label="Parking" value={venue.parkingInfo} />
            <DetailItem label="Estimated spend" value={venue.estimatedSpend ?? 'Free'} />
          </View>

          <Text variant="body" style={styles.description}>
            {venue.description}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Save" variant="outline" style={styles.footerButton} />
        <Button label="Directions" style={styles.footerButton} />
      </View>
    </View>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text variant="caption">{label}</Text>
      <Text variant="bodySmall" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContainer: {
    height: 360,
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
  },
  heroTitle: {
    position: 'absolute',
    bottom: spacing['2xl'],
    left: spacing.screenPadding,
    right: spacing.screenPadding,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  body: {
    padding: spacing.screenPadding,
    paddingBottom: 120,
  },
  sectionTitle: {
    marginTop: spacing['3xl'],
    marginBottom: spacing.lg,
  },
  detailsGrid: {
    marginTop: spacing['3xl'],
    gap: spacing.lg,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.md,
  },
  detailValue: {
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  description: {
    marginTop: spacing['2xl'],
    color: colors.text.secondary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  footerButton: {
    flex: 1,
  },
});
