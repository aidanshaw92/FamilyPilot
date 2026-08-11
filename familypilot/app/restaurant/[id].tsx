import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RestaurantFacilities } from '@/src/components/restaurant/RestaurantFacilities';
import { RecommendationPattern } from '@/src/components/shared/RecommendationPattern';
import { DeferredPilotGate } from '@/src/components/shared/DeferredPilotGate';
import { SaveButton } from '@/src/components/shared/SaveButton';
import {
  Button,
  DataTrustBadge,
  EmptyState,
  Skeleton,
  Text,
  VenueImage,
} from '@/src/components/ui';
import { BackButton } from '@/src/components/ui/BackButton';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useRestaurant, useVenue } from '@/src/hooks/use-queries';
import { useSavedStore } from '@/src/stores/saved-store';
import { generateRestaurantStaticParams } from '@/src/utils/restaurant-routes';

const HERO_HEIGHT = 320;
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export function generateStaticParams() {
  return generateRestaurantStaticParams();
}

function noiseLabel(level?: string): string | null {
  switch (level) {
    case 'quiet':
      return 'Usually quiet';
    case 'moderate':
      return 'Moderate noise';
    case 'lively':
      return 'Can be lively at peak times';
    default:
      return null;
  }
}

function serviceSpeedLabel(speed?: string): string | null {
  switch (speed) {
    case 'quick':
      return 'Quick service';
    case 'relaxed':
      return 'Relaxed pace';
    default:
      return null;
  }
}

export default function RestaurantScreen() {
  return (
    <DeferredPilotGate feature="explore_restaurants" title="Restaurants coming later">
      <RestaurantScreenContent />
    </DeferredPilotGate>
  );
}

