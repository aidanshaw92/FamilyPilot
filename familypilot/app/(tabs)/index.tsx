import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { filterByPlanCategory, PLAN_CATEGORIES } from '@/src/utils/plan-categories';

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

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Home, built to the approved Figma frame "01 — Home": greeting, search, plan pills, and the
 * stacked recommendation deck. Nothing else competes for the first viewport. */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  const shortlist = useMemo(() => filterByPlanCategory(ranked, category), [ranked, category]);

  const { deckHeight } = deckMetrics(width);

  // The approved header is drawn at 393pt. Narrower phones get the largest treatment that still
  // fits the greeting and the placeholder whole, rather than a clipped heading.
  const greetingText = `${getTimeGreeting()}, ${firstName}`;
  const header = homeHeaderLayout(width, greetingText);
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
        <ScreenArt art={HOME_ART} from={0} to={SEARCH_ART_END} anchor="top" />
        <ScreenArt
          art={HOME_ART}
          width={Math.min(width, REFERENCE_WIDTH)}
          from={SEARCH_ART_END}
          to={HEADER_ART_END}
          anchor="top"
          style={{ top: SEARCH_ART_END * (REFERENCE_WIDTH / HOME_ART.width) }}
        />
        <ScreenArt
          art={HOME_ART}
          from={HEADER_ART_END}
          to={1700}
          anchor="top"
          style={{ top: HEADER_ART_END * (REFERENCE_WIDTH / HOME_ART.width) }}
        />
        <View style={gutter}>
          <View style={[styles.header, { gap: header.gap }]}>
            <View style={styles.greeting}>
              <Text
                variant="heading1"
                numberOfLines={header.maxLines}
                style={[
                  styles.greetingLine,
                  { fontSize: header.fontSize, lineHeight: header.lineHeight },
                ]}
              >
                {greetingText}
              </Text>
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.greetingSub}>
                What shall we do today?
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your family profile"
              onPress={() => router.push('/(tabs)/profile' as never)}
              style={styles.avatar}
            >
              <Text variant="heading3" color={colors.text.inverse}>
                {firstName.charAt(0).toUpperCase()}
              </Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <SearchBar
              placeholder={searchPlaceholder(width)}
              onPress={() => router.push('/(tabs)/explore' as never)}
              onFilterPress={() => setFilterSheetOpen(true)}
            />
          </View>

          <View style={styles.sectionTitleRow}>
            <Text variant="heading2" style={styles.sectionTitle}>
              Select your plan
            </Text>
          </View>
        </View>

        <PillSelector
          options={PLAN_CATEGORIES}
          value={category}
          onChange={setCategory}
          accessibilityLabel="Plan categories"
          size="home"
          contentStyle={{ paddingLeft: homeGutter(width) }}
        />

        {isError ? (
          <View style={[gutter, styles.deckSlot]}>
            <ErrorState onRetry={() => void refetch()} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={[gutter, styles.deckSlot]}>
            <Skeleton height={deckHeight} borderRadius={radius['3xl']} />
          </View>
        ) : null}

        {!isLoading && !isError && shortlist.length === 0 ? (
          <View style={[gutter, styles.deckSlot]}>
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
          <View style={styles.deckSlot}>
            <RecommendationDeck
              venues={shortlist}
              viewportWidth={width}
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
    alignItems: 'center',
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
  attribution: {
    marginTop: spacing.xs,
    alignItems: 'center',
  },
});
