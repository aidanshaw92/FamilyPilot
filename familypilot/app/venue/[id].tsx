import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckTodaySection } from '@/src/components/venue/CheckTodaySection';
import { CommunitySection } from '@/src/components/venue/CommunitySection';
import { FamilyFactRow } from '@/src/components/venue/FamilyFactRow';
import { WeatherAlternativeSection } from '@/src/components/venue/WeatherAlternativeSection';
import { PlaceTile } from '@/src/components/shared/PlaceTile';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { ShareButton } from '@/src/components/shared/ShareButton';
import { VenueTrustPanel } from '@/src/components/planning/VisitFeedback';
import {
  BottomSheet,
  Button,
  CircleButton,
  EmptyState,
  FamilyFitBadge,
  SectionHeader,
  Skeleton,
  SnapCarousel,
  Text,
  VenueImage,
} from '@/src/components/ui';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors, layout, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useEatNearby, useVenue } from '@/src/hooks/use-queries';
import { getEnrichmentDetailTrustCopy } from '@/src/utils/family-match-classification';
import { formatCategory } from '@/src/utils/format-category';
import { generateVenueStaticParams } from '@/src/utils/venue-routes';

const DESCRIPTION_PREVIEW_LINES = 3;

export function generateStaticParams() {
  return generateVenueStaticParams();
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: venue, isLoading, isError, refetch } = useVenue(id ?? '');
  const eatNearbyEnabled = isPilotFeatureVisible('explore_restaurants');
  const { data: eatNearby } = useEatNearby(eatNearbyEnabled ? id : undefined);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [fitSheetOpen, setFitSheetOpen] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  }, [router]);

  const handleDirections = useCallback(() => {
    if (!venue) return;
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name)}`,
    );
  }, [venue]);

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Skeleton height={layout.heroHeight} borderRadius={0} />
        <View style={styles.loadingBody}>
          <Skeleton height={28} style={styles.loadingGap} />
          <Skeleton height={120} style={styles.loadingGap} />
          <Skeleton height={180} />
        </View>
      </View>
    );
  }

  if (isError || !venue) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.errorNav}>
          <CircleButton icon="chevron-back" accessibilityLabel="Go back" onPress={handleBack} />
        </View>
        <EmptyState
          icon={isError ? 'cloud-offline-outline' : 'location-outline'}
          title={isError ? 'Could not load this place' : 'Place not found'}
          message={
            isError
              ? 'Check your connection and try again.'
              : 'This place may have been removed, or the link is out of date.'
          }
          actionLabel={isError ? 'Retry' : 'Explore places'}
          onAction={() =>
            isError ? void refetch() : router.replace('/(tabs)/explore' as never)
          }
        />
      </View>
    );
  }

  const unreviewed = venue.enrichmentStatus === 'provider_only';
  const description = venue.description ?? '';
  const restaurants = eatNearby ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollIndicatorInsets={{ bottom: layout.ctaClearance }}
      >
        <View style={styles.hero}>
          <VenueImage
            uri={venue.photos?.[0] ?? venue.imageUrl}
            category={venue.category}
            alt={venue.name}
            style={styles.heroImage}
            borderRadius={0}
          />
          <View style={[styles.heroChrome, { top: insets.top + spacing.sm }]}>
            <CircleButton icon="chevron-back" accessibilityLabel="Go back" onPress={handleBack} />
            <View style={styles.heroActions}>
              <View style={styles.chromeButton}>
                <ShareButton title={venue.name} path={`/venue/${venue.id}`} />
              </View>
              <View style={styles.chromeButton}>
                <SaveButton venueId={venue.id} venue={venue} size={21} filledColor={colors.coral} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <FadeInView>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <Text variant="heading1" numberOfLines={2}>
                  {venue.name}
                </Text>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={15} color={colors.text.secondary} />
                  <Text variant="bodySmall" color={colors.text.secondary} numberOfLines={1}>
                    {venue.address ?? formatCategory(venue.category)} · {venue.driveMinutes} min away
                  </Text>
                </View>
              </View>
              <FamilyFitBadge
                score={venue.familyScore.score}
                enrichmentStatus={venue.enrichmentStatus}
                onPress={() => setFitSheetOpen(true)}
              />
            </View>

            {description ? (
              <View style={styles.descriptionBlock}>
                <Text
                  variant="body"
                  color={colors.text.secondary}
                  numberOfLines={descriptionOpen ? undefined : DESCRIPTION_PREVIEW_LINES}
                >
                  {description}
                </Text>
                {description.length > 140 ? (
                  <Text
                    variant="bodySmall"
                    color={colors.text.primary}
                    style={styles.readMore}
                    onPress={() => setDescriptionOpen(!descriptionOpen)}
                    accessibilityRole="button"
                  >
                    {descriptionOpen ? 'Read less' : 'Read more'}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <FamilyFactRow venue={venue} />

            {unreviewed ? (
              <Text variant="caption" color={colors.text.secondary} style={styles.trustNote}>
                {getEnrichmentDetailTrustCopy(venue.enrichmentStatus)}
              </Text>
            ) : null}

            {venue.trustedFacts ? (
              <CheckTodaySection
                facts={venue.trustedFacts}
                latitude={venue.latitude}
                longitude={venue.longitude}
              />
            ) : null}

            {venue.weatherAlternative ? (
              <WeatherAlternativeSection alternative={venue.weatherAlternative} />
            ) : null}
          </FadeInView>
        </View>

        {restaurants.length > 0 ? (
          <View style={styles.rail}>
            <View style={styles.railHeader}>
              <SectionHeader
                title="Restaurants close by"
                actionLabel="See all"
                onAction={() => router.push('/(tabs)/explore?category=restaurants' as never)}
              />
            </View>
            <SnapCarousel
              data={restaurants}
              keyExtractor={(item) => item.restaurantId}
              itemWidth={Math.min(248, width - spacing.screenPadding * 2 - 60)}
              gap={spacing.md}
              renderItem={(item) => (
                <PlaceTile
                  id={item.restaurantId}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  category="restaurant"
                  meta={`${item.driveMinutes} min away${
                    item.estimatedFamilySpend ? ` · ${item.estimatedFamilySpend}` : ''
                  }`}
                  detail={item.highlights.slice(0, 2).join(' · ') || undefined}
                  score={item.familyScore.score}
                  onPress={() =>
                    router.push(`/restaurant/${item.restaurantId}?from=${venue.id}` as never)
                  }
                  imageHeight={132}
                />
              )}
            />
          </View>
        ) : null}

        <View style={styles.tail}>
          <VenueTrustPanel venueId={venue.id} />
          <CommunitySection tips={venue.communityTips} />
          <Button
            label="Open in Maps"
            variant="outline"
            fullWidth
            icon="navigate-outline"
            onPress={handleDirections}
            style={styles.mapsButton}
          />
        </View>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Create a plan"
          size="lg"
          fullWidth
          trailingArrow
          onPress={() => router.push(`/plan/${venue.id}` as never)}
        />
      </View>

      <BottomSheet
        visible={fitSheetOpen}
        onClose={() => setFitSheetOpen(false)}
        title="Why this fits your family"
      >
        {venue.familyScore.explanation.length > 0 ? (
          venue.familyScore.explanation.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.secondary[500]} />
              <Text variant="body" style={styles.reasonText}>
                {reason}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="body" color={colors.text.secondary}>
            We have not reviewed the family details for this place yet, so there is no Family Fit
            score to explain.
          </Text>
        )}

        {venue.goodToKnow?.length ? (
          <>
            <Text variant="label" style={styles.sheetGroupLabel}>
              Good to know
            </Text>
            {venue.goodToKnow.map((item) => (
              <View key={item} style={styles.reasonRow}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning[500]} />
                <Text variant="body" color={colors.text.secondary} style={styles.reasonText}>
                  {item}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </BottomSheet>
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
  descriptionBlock: {
    marginTop: spacing.lg,
  },
  readMore: {
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
  trustNote: {
    marginTop: spacing.md,
  },
  rail: {
    marginTop: spacing['3xl'],
  },
  railHeader: {
    paddingHorizontal: spacing.screenPadding,
  },
  tail: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: spacing['2xl'],
  },
  mapsButton: {
    marginTop: spacing.lg,
  },
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  reasonText: {
    flex: 1,
  },
  sheetGroupLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