function RestaurantScreenContent() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activityVenueId = typeof from === 'string' ? from : undefined;
  const { data: restaurant, isLoading, isError, refetch } = useRestaurant(id ?? '', activityVenueId);
  const { data: activityVenue } = useVenue(activityVenueId ?? '');
  const { isSaved, toggleSaved } = useSavedStore();
  const scrollY = useSharedValue(0);

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
    } else if (activityVenueId) {
      router.replace(`/venue/${activityVenueId}` as never);
    } else {
      router.replace('/(tabs)/explore' as never);
    }
  }, [router, activityVenueId]);

  const handleDirections = useCallback(() => {
    if (!restaurant) return;
    const query = encodeURIComponent(restaurant.address ?? restaurant.name);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }, [restaurant]);

  const handleReturnToActivity = useCallback(() => {
    if (activityVenueId) {
      router.push(`/venue/${activityVenueId}` as never);
    }
  }, [router, activityVenueId]);

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
          title="Could not load this restaurant"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <EmptyState
          icon="restaurant-outline"
          title="Restaurant not found"
          message="This restaurant may have been removed or the link is incorrect."
          actionLabel="Explore restaurants"
          onAction={() => router.replace('/(tabs)/explore' as never)}
        />
      </View>
    );
  }

  const saved = isSaved(restaurant.id);
  const heroPhoto = restaurant.photos[0] ?? restaurant.imageUrl;
  const distanceMinutes =
    restaurant.driveMinutesFromActivity ?? restaurant.driveMinutes;
  const noise = noiseLabel(restaurant.restaurantFeatures.noiseLevel);
  const serviceSpeed = serviceSpeedLabel(restaurant.restaurantFeatures.serviceSpeed);
  const dietary = restaurant.restaurantFeatures.dietaryOptions ?? [];

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
              category={restaurant.category}
              alt={restaurant.name}
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
            <SaveButton venueId={restaurant.id} color={colors.text.inverse} />
          </View>
          <View style={styles.heroTitle}>
            <Text variant="heading1" color={colors.text.inverse}>
              {restaurant.name}
            </Text>
            {restaurant.cuisineType ? (
              <Text variant="bodySmall" color={colors.text.inverse} style={styles.cuisine}>
                {restaurant.cuisineType}
              </Text>
            ) : null}
            <View style={styles.heroMeta}>
              <MetaItem icon="car-outline" text={`${distanceMinutes} min`} />
              {restaurant.isOpen !== undefined ? (
                <MetaItem
                  icon={restaurant.isOpen ? 'checkmark-circle-outline' : 'close-circle-outline'}
                  text={restaurant.isOpen ? 'Open now' : 'Closed'}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <FadeInView>
            {activityVenue && restaurant.driveMinutesFromActivity !== undefined ? (
              <View style={styles.contextBanner}>
                <Ionicons name="location-outline" size={18} color={colors.primary[500]} />
                <View style={styles.contextText}>
                  <Text variant="bodySmall" style={styles.contextPrimary}>
                    {restaurant.driveMinutesFromActivity} minutes from {activityVenue.name}
                  </Text>
                  <PressableLink label={`Return to ${activityVenue.name}`} onPress={handleReturnToActivity} />
                </View>
              </View>
            ) : null}

            <Text variant="heading3" style={styles.sectionTitle}>
              Family suitability
            </Text>
            <RecommendationPattern venue={restaurant} variant="detail" showTrust />

            <Text variant="heading3" style={styles.sectionTitle}>
              Family facilities
            </Text>
            <RestaurantFacilities features={restaurant.restaurantFeatures} />

            <Text variant="heading3" style={styles.sectionTitle}>
              Cost
            </Text>
            <View style={styles.infoBlock}>
              <Text variant="body" style={styles.infoLabel}>
                Estimated family spend
              </Text>
              <Text variant="heading3">
                {restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend ?? 'Varies'}
              </Text>
              <Text variant="caption" color={colors.text.secondary} style={styles.infoHint}>
                Based on typical family meals — not an exact price
              </Text>
              <DataTrustBadge variant="estimated" label="Estimated family spend" />
            </View>

            <Text variant="heading3" style={styles.sectionTitle}>
              Dining considerations
            </Text>
            <View style={styles.considerations}>
              {noise ? <ConsiderationRow icon="volume-medium-outline" label={noise} /> : null}
              {restaurant.restaurantFeatures.bookingRecommended ? (
                <ConsiderationRow
                  icon="calendar-outline"
                  label="Booking recommended at busy times"
                  caution
                />
              ) : null}
              {serviceSpeed ? <ConsiderationRow icon="time-outline" label={serviceSpeed} /> : null}
              {dietary.length > 0 ? (
                <ConsiderationRow
                  icon="nutrition-outline"
                  label={`Dietary options: ${dietary.join(', ')}`}
                />
              ) : null}
              {restaurant.restaurantFeatures.childOffers ? (
                <ConsiderationRow
                  icon="gift-outline"
                  label={restaurant.restaurantFeatures.childOffers}
                />
              ) : null}
              {restaurant.restaurantFeatures.familyNotes ? (
                <ConsiderationRow
                  icon="information-circle-outline"
                  label={restaurant.restaurantFeatures.familyNotes}
                />
              ) : null}
            </View>

            {restaurant.trust ? (
              <View style={styles.trustSection}>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  {restaurant.openingHours.includes('provider')
                    ? 'Opening hours from provider'
                    : 'Opening hours estimated'}
                  {restaurant.trust.lastChecked
                    ? ` · Facilities last checked ${restaurant.trust.lastChecked}`
                    : ''}
                </Text>
              </View>
            ) : null}

            <Text variant="body" style={styles.description}>
              {restaurant.description}
            </Text>
          </FadeInView>
        </View>
      </AnimatedScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={saved ? 'Saved' : 'Save'}
          variant="outline"
          style={styles.footerButton}
          onPress={() => toggleSaved(restaurant.id)}
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

function ConsiderationRow({
  icon,
  label,
  caution,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  caution?: boolean;
}) {
  return (
    <View style={styles.considerationRow}>
      <Ionicons
        name={icon}
        size={18}
        color={caution ? colors.warning[600] : colors.primary[500]}
      />
      <Text
        variant="bodySmall"
        color={caution ? colors.warning[600] : colors.text.primary}
        style={styles.considerationText}
      >
        {label}
      </Text>
    </View>
  );
}

function PressableLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text
      variant="bodySmall"
      color={colors.primary[500]}
      onPress={onPress}
      accessibilityRole="link"
      style={styles.contextLink}
    >
      {label}
    </Text>
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
  heroTitle: {
    position: 'absolute',
    bottom: spacing['2xl'],
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    zIndex: 2,
  },
  cuisine: {
    marginTop: spacing.xs,
    opacity: 0.9,
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
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.primary[50],
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  contextText: {
    flex: 1,
    gap: spacing.xs,
  },
  contextPrimary: {
    fontFamily: 'Inter_600SemiBold',
  },
  contextLink: {
    fontFamily: 'Inter_600SemiBold',
    minHeight: 44,
    lineHeight: 44,
  },
  sectionTitle: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  infoBlock: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  infoLabel: {
    color: colors.text.secondary,
  },
  infoHint: {
    marginBottom: spacing.sm,
  },
  considerations: {
    gap: spacing.md,
  },
  considerationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  considerationText: {
    flex: 1,
    lineHeight: 22,
  },
  trustSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
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
