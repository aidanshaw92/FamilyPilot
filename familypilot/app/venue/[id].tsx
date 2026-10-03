import { VenueTrustPanel } from '@/src/components/planning/VisitFeedback';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckTodaySection } from '@/src/components/venue/CheckTodaySection';
import { CommunitySection } from '@/src/components/venue/CommunitySection';
import { EatNearbySection } from '@/src/components/venue/EatNearbySection';
import { FacilityGrid } from '@/src/components/venue/FacilityGrid';
import { PhotoGallery } from '@/src/components/venue/PhotoGallery';
import { RestaurantsCloseBy } from '@/src/components/venue/RestaurantsCloseBy';
import { WeatherAlternativeSection } from '@/src/components/venue/WeatherAlternativeSection';
import { PhotoAttributionLine } from '@/src/components/shared/GoogleAttribution';
import { PlaceAttribution } from '@/src/components/shared/PlaceAttribution';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { ShareButton } from '@/src/components/shared/ShareButton';
import {
  Button,
  EmptyState,
  FamilyMatch,
  FamilyMatchPanel,
  Skeleton,
  Text,
  VenueImage,
} from '@/src/components/ui';
import { BackButton } from '@/src/components/ui/BackButton';
import { CreatePlanSheet } from '@/src/components/planning/CreatePlanSheet';
import { PlanDraft, planDraftDefaults } from '@/src/services/planning/plan-draft';
import { photoAttribution } from '@/src/services/places/place-photo-url';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { safeFooterPadding } from '@/src/utils/safe-area';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { isActivityVenue } from '@/src/data/mock-restaurants';
import { useFamilyProfile, useNearbyFood, useVenue } from '@/src/hooks/use-queries';
import { useSavedStore } from '@/src/stores/saved-store';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { getEnrichmentDetailTrustCopy, formatTerrainLabel, getMatchClassification } from '@/src/utils/family-match-classification';
import { generateVenueStaticParams } from '@/src/utils/venue-routes';
import { travelTimeLabel } from '@/src/utils/travel-time';

