import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VenueTrustPanel } from '@/src/components/planning/VisitFeedback';
import { RestaurantFacilities } from '@/src/components/restaurant/RestaurantFacilities';
import { DeferredPilotGate } from '@/src/components/shared/DeferredPilotGate';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { ShareButton } from '@/src/components/shared/ShareButton';
import {
  Button,
  CircleButton,
  DataTrustBadge,
  EmptyState,
  FamilyFitBadge,
  Skeleton,
  Text,
  VenueImage,
} from '@/src/components/ui';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { colors, layout, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useRestaurant, useVenue } from '@/src/hooks/use-queries';
import { useSavedStore } from '@/src/stores/saved-store';
import { generateRestaurantStaticParams } from '@/src/utils/restaurant-routes';

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
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Skeleton height={layout.heroHeight} borderRadius={0} />
        <View style={styles.loadingBody}>
          <Skeleton height={120} style={styles.loadingGap} />
          <Skeleton height={200} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.errorNav}>
          <CircleButton icon="chevron-back" accessibilityLabel="Go back" onPress={handleBack} />
        </View>
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
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.errorNav}>
          <CircleButton icon="chevron-back" accessibilityLabel="Go back" onPress={handleBack} />
        </View>
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
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollIndicatorInsets={{ bottom: layout.ctaClearance }}
      >
        <View style={styles.hero}>
          <VenueImage
            uri={heroPhoto}
            category={restaurant.category}
            alt={restaurant.name}
            style={styles.heroImage}
            borderRadius={0}
          />
          <View style={[styles.heroChrome, { top: insets.top + spacing.sm }]}>
            <CircleButton icon="chevron-back" accessibilityLabel="Go back" onPress={handleBack} />
            <View style={styles.heroActions}>
              <View style={styles.chromeButton}>
                <ShareButton title={restaurant.name} path={`/restaurant/${restaurant.id}`} />
              </View>
              <View style={styles.chromeButton}>
                <SaveButton
                  venueId={restaurant.id}
                  venue={restaurant}
                  type="restaurant"
                  size={21}
                  filledColor={colors.coral}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <FadeInView>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <Text variant="heading1" numberOfLines={2}>
                  {restaurant.name}
                </Text>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={15} color={colors.text.secondary} />
                  <Text variant="bodySmall" color={colors.text.secondary} numberOfLines={1}>
                    {restaurant.cuisineType ? `${restaurant.cuisineType} · ` : ''}
                    {distanceMinutes} min away
                    {restaurant.isOpen !== undefined
                      ? ` · ${restaurant.isOpen ? 'Open now' : 'Closed'}`
                      : ''}
                  </Text>
                </View>
              </View>
              <FamilyFitBadge
                score={restaurant.familyScore.score}
                enrichmentStatus={restaurant.enrichmentStatus}
              />
            </View>

            {activityVenue && restaurant.driveMinutesFromActivity !== undefined ? (
              <View style={styles.contextBanner}>
                <Ionicons name="location-outline" size={18} color={colors.text.primary} />
                <View style={styles.contextText}>
                  <Text variant="bodySmall" style={styles.contextPrimary}>
                    {restaurant.driveMinutesFromActivity} minutes from {activityVenue.name}
                  </Text>
                  <Text
                    variant="bodySmall"
                    color={colors.text.primary}
                    onPress={handleReturnToActivity}
                    accessibilityRole="link"
                    style={styles.contextLink}
                  >
                    Back to {activityVenue.name}
                  </Text>
                </View>
              </View>
            ) : null}

            {restaurant.description ? (
              <Text variant="body" color={colors.text.secondary} style={styles.description}>
                {restaurant.description}
              </Text>
            ) : null}

            <Text variant="heading3" style={styles.sectionTitle}>
              Family facilities
            </Text>
            <RestaurantFacilities features={restaurant.restaurantFeatures} />

            <Text variant="heading3" style={styles.sectionTitle}>
              Cost
            </Text>
            <View style={styles.infoBlock}>
              <Text variant="bodySmall" color={colors.text.secondary}>
                Estimated family spend
              </Text>
              <Text variant="heading2">
                {restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend ?? 'Not known'}
              </Text>
              <Text variant="caption" color={colors.text.tertiary}>
                Based on typical family meals, not an exact price
              </Text>
              <DataTrustBadge variant="estimated" label="Estimated family spend" />
            </View>

            {noise ||
            serviceSpeed ||
            dietary.length > 0 ||
            restaurant.restaurantFeatures.bookingRecommended ||
            restaurant.restaurantFeatures.childOffers ||
            restaurant.restaurantFeatures.familyNotes ? (
              <>
                <Text variant="heading3" style={styles.sectionTitle}>
                  Worth knowing
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
                  {serviceSpeed ? (
                    <ConsiderationRow icon="time-outline" label={serviceSpeed} />
                  ) : null}
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
              </>
            ) : null}

            {restaurant.trust ? (
              <Text variant="caption" color={colors.text.tertiary} style={styles.trustNote}>
                {restaurant.openingHours.includes('provider')
                  ? 'Opening hours from provider'
                  : 'Opening hours estimated'}
                {restaurant.trust.lastChecked
                  ? ` · Facilities last checked ${restaurant.trust.lastChecked}`
                  : ''}
              </Text>
            ) : null}

            <View style={styles.tail}>
              <VenueTrustPanel venueId={restaurant.id} />
            </View>
          </FadeInView>
        </View>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label={saved ? 'Saved' : 'Save'}
          variant="outline"
          style={styles.ctaButton}
          onPress={() => toggleSaved(restaurant.id, restaurant, 'restaurant')}
        />
        <Button
          label="Get directions"
          trailingArrow
          style={styles.ctaButton}
          onPress={handleDirections}
        />
      </View>
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
      <Ionicons name={icon} size={18} color={caution ? colors.warning[600] : colors.text.primary} />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: layout.ctaClearance,
  },
  loadingBody: {
    padding: spacing.screenPadding,
  },
  loadingGap: {
    marginBottom: spacing.lg,
  },
  errorNav: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing.lg,
  },
  hero: {
    height: layout.heroHeight,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroChrome: {
    position: 'absolute',
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chromeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    marginTop: -layout.sheetOverlap,
    paddingTop: spacing['2xl'],
    paddingHorizontal: spacing.screenPadding,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleText: {
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius['2xl'],
    marginTop: spacing.lg,
    ...shadows.card,
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
    textDecorationLine: 'underline',
    minHeight: 32,
    lineHeight: 32,
  },
  description: {
    marginTop: spacing.lg,
    lineHeight: 23,
  },
  sectionTitle: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  infoBlock: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius['2xl'],
    gap: spacing.sm,
    alignItems: 'flex-start',
    ...shadows.card,
  },
  considerations: {
    gap: spacing.sm,
  },
  considerationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 40,
    paddingVertical: spacing.xs,
  },
  considerationText: {
    flex: 1,
    lineHeight: 22,
  },
  trustNote: {
    marginTop: spacing.xl,
  },
  tail: {
    marginTop: spacing['2xl'],
  },
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  ctaButton: {
    flex: 1,
  },
});
