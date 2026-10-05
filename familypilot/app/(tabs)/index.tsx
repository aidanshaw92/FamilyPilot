import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceCredits } from '@/src/components/shared/PlaceCredits';
import { RecommendationDeck } from '@/src/components/home/RecommendationDeck';
import { deckMetrics, REFERENCE_WIDTH } from '@/src/utils/home-deck-geometry';
import {
  deckRoom,
  deckTopGap,
  headerShift,
  HEADER_SAVINGS,
  HomeHeaderMode,
  nextHeaderMode,
} from '@/src/utils/home-vertical-layout';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import {
  GREETING_FONT_FAMILY,
  homeGutter,
  homeHeaderLayout,
  searchPlaceholder,
} from '@/src/utils/home-header-layout';
import {
  EmptyState,
  ErrorState,
  PillSelector,
  ScreenArt,
  SearchBar,
  Skeleton,
  Text,
} from '@/src/components/ui';
import { HOME_ART } from '@/src/assets/art/figma-art';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { Venue } from '@/src/types';
import { filterByPlanCategory, planCategoriesFor } from '@/src/utils/plan-categories';

/**
 * Everything above the deck (greeting, search, plan heading, chips) is laid out in fixed points, so
 * its marks are placed with fixed points too; the deck and the marks around it grow with the phone's
 * width together. The seam is the frame's y just above the deck's first mark.
 */
const HEADER_ART_END = 605;
/** Above this the marks are beside the greeting and the search (they follow the screen's edges, so they
 * scale with the width); below it they are beside the plan heading and chips (they follow the fixed-size
 * type, so they are drawn at the reference scale, left-aligned, and never grow). */
