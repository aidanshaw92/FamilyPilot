import { VenueTrustPanel } from '@/src/components/planning/VisitFeedback';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { FamilyEssentials } from '@/src/components/venue/FamilyEssentials';
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
import { ArrowCta } from '@/src/components/ui/ArrowCta';
import { CreatePlanSheet } from '@/src/components/planning/CreatePlanSheet';
import { PlanDraft, planDraftDefaults } from '@/src/services/planning/plan-draft';
import { profileReceipt } from '@/src/utils/profile-receipt';
import { photoAttribution } from '@/src/services/places/place-photo-url';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { colors, spacing } from '@/src/design-system/tokens';
import { safeFooterPadding } from '@/src/utils/safe-area';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { isActivityVenue } from '@/src/data/mock-restaurants';
import { useFamilyProfile, useNearbyFood, useVenue } from '@/src/hooks/use-queries';
import { useSavedStore } from '@/src/stores/saved-store';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { formatCategory } from '@/src/utils/format-category';
import { generateVenueStaticParams } from '@/src/utils/venue-routes';
import { travelTimeLabel } from '@/src/utils/travel-time';

/**
 * Taller than the 250 it was: the hero now carries the category eyebrow, the title and the Family
 * Match badge the Home card showed, so a parent lands on the same facts they tapped. 300 holds a
 * four-line name at 360 wide with the controls clear above it.
 */
