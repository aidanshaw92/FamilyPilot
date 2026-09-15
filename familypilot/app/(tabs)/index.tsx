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

import { RecommendationDeck } from '@/src/components/home/RecommendationDeck';
import { deckMetrics } from '@/src/utils/home-deck-geometry';
import { homeHeaderLayout, searchPlaceholder } from '@/src/utils/home-header-layout';
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.primary[500]}
          />
        }
      >
        <View style={styles.gutter}>
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
          contentStyle={styles.pillContent}
        />

        {isError ? (
          <View style={[styles.gutter, styles.deckSlot]}>
            <ErrorState onRetry={() => void refetch()} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={[styles.gutter, styles.deckSlot]}>
            <Skeleton height={deckHeight} borderRadius={radius['3xl']} />
          </View>
        ) : null}

        {!isLoading && !isError && shortlist.length === 0 ? (
          <View style={[styles.gutter, styles.deckSlot]}>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing['5xl'],
  },
  gutter: {
    paddingHorizontal: spacing.screenPadding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greeting: {
    flex: 1,
  },
  greetingLine: {
    letterSpacing: -0.6,
  },
  greetingSub: {
    marginTop: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  pillContent: {
    paddingLeft: spacing.screenPadding,
  },
  deckSlot: {
    marginTop: spacing['2xl'],
  },
});