const HERO_HEIGHT = 250;
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export function generateStaticParams() {
  return generateVenueStaticParams();
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: venue, isLoading, isError, refetch } = useVenue(id ?? '');
  // Keyed on the venue's coordinates, so it starts only once the venue has loaded and two venues at
  // the same address share one lookup.
  const nearbyFood = useNearbyFood({
    latitude: venue?.latitude,
    longitude: venue?.longitude,
    placeId: venue?.id,
  });
  const { isSaved, toggleSaved } = useSavedStore();
  const scrollY = useSharedValue(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  // Create a plan is the hinge of this screen, so everything it needs is read here and nothing is
  // fetched for it: the profile and the stored planning options are already in memory.
  const { data: profile } = useFamilyProfile();
  const planningFamilies = usePlanningStore((state) => state.families);
  const planningOptions = usePlanningStore((state) => state.options);
  const setPlanningOptions = usePlanningStore((state) => state.setOptions);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [draftOverride, setDraftOverride] = useState<PlanDraft | null>(null);

  const planDefaults = useMemo(
    () =>
      planDraftDefaults({
        profile,
        planningFamilies,
        options: planningOptions,
        today: localDate(),
      }),
    [profile, planningFamilies, planningOptions],
  );
  const draft = draftOverride ?? planDefaults.draft;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Parallax hero effect is exactly the kind of scroll-triggered motion reduced-motion
  // preferences are meant to suppress - keep the hero static (no translate/scale) instead.
  const heroStyle = useAnimatedStyle(() => ({
    transform: reducedMotion
      ? []
      : [
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

  // The draft is remembered as planning options so a parent who leaves to add a family and comes
  // back does not re-answer the rows they already answered.
  const handleCreatePlan = useCallback(
    (next: PlanDraft) => {
      setPlanningOptions({ date: next.date, leaveAt: next.leaveAt, visitMinutes: next.visitMinutes });
      setPlanSheetOpen(false);
      router.push({
        pathname: '/plan',
        params: {
          venue: id ?? '',
          date: next.date,
          leaveAt: next.leaveAt,
          visit: String(next.visitMinutes),
          parties: next.partyIds.join(','),
        },
      } as never);
    },
    [id, router, setPlanningOptions],
  );

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
  const heroAttribution = photoAttribution(heroPhoto);
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
              <ShareButton title={venue.name} path={`/venue/${venue.id}`} color={colors.text.inverse} />
              <SaveButton venueId={venue.id} venue={venue} color={colors.text.inverse} />
            </View>
          </View>
          <View style={styles.heroTitle}>
            <Text variant="heading1" color={colors.text.inverse}>
              {venue.name}
            </Text>
            <View style={styles.heroMeta}>
              {/* Hedged: this is a straight-line estimate, not a routed drive. */}
              <MetaItem icon="car-outline" text={travelTimeLabel(venue.driveMinutes, 'estimated')} />
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
            <View style={styles.matchIntro}>
              <Text variant="caption" style={styles.matchEyebrow}>
                FAMILY MATCH
              </Text>
              <Text variant="heading2">Will this work for your family?</Text>
            </View>
            <View style={styles.scoreBand}>
              <View style={styles.scoreBandText}>
                <Text variant="heading3">{getMatchClassification(venue.familyScore.score, venue.enrichmentStatus)}</Text>
                <Text variant="bodySmall" color={colors.text.secondary}>How well it fits your household</Text>
              </View>
              <FamilyMatch score={venue.familyScore.score} enrichmentStatus={venue.enrichmentStatus} />
            </View>
            <FamilyMatchPanel familyScore={venue.familyScore} venue={venue} showClassification={false} />

            {venue.enrichmentStatus ? (
              <Text variant="caption" color={colors.text.secondary} style={styles.providerOnlyBanner}>
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

            {venue.address ? <Text variant="bodySmall" style={{marginBottom:12}}>{venue.address}</Text> : null}
            <Button label="Get directions" variant="outline" onPress={handleDirections} style={styles.directionsButton} />
            {venue.website && /^https?:\/\//.test(venue.website) ? <Button label="Official website & visitor information" variant="outline" onPress={() => void Linking.openURL(venue.website!)}/> : null}
            {venue.phone ? <Text variant="bodySmall" style={{marginVertical:12}}>Contact: {venue.phone}</Text> : null}
            <PhotoGallery photos={venue.photos} onPhotoPress={setHeroIndex} />

            {/* This is the larger version of the photograph Home previews, so it carries the full
                attribution Google requires: the photographer, their profile, and a way to open the
                individual photo on Google Maps. */}
            {heroAttribution ? (
              <View style={styles.photoAttribution}>
                <PhotoAttributionLine attribution={heroAttribution} />
              </View>
            ) : null}

            {/* Whose data this is. A licence condition for both providers, and until now the client
                could not tell them apart, so Google's mark sat over OpenStreetMap places. */}
            <View style={styles.photoAttribution}>
              <PlaceAttribution provider={venue.provider} />
            </View>

            <Text variant="heading3" style={styles.sectionTitle}>
              Facilities
            </Text>
            <FacilityGrid facilities={venue.facilities ?? []} />

            <View style={styles.detailsGrid}>
              <DetailItem
                icon="people-outline"
                label="Best for ages"
                value={venue.bestAges ?? 'Not confirmed yet'}
              />
              <DetailItem
                icon="trail-sign-outline"
                label="Terrain"
                value={venue.terrain ? formatTerrainLabel(venue.terrain) : 'Not confirmed yet'}
              />
              <DetailItem icon="time-outline" label="Opening hours" value={venue.openingHours} />
              <DetailItem
                icon="car-outline"
                label="Parking"
                value={
                  venue.parkingInfo ??
                  // The Facilities grid above already renders a "Parking" icon whenever
                  // 'parking' is a confirmed facility — never contradict that here by calling
                  // the same fact "Not confirmed yet" just because the richer free-text detail
                  // (spaces, cost) hasn't been reviewed yet.
                  (venue.facilities?.includes('parking')
                    ? 'Available on site — more detail not confirmed'
                    : 'Not confirmed yet')
                }
              />
            </View>

            {isActivityVenue(venue) && isPilotFeatureVisible('eat_nearby') ? (
              <EatNearbySection
                activityVenueId={venue.id}
                activityVenueName={venue.name}
              />
            ) : null}

            {venue.weatherAlternative ? (
              <WeatherAlternativeSection alternative={venue.weatherAlternative} />
            ) : null}

            {/* Places to eat near THIS venue, from OpenStreetMap. Zero Google calls, one Overpass
                request per anchor shared across every parent who opens it. The section renders its
                own pending, outage and nothing-mapped states, which are three different things. */}
            <RestaurantsCloseBy
              result={nearbyFood.data}
              isPending={nearbyFood.isPending}
              isError={nearbyFood.isError}
            />

            <Text variant="body" style={styles.description}>
              {venue.description}
            </Text>

            <VenueTrustPanel venueId={venue.id}/>
            <CommunitySection tips={venue.communityTips} />
          </FadeInView>
        </View>
      </AnimatedScrollView>

      {/* Save sits beside Create a plan, and Get directions has moved into the content above.
          Create a plan is the one action this screen exists to offer, so it is the only primary
          button here; directions are what a parent wants once the day is decided, not instead. */}
      <View style={[styles.footer, { paddingBottom: safeFooterPadding(insets.bottom) }]}>
        <Button
          label={saved ? 'Saved' : 'Save'}
          variant="outline"
          style={styles.saveButton}
          onPress={() => toggleSaved(venue.id, venue)}
        />
        <Button
          label="Create a plan"
          style={styles.planButton}
          onPress={() => setPlanSheetOpen(true)}
          testID="venue-create-plan"
        />
      </View>

      <CreatePlanSheet
        visible={planSheetOpen}
        onClose={() => setPlanSheetOpen(false)}
        venueName={venue.name}
        draft={draft}
        parties={planDefaults.parties}
        onDraftChange={setDraftOverride}
        onCreate={handleCreatePlan}
        onAddFamily={
          isPilotFeatureVisible('trips_tab')
            ? () => {
                setPlanSheetOpen(false);
                router.push('/(tabs)/trips' as never);
              }
            : undefined
        }
      />
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
      <Ionicons name={icon} size={18} color={colors.text.secondary} />
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
  matchIntro: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  matchEyebrow: {
    color: colors.secondary[600],
    letterSpacing: 1.1,
    fontFamily: 'Inter_700Bold',
  },
  scoreBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.fill,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  scoreBandText: {
    flex: 1,
    gap: 2,
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
  providerOnlyBanner: {
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  sectionTitle: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  photoAttribution: {
    marginTop: spacing.md,
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
    // No `textTransform: 'capitalize'`. Every value in this column is already written for a person:
    // `formatTerrainLabel` returns "Mostly flat", the hours are the provider's own display copy, and
    // the parking line is reviewed prose. Title-casing them produced "Monday To Sunday: 09:00 To
    // 17:00", "2 To 10", and a whole reviewed sentence rendered as "Free On-Site Car Park, About 120
    // Spaces, Busiest Before 11am At Weekends." A venue whose facts are confirmed is the only place
    // this shows, which is why no check had ever caught it.
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
  // Create a plan is the wider of the two, so the hinge of the screen reads as the main action
  // rather than as one of a matched pair.
  saveButton: {
    flex: 1,
  },
  planButton: {
    flex: 1.6,
  },
  directionsButton: {
    marginBottom: spacing.md,
  },
});
