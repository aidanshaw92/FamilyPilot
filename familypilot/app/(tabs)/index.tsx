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

import { GoogleMapsAttribution } from '@/src/components/shared/GoogleAttribution';
import { RecommendationDeck } from '@/src/components/home/RecommendationDeck';
import { deckMetrics } from '@/src/utils/home-deck-geometry';
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
  SearchBar,
  Skeleton,
  Text,
} from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyVenues } from '@/src/hooks/use-queries';
import { useFiltersStore } from '@/src/stores/filters-store';
import { Venue } from '@/src/types';
import { filterByPlanCategory, PLAN_CATEGORIES } from '@/src/utils/plan-categories';

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
            tintColor={colors.primary[500]}
          />
        }
      >
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
              <Text variant="bodySmall" color="#6E6E73" style={styles.greetingSub}>
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

          <SearchBar
            placeholder={searchPlaceholder(width)}
            onPress={() => router.push('/(tabs)/explore' as never)}
            onFilterPress={() => setFilterSheetOpen(true)}
            style={styles.search}
          />

          <Text variant="heading2" style={styles.sectionTitle}>
            Select your plan
          </Text>
        </View>

        <PillSelector
          options={PLAN_CATEGORIES}
          value={category}
          onChange={setCategory}
          accessibilityLabel="Plan categories"
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

        {/* The deck's places come from Google, and Google requires its mark wherever that content
            appears without a Google map. It sits in the gap the frame already leaves between the
            deck and the navigation, so nothing in the approved composition moves. */}
        {!isLoading && !isError && shortlist.length > 0 ? (
          <View style={styles.attribution}>
            <GoogleMapsAttribution />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The near-black the approved frame uses for ink and for the selected chip. */
const FRAME_INK = '#141416';

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
    letterSpacing: -0.6375,
    color: FRAME_INK,
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
    backgroundColor: FRAME_INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The gaps below are the approved frame's own: subtitle 111 -> search 126, search 182 ->
  // heading 198, heading 225 -> pills 234, pills 278 -> deck 307.
  search: {
    marginTop: 15,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 9,
    // Frame node 7:30: Semi Bold 22 with a 27 line box, which is what puts the pills at y=234.
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.44,
    color: FRAME_INK,
  },
  deckSlot: {
    marginTop: 29,
  },
  attribution: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
});