const HERO_HEIGHT = 300;
/** Frame 02: the sheet (node 49:2) starts at y 256 over a 300 hero, so it overlaps by 44. */
const SHEET_OVERLAP = 44;
/** Two lines of 15/23 description before "Read more", as the frame shows (node 49:14). */
const DESCRIPTION_LINES = 2;
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
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const fitPanelY = useRef(0);
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
  const description = venue.description?.trim() ?? '';
  const descriptionIsLong = description.length > 140;
  const scrollToFit = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, fitPanelY.current - spacing.lg), animated: true });
  };

  return (
    <View style={styles.container}>
      <AnimatedScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: safeFooterPadding(insets.bottom) + spacing['2xl'] }}
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
          {/* Frame 02 (node 69:2): a scrim over the top half only, enough for the controls to read. */}
          <LinearGradient colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']} style={styles.heroScrim} />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.sm }]}>
            {/* The frame's white 44 circles (nodes 48:17, 48:20). */}
            <View style={styles.heroCircle}>
              <BackButton onPress={handleBack} />
            </View>
            <View style={styles.heroActions}>
              <View style={styles.heroCircle}>
                <ShareButton title={venue.name} path={`/venue/${venue.id}`} color={colors.action} />
              </View>
              <View style={styles.heroCircle}>
                <SaveButton venueId={venue.id} venue={venue} color={colors.action} />
              </View>
            </View>
          </View>
        </View>

        {/* The sheet (node 49:2) rides up over the photograph with the grabber the frame draws. */}
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <FadeInView>
            <View style={styles.nameRow}>
              <Text variant="heading1" style={styles.name}>
                {venue.name}
              </Text>
              {/* The compact badge beside the name (node 49:5); "Why this score" carries the word. */}
              <FamilyMatch
                score={venue.familyScore.score}
                enrichmentStatus={venue.enrichmentStatus}
                size="compact"
                onPress={scrollToFit}
              />
            </View>
            <View style={styles.locationRow}>
              <View style={styles.location}>
                <Ionicons name="location-outline" size={16} color={colors.text.secondary} />
                {/* Hedged: this is a straight-line estimate, not a routed drive. */}
                <Text style={styles.locationText} numberOfLines={1}>
                  {formatCategory(venue.category)} · {travelTimeLabel(venue.driveMinutes, 'estimated')}
                </Text>
              </View>
              <Pressable onPress={scrollToFit} accessibilityRole="button" hitSlop={10}>
                <Text style={styles.whyLink}>Why this score</Text>
              </Pressable>
            </View>

            {description ? (
              <View style={styles.descriptionBlock}>
                <Text style={styles.description} numberOfLines={descriptionOpen ? undefined : DESCRIPTION_LINES}>
                  {description}
                </Text>
                {descriptionIsLong ? (
                  <Pressable
                    onPress={() => setDescriptionOpen((open) => !open)}
                    accessibilityRole="button"
                    hitSlop={10}
                    style={styles.readMore}
                  >
                    <Text style={styles.readMoreText}>{descriptionOpen ? 'Read less' : 'Read more'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Places to eat near THIS venue, from OpenStreetMap. Zero Google calls, one Overpass
                request per anchor shared across every parent who opens it. The section renders its
                own pending, outage and nothing-mapped states, which are three different things. */}
            <RestaurantsCloseBy
              result={nearbyFood.data}
              isPending={nearbyFood.isPending}
              isError={nearbyFood.isError}
            />

            {/* Create a plan is the one action this screen exists to offer, drawn as the frame's
                CTA (node 72:2), the same pill as Home's "See more". Tapping a venue never creates a
                plan; this does, through the sheet. */}
            <ArrowCta
              label="Create a plan"
              onPress={() => setPlanSheetOpen(true)}
              testID="venue-create-plan"
              style={styles.cta}
            />

            <Text variant="heading2" style={styles.sectionTitle}>
              Family essentials
            </Text>
            <FamilyEssentials venue={venue} />

            <View
              style={styles.fitSection}
              onLayout={(event) => {
                fitPanelY.current = HERO_HEIGHT - SHEET_OVERLAP + event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.matchIntro}>
                <Text variant="eyebrow">FAMILY FIT</Text>
                <Text variant="heading2">Will this work for your family?</Text>
              </View>
              {/* The word leads inside the panel ("Good fit"); the number sits on the badge above. */}
              <FamilyMatchPanel familyScore={venue.familyScore} venue={venue} />
            </View>

            {venue.trustedFacts ? (
              <CheckTodaySection
                facts={venue.trustedFacts}
                latitude={venue.latitude}
                longitude={venue.longitude}
              />
            ) : null}

            <Text variant="heading2" style={styles.sectionTitle}>
              Getting there
            </Text>
            {venue.address ? (
              <Text variant="body" color={colors.text.secondary} style={styles.address}>
                {venue.address}
              </Text>
            ) : null}
            <View style={styles.actionRow}>
              <Button label="Directions" variant="secondary" onPress={handleDirections} style={styles.actionButton} />
              {venue.website && /^https?:\/\//.test(venue.website) ? (
                <Button
                  label="Website"
                  variant="secondary"
                  onPress={() => void Linking.openURL(venue.website!)}
                  style={styles.actionButton}
                />
              ) : null}
            </View>
            {venue.phone ? (
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.phone}>
                Phone {venue.phone}
              </Text>
            ) : null}

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

            {isActivityVenue(venue) && isPilotFeatureVisible('eat_nearby') ? (
              <EatNearbySection
                activityVenueId={venue.id}
                activityVenueName={venue.name}
              />
            ) : null}

            {venue.weatherAlternative ? (
              <WeatherAlternativeSection alternative={venue.weatherAlternative} />
            ) : null}

            <VenueTrustPanel venueId={venue.id}/>
            <CommunitySection tips={venue.communityTips} />
          </FadeInView>
        </View>
      </AnimatedScrollView>

      <CreatePlanSheet
        visible={planSheetOpen}
        onClose={() => setPlanSheetOpen(false)}
        venueName={venue.name}
        draft={draft}
        parties={planDefaults.parties}
        onDraftChange={setDraftOverride}
        onCreate={handleCreatePlan}
        receipt={profileReceipt(profile)}
        onEditProfile={() => {
          setPlanSheetOpen(false);
          router.push('/profile/edit' as never);
        }}
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
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT / 2,
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    zIndex: 2,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Node 49:2: the sheet overlaps the hero by 44 with a 28 radius, the grabber 12 below its top.
  sheet: {
    marginTop: -SHEET_OVERLAP,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: {
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  // Node 49:12: Medium 15 in secondary ink.
  locationText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 18,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  // Node 49:13: Medium 13, underlined, in tertiary ink.
  whyLink: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 16,
    color: colors.text.tertiary,
    textDecorationLine: 'underline',
  },
  descriptionBlock: {
    marginTop: spacing.xl,
  },
  // Node 49:14: Regular 15 on a 23 line, secondary ink.
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
    color: colors.text.secondary,
  },
  readMore: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    minHeight: 32,
    justifyContent: 'center',
  },
  // Node 49:15: SemiBold 14, underlined, ink.
  readMoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 17,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  cta: {
    marginTop: spacing['2xl'],
  },
  sectionTitle: {
    marginTop: spacing['3xl'],
    marginBottom: spacing.lg,
  },
  fitSection: {
    marginTop: spacing['3xl'],
  },
  matchIntro: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  address: {
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  phone: {
    marginTop: spacing.md,
  },
  photoAttribution: {
    marginTop: spacing.md,
  },
});
