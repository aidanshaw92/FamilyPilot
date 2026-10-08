import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { EvidenceSection } from '@/src/components/venue/EvidenceSection';
import { FamilyMatchCard } from '@/src/components/venue/FamilyMatchCard';
import { FamilyFitCheckingBadge, FamilyFitCheckingCard } from '@/src/components/venue/FamilyFitChecking';
import { fitIsBeingChecked } from '@/src/utils/fit-checking';
import { TodayCard } from '@/src/components/venue/TodayCard';
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
  Skeleton,
  Text,
  VenueImage,
} from '@/src/components/ui';
import { BackButton } from '@/src/components/ui/BackButton';
import { ArrowCta } from '@/src/components/ui/ArrowCta';
import { CreatePlanSheet } from '@/src/components/planning/CreatePlanSheet';
import { PlanDraft, firstValue, optionsToRemember, planDraftDefaults, planDraftFromParams, planDraftToParams } from '@/src/services/planning/plan-draft';
import { profileReceipt } from '@/src/utils/profile-receipt';
import { photoAttribution } from '@/src/services/places/place-photo-url';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { colors, spacing } from '@/src/design-system/tokens';
import { safeFooterPadding } from '@/src/utils/safe-area';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { accountRequired } from '@/src/stores/auth-store';
import { isActivityVenue } from '@/src/data/mock-restaurants';
import { useFamilyProfile, useNearbyFood, useParentObservations, useVenue, useWeather } from '@/src/hooks/use-queries';
import { venueService } from '@/src/services/api';
import { useSavedStore } from '@/src/stores/saved-store';
import { minTarget } from '@/src/components/ui/touch';
import { useNamedDocumentTitle } from '@/src/hooks/use-document-title';
import { localDate, localTime, usePlanningStore } from '@/src/stores/planning-store';
import { describeOpeningToday } from '@/src/utils/opening-today';
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
  const searchParams = useLocalSearchParams();
  const id = firstValue(searchParams.id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: baseVenue, isLoading, isError, refetch, isPlaceholderData } = useVenue(id ?? '', { showCardWhileLoading: true });
  // True while `venue` is the CARD the parent tapped, standing in until the full detail returns. The card knows the place's
  // identity, photograph, travel time and fit badge (all of which the parent just saw), and nothing evidence-backed: so those
  // are drawn, and everything else waits for the real detail rather than being drawn from a partial record.
  const pending = Boolean(isPlaceholderData);
  // Parent reports are read AFTER the venue's own facts are on screen and applied when they arrive: they can correct a line,
  // never delay the page. Only for the full detail: a card standing in for it is never corrected, it is replaced.
  const parentReports = useParentObservations(id ?? '', Boolean(baseVenue) && !pending);
  const venue = useMemo(
    () => (baseVenue && !pending ? venueService.withParentObservations(baseVenue, parentReports.data) : baseVenue),
    [baseVenue, pending, parentReports.data],
  );
  // A venue the server says has recent parent reports shows Family Fit as "checking" until they are read (three seconds at
  // most), instead of a verdict that a report may take back. A venue without recent reports never waits.
  const fitChecking = fitIsBeingChecked({
    pending,
    hasRecentParentReports: baseVenue?.hasRecentParentReports,
    reportsLoading: parentReports.isLoading,
  });
  // Today's conditions are shown beside the fit, never in it, and arrive on their own: a slow forecast leaves a quiet line
  // out and holds nothing back.
  const { data: weather } = useWeather();
  useNamedDocumentTitle(venue?.name);
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
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [startReport, setStartReport] = useState(false);
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
        nowTime: localTime(),
        // Shut today: the sheet opens on the day it next opens, so planning stays one tap away.
        opensAgainInDays: venue ? describeOpeningToday(venue.structuredOpeningHours, new Date()).opensAgainInDays ?? null : null,
      }),
    // `planSheetOpen` is a dependency so the date and time are read again each time the sheet opens: a
    // screen left open past the day's start must not offer a day that has already begun.
    [profile, planningFamilies, planningOptions, planSheetOpen, venue],
  );
  const draft = draftOverride ?? planDefaults.draft;

  // "Change the plan" on a plan that could not be built returns here with the sheet open on the answers the parent had
  // chosen, so changing one is one tap. Opened once, from the link's own parameters.
  const reopenPlan = firstValue(searchParams.plan) === 'open';
  const reopened = useRef(false);
  useEffect(() => {
    if (!reopenPlan || reopened.current) return;
    reopened.current = true;
    setDraftOverride(planDraftFromParams(searchParams as Record<string, string | string[] | undefined>));
    setPlanSheetOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenPlan]);

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
      // A date or start the parent CHANGED is remembered as a convenience; a suggestion they left alone is not (it is worked
      // out again each time, from the clock). Who is coming and how long are asked afresh each time.
      const chosen = optionsToRemember(next, planDefaults.draft);
      if (Object.keys(chosen).length > 0) setPlanningOptions(chosen);
      setPlanSheetOpen(false);
      router.push({
        pathname: '/plan',
        params: { venue: id ?? '', ...planDraftToParams(next) },
      } as never);
    },
    [id, router, setPlanningOptions, planDefaults],
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
    if (pending) return;
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
              <Text variant="heading1" style={styles.name} testID="venue-name">
                {venue.name}
              </Text>
              {/* The compact badge beside the name (node 49:5); "Why this score" carries the word. */}
              {fitChecking ? (
                <FamilyFitCheckingBadge />
              ) : (
                <FamilyMatch
                  score={venue.familyScore.score}
                  enrichmentStatus={venue.enrichmentStatus}
                  match={venue.familyMatch}
                  size="compact"
                  onPress={scrollToFit}
                />
              )}
            </View>
            <View style={styles.locationRow}>
              <View style={styles.location}>
                <Ionicons name="location-outline" size={16} color={colors.text.secondary} />
                {/* Hedged: this is a straight-line estimate, not a routed drive. */}
                <Text style={styles.locationText} numberOfLines={1}>
                  {formatCategory(venue.category)} · {travelTimeLabel(venue.driveMinutes, 'estimated')}
                </Text>
              </View>
              {/* The explanation it scrolls to is not on screen until the full detail is: held invisibly and inert until then, so
                  the row keeps its height and nothing moves when the real screen replaces the card. */}
              <Pressable
                onPress={scrollToFit}
                disabled={pending}
                accessibilityRole="button"
                accessibilityElementsHidden={pending}
                importantForAccessibility={pending ? 'no-hide-descendants' : 'auto'}
                hitSlop={10}
                style={[minTarget(16), pending ? styles.hiddenWhilePending : null]}
              >
                <Text style={styles.whyLink}>Why this fit</Text>
              </Pressable>
            </View>

            {pending ? (
              <View
                style={styles.pendingBody}
                testID="venue-detail-pending"
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`Getting the details for ${venue.name}`}
              >
                <Skeleton height={132} style={styles.loadingGap} />
                <Skeleton height={64} style={styles.loadingGap} />
                <Skeleton height={52} style={styles.loadingGap} />
                <Skeleton height={160} />
              </View>
            ) : null}

            {pending ? null : (
            <>
            {/* 1. Family Match: what FamilyPilot tells THIS family, and why. The first thing under the name. */}
            <View
              style={styles.block}
              onLayout={(event) => {
                fitPanelY.current = HERO_HEIGHT - SHEET_OVERLAP + event.nativeEvent.layout.y;
              }}
            >
              {fitChecking ? <FamilyFitCheckingCard /> : venue.familyMatch ? <FamilyMatchCard match={venue.familyMatch} /> : null}
            </View>

            {/* 2. Will it work TODAY: the opening state from the schedule and the clock, then the routine check. */}
            <View style={styles.block}>
              <TodayCard hours={venue.structuredOpeningHours} weather={weather} environment={venue.trustedFacts?.environment} />
            </View>

            {/* 3. The action this screen exists for, straight after the answer to "is it good for us, and will it work today":
                Create a plan, drawn as the frame's CTA (node 72:2). Tapping a venue never creates a plan; this does, through
                the sheet. It sits here, not at the foot of a long page, so nobody scrolls past everything to find it. */}
            <ArrowCta
              label="Create a plan"
              onPress={() => setPlanSheetOpen(true)}
              testID="venue-create-plan"
              style={styles.cta}
            />

            {/* 4. What to know: the key family essentials: what is confirmed, and one line for what is not. */}
            <Text variant="heading2" style={styles.sectionTitle}>
              What to know
            </Text>
            <FamilyEssentials
              venue={venue}
              profile={profile ?? null}
              onHelpCheck={() => {
                setStartReport(true);
                setEvidenceOpen(true);
              }}
            />

            {/* 4. Food nearby, from OpenStreetMap: zero Google calls, one Overpass request per anchor shared across
                every parent who opens it. The section renders its own pending, outage and nothing-mapped states. */}
            <RestaurantsCloseBy
              result={nearbyFood.data}
              isPending={nearbyFood.isPending}
              isError={nearbyFood.isError}
            />

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

            {/* 5. Everything else, one tap away: the description, photographs, weather alternative and parents' tips. */}
            <View style={styles.block}>
              <Pressable
                onPress={() => setMoreOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: moreOpen }}
                accessibilityLabel="More about this place"
                style={styles.moreHeader}
                testID="venue-more-toggle"
              >
                <View style={styles.moreText}>
                  <Text variant="heading3">More about this place</Text>
                  <Text variant="bodySmall" color={colors.text.secondary}>
                    Description, photos and parents’ tips
                  </Text>
                </View>
                <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
              </Pressable>
              {moreOpen ? (
                <View style={styles.moreBody} testID="venue-more">
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

                  <PhotoGallery photos={venue.photos} onPhotoPress={setHeroIndex} />

                  {/* This is the larger version of the photograph Home previews, so it carries the full
                      attribution Google requires: the photographer, their profile, and a way to open the
                      individual photo on Google Maps. */}
                  {heroAttribution ? (
                    <View style={styles.photoAttribution}>
                      <PhotoAttributionLine attribution={heroAttribution} />
                    </View>
                  ) : null}

                  {/* Whose data this is. A licence condition for both providers. */}
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

                  <CommunitySection tips={venue.communityTips} />
                </View>
              ) : null}
            </View>

            {/* 6. How we know this: the deeper evidence, sources, dates and parent observations, one tap away and never hidden. */}
            <View style={styles.block}>
              <EvidenceSection
                venueId={venue.id}
                expanded={evidenceOpen}
                onToggle={() => setEvidenceOpen((open) => !open)}
                startReport={startReport}
              />
            </View>
            </>
            )}

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
        connections={accountRequired() && isPilotFeatureVisible('trips_tab')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  moreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 56 },
  moreText: { flex: 1, gap: 2 },
  moreBody: { gap: spacing.md, paddingTop: spacing.md },
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
  pendingBody: {
    marginTop: spacing.lg,
  },
  hiddenWhilePending: {
    opacity: 0,
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
  // The decision blocks (Family Match, Today, evidence) sit apart from the list-like sections around them.
  block: {
    marginTop: spacing['2xl'],
    gap: spacing.md,
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
