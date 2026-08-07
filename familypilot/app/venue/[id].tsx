import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunitySection } from '@/src/components/venue/CommunitySection';
import { EatNearbySection } from '@/src/components/venue/EatNearbySection';
import { FacilityGrid } from '@/src/components/venue/FacilityGrid';
import { PhotoGallery } from '@/src/components/venue/PhotoGallery';
import { WeatherAlternativeSection } from '@/src/components/venue/WeatherAlternativeSection';
import { SaveButton } from '@/src/components/shared/SaveButton';
import {
  Button,
  EmptyState,
  FamilyMatchPanel,
  Skeleton,
  Text,
  VenueImage,
} from '@/src/components/ui';
import { BackButton } from '@/src/components/ui/BackButton';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useVenue } from '@/src/hooks/use-queries';
import { useSavedStore } from '@/src/stores/saved-store';
import { generateVenueStaticParams } from '@/src/utils/venue-routes';

const HERO_HEIGHT = 380;
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export function generateStaticParams() {
  return generateVenueStaticParams();
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: venue, isLoading, isError, refetch } = useVenue(id ?? '');
  const { isSaved, toggleSaved } = useSavedStore();
  const scrollY = useSharedValue(0);
  const [heroIndex, setHeroIndex] = useState(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [-100, 0, HERO_HEIGHT],
          [-50, 0, HERO_HEIGHT * 0.4],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(scrollY.value, [-100, 0], [1.15, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/explore' as never);
    }
  }, [router]);

  const handleDirections = useCallback(() => {
    if (!venue) return;
    const query = encodeURIComponent(venue.name);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }, [venue]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Skeleton height={HERO_HEIGHT} borderRadius={0} />
        <View style={styles.loadingBody}>
          <Skeleton height={120} style={styles.loadingGap} />
          <Skeleton height={200} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load this place"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <EmptyState
          icon="location-outline"
          title="Place not found"
          message="This venue may have been removed or the link is incorrect."
          actionLabel="Explore places"
          onAction={() => router.replace('/(tabs)/explore' as never)}
        />
      </View>
    );
  }

  const heroPhoto = venue.photos[heroIndex] ?? venue.photos[0];
  const saved = isSaved(venue.id);

  return (
    <View style={styles.container}>
      <AnimatedScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroContainer}>
          <Animated.View style={[styles.heroImageWrap, heroStyle]}>
            <VenueImage
              uri={heroPhoto}
              category={venue.category}
              alt={venue.name}
              style={styles.heroImage}
              borderRadius={0}
            />
          </Animated.View>
          <LinearGradient
            colors={[colors.gradient.heroStart, colors.gradient.heroEnd]}
            style={styles.heroGradient}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.sm }]}>
            <BackButton onPress={handleBack} color={colors.text.inverse} />
            <View style={styles.heroActions}>
              <SaveButton venueId={venue.id} color={colors.text.inverse} />
            </View>
          </View>
          <View style={styles.heroTitle}>
            <Text variant="heading1" color={colors.text.inverse}>
              {venue.name}
            </Text>
            <View style={styles.heroMeta}>
              <MetaItem icon="car-outline" text={`${venue.driveMinutes} min`} />
              {venue.visitDurationMinutes ? (
                <MetaItem icon="time-outline" text={`~${Math.round(venue.visitDurationMinutes / 60)}h visit`} />
              ) : null}
              {venue.estimatedSpend ? (
                <MetaItem icon="wallet-outline" text={`Est. ${venue.estimatedSpend}`} />
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <FadeInView>
            <FamilyMatchPanel familyScore={venue.familyScore} venue={venue} />

            <PhotoGallery photos={venue.photos} onPhotoPress={setHeroIndex} />

            <Text variant="heading3" style={styles.sectionTitle}>
              Facilities
            </Text>
            <FacilityGrid facilities={venue.facilities} />

            <View style={styles.detailsGrid}>
              <DetailItem icon="people-outline" label="Best for ages" value={venue.bestAges} />
              <DetailItem icon="trail-sign-outline" label="Terrain" value={venue.terrain} />
              <DetailItem icon="time-outline" label="Opening hours" value={venue.openingHours} />
              <DetailItem icon="car-outline" label="Parking" value={venue.parkingInfo} />
            </View>

            {venue.eatNearby && venue.eatNearby.length > 0 ? (
              <EatNearbySection options={venue.eatNearby} />
            ) : null}

            {venue.weatherAlternative ? (
              <WeatherAlternativeSection alternative={venue.weatherAlternative} />
            ) : null}

            <Text variant="body" style={styles.description}>
              {venue.description}
            </Text>

            <CommunitySection tips={venue.communityTips} />
          </FadeInView>
        </View>
      </AnimatedScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={saved ? 'Saved' : 'Save'}
          variant="outline"
          style={styles.footerButton}
          onPress={() => toggleSaved(venue.id)}
        />
        <Button label="Get directions" style={styles.footerButton} onPress={handleDirections} />
      </View>
    </View>
  );
}

function MetaItem({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.text.inverse} />
      <Text variant="caption" color={colors.text.inverse}>
        {text}
      </Text>
    </View>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailItem}>
      <Ionicons name={icon} size={18} color={colors.primary[500]} />
      <View style={styles.detailText}>
        <Text variant="caption">{label}</Text>
        <Text variant="bodySmall" style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingBody: {
    padding: spacing.screenPadding,
  },
  loadingGap: {
    marginBottom: spacing.lg,
  },
  heroContainer: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  heroImageWrap: {
    ...StyleSheet.absoluteFill,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    zIndex: 2,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroTitle: {
    position: 'absolute',
    bottom: spacing['2xl'],
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    zIndex: 2,
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  body: {
    padding: spacing.screenPadding,
    paddingBottom: 120,
  },
  sectionTitle: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  detailsGrid: {
    marginTop: spacing['2xl'],
    gap: spacing.lg,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailText: {
    flex: 1,
  },
  detailValue: {
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  description: {
    marginTop: spacing['2xl'],
    color: colors.text.secondary,
    lineHeight: 24,
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