const SEARCH_ART_END = 345;
/** The avatar's strokes end well above this and the search marks start well below it (frame y 172 / 274). */
const AVATAR_ART_END = 225;

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Home, built to the approved Figma frame "01 — Home": greeting, search, plan pills, and the
 * stacked recommendation deck. Nothing else competes for the first viewport. */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const tabBarClearance = useTabBarClearance();
  const [category, setCategory] = useState('for_you');
  const [refreshing, setRefreshing] = useState(false);
  const setFilterSheetOpen = useFiltersStore((s) => s.setFilterSheetOpen);

  const { data: profile } = useFamilyProfile();
  const { data: venues, isLoading, isError, refetch } = useNearbyVenues();

  const firstName = profile?.parentName?.split(' ')[0] ?? 'there';

  const ranked = useMemo(
    () => [...(venues ?? [])].sort((a, b) => b.familyScore.score - a.familyScore.score),
    [venues],
  );
  // One taxonomy for Home and Explore, and a category is offered only if the venues in hand can fill it: a chip
  // that answers "nothing here" is worse than no chip (see venue-taxonomy.ts).
  const categories = useMemo(() => planCategoriesFor(ranked), [ranked]);
  const activeCategory = categories.some((c) => c.id === category) ? category : 'for_you';
  const shortlist = useMemo(() => filterByPlanCategory(ranked, activeCategory), [ranked, activeCategory]);

  // The header gives up its optional lines when the screen is too short for the whole card (see
  // home-vertical-layout), so the card and its button always clear the floating navigation. The mode only ever
  // moves towards compact for a given screen size, and a measurement is trusted only once it was taken in the mode
  // now showing, so the escalation cannot overshoot on a stale reading.
  const [mode, setMode] = useState<HomeHeaderMode>('full');
  const [headerFit, setHeaderFit] = useState<{ mode: HomeHeaderMode; bottom: number } | null>(null);
  useEffect(() => {
    setMode('full');
    setHeaderFit(null);
  }, [width, windowHeight]);

  const room = headerFit
    ? deckRoom({ windowHeight, headerBottom: headerFit.bottom, mode: headerFit.mode, navClearance: tabBarClearance })
    : undefined;
  useEffect(() => {
    if (!headerFit || headerFit.mode !== mode || room === undefined) return;
    const next = nextHeaderMode(mode, room, width);
    if (next !== mode) setMode(next);
  }, [headerFit, mode, room, width]);

  const { deckHeight } = deckMetrics(width, room);
  const savings = HEADER_SAVINGS[mode];

  // The approved header is drawn at 393pt. Narrower phones get the largest treatment that still
  // fits the greeting and the placeholder whole, rather than a clipped heading.
  const greetingText = `${getTimeGreeting()}, ${firstName}`;
  const header = homeHeaderLayout(width, greetingText);
  // A long name wraps onto a second line (see homeHeaderLayout). The estimate is the first guess; the
  // measured height corrects it, so a difference between the estimate and the real text never leaves the
  // art misplaced for longer than a frame. Everything below the greeting moves down by the extra line, and
  // so does its art; the avatar and its strokes stay where the frame draws them.
  const [measuredLines, setMeasuredLines] = useState<number | null>(null);
  const greetingLines = measuredLines ?? header.lines;
  const extraHeight = (greetingLines - 1) * header.lineHeight;
  const artScale = width / HOME_ART.width;
  const gutter = { paddingHorizontal: homeGutter(width) };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openVenue = (venue: Venue) => router.push(`/venue/${venue.id}` as never);

  return (
    <View style={styles.screen}>
      {/* The approved frame's foot marks (a sprig and a mint blob beside the navigation), drawn from
          the frame's own vectors, anchored to the bottom edge so they stay beside the navigation on
          a taller phone. Behind the scroll view, so content and navigation sit above them. */}
      <ScreenArt art={HOME_ART} from={1700} to={1846} anchor="bottom" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            // The frame puts the greeting at y=58, which is where a phone's status bar ends.
            paddingTop: Math.max(insets.top, spacing.lg),
            paddingBottom: tabBarClearance,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.action}
          />
        }
      >
        {/* The frame's marks from the top edge to the navigation (strokes by the avatar, the sprig
            and dashes beside the search, the plan heading's strokes, and the blobs and leaves around
            the deck), drawn from its own vectors, anchored to the top edge like the deck they frame,
            and behind everything that is content. */}
        <ScreenArt art={HOME_ART} from={0} to={AVATAR_ART_END} anchor="top" />
        <ScreenArt
          art={HOME_ART}
          from={AVATAR_ART_END}
          to={SEARCH_ART_END}
          anchor="top"
          style={{ top: AVATAR_ART_END * artScale + extraHeight - headerShift(mode, 'beforeTitle') }}
        />
        <ScreenArt
          art={HOME_ART}
          width={Math.min(width, REFERENCE_WIDTH)}
          from={SEARCH_ART_END}
          to={HEADER_ART_END}
          anchor="top"
          style={{ top: SEARCH_ART_END * (REFERENCE_WIDTH / HOME_ART.width) + extraHeight - headerShift(mode, 'afterTitle') }}
        />
        <ScreenArt
          art={HOME_ART}
          from={HEADER_ART_END}
          to={1700}
          anchor="top"
          style={{ top: HEADER_ART_END * (REFERENCE_WIDTH / HOME_ART.width) + extraHeight - headerShift(mode, 'all') }}
        />
        <View
          onLayout={(e) =>
            setHeaderFit({ mode, bottom: e.nativeEvent.layout.y + e.nativeEvent.layout.height })
          }
        >
        <View style={gutter}>
          <View style={[styles.header, { gap: header.gap }]}>
            <View style={styles.greeting}>
              <Text
                variant="heading1"
                numberOfLines={2}
                onLayout={(e) =>
                  setMeasuredLines(Math.max(1, Math.round(e.nativeEvent.layout.height / header.lineHeight)))
                }
                style={[
                  styles.greetingLine,
                  { fontSize: header.fontSize, lineHeight: header.lineHeight, maxWidth: header.textLimit },
                ]}
              >
                {greetingText}
              </Text>
              {savings.subtitle === 0 ? (
                <Text variant="bodySmall" color={colors.text.secondary} style={styles.greetingSub}>
                  What shall we do today?
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your family profile"
              onPress={() => router.push('/(tabs)/profile' as never)}
              style={[styles.avatar, { marginTop: header.avatarOffset }]}
            >
              <Text variant="heading3" color={colors.text.inverse}>
                {firstName.charAt(0).toUpperCase()}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.searchRow, { marginTop: styles.searchRow.marginTop - savings.searchGap }]}>
            <SearchBar
              placeholder={searchPlaceholder(width)}
              onPress={() => router.push('/(tabs)/explore' as never)}
              onFilterPress={() => setFilterSheetOpen(true)}
            />
          </View>

          {savings.title === 0 ? (
            <View style={styles.sectionTitleRow}>
              <Text variant="heading2" style={styles.sectionTitle}>
                Select your plan
              </Text>
            </View>
          ) : (
            <View style={styles.compactChipsGap} />
          )}
        </View>

        <PillSelector
          options={categories}
          value={activeCategory}
          onChange={setCategory}
          accessibilityLabel="Plan categories"
          size="home"
          contentStyle={{ paddingLeft: homeGutter(width) }}
        />
        </View>

        {isError ? (
          <View style={[gutter, styles.deckSlot, { marginTop: deckTopGap(mode) }]}>
            <ErrorState onRetry={() => void refetch()} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={[gutter, styles.deckSlot, { marginTop: deckTopGap(mode) }]}>
            <Skeleton height={deckHeight} borderRadius={radius['3xl']} />
          </View>
        ) : null}

        {!isLoading && !isError && shortlist.length === 0 ? (
          <View style={[gutter, styles.deckSlot, { marginTop: deckTopGap(mode) }]}>
            <EmptyState
              icon="search-outline"
              title="Nothing confirmed here yet"
              message="We only show places once the family details we need have been reviewed. Try another category."
              actionLabel="See everything nearby"
              onAction={() => setCategory('for_you')}
            />
          </View>
        ) : null}

        {!isLoading && !isError && shortlist.length > 0 ? (
          <View style={[styles.deckSlot, { marginTop: deckTopGap(mode) }]}>
            <RecommendationDeck
              venues={shortlist}
              viewportWidth={width}
              maxHeight={room}
              onPressVenue={openVenue}
            />
          </View>
        ) : null}

        {/* The credits the deck's own places owe. Google requires its mark wherever its content
            appears without a Google map, and OpenStreetMap's licence asks for its contributors'
            credit -- so the line is derived from the shortlist in hand rather than assumed to be
            Google's. It sits in the gap the frame already leaves between the deck and the
            navigation, so nothing in the approved composition moves. */}
        {!isLoading && !isError && shortlist.length > 0 ? (
          <View style={styles.attribution}>
            <PlaceCredits places={shortlist} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {},
  header: {
    flexDirection: 'row',
    // The avatar keeps its place beside the first line (and its strokes in the art stay beside it) when
    // a long name wraps onto a second.
    alignItems: 'flex-start',
  },
  greeting: {
    flex: 1,
  },
  greetingLine: {
    fontFamily: GREETING_FONT_FAMILY,
    color: colors.ink,
  },
  greetingSub: {
    // Frame: greeting ends at y=89, subtitle starts at 94 and is 17 tall.
    marginTop: 4,
    lineHeight: 17,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The gaps below are the approved frame's own: subtitle 111 -> search 126, search 182 ->
  // heading 198, heading 225 -> pills 234, pills 278 -> deck 307.
  searchRow: {
    marginTop: 15,
  },
  searchSprig: {
    left: -17,
    top: -12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 9,
    // Frame 229:133: Bold 45.4px = 20.9pt.
    fontSize: 21,
    lineHeight: 26,
    color: colors.ink,
  },
  deckSlot: {
    marginTop: 27,
  },
  // Stands in for the plan heading's own margins in the compact header, so the chips keep clear of the search field.
  compactChipsGap: {
    height: 14,
  },
  attribution: {
    marginTop: spacing.xs,
    alignItems: 'center',
  },
});
