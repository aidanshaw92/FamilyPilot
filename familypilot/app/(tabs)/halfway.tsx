import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HalfwayEditSheet, MeetingEnvironment } from '@/src/components/halfway/EditSheet';
import { HalfwayListCard } from '@/src/components/halfway/ListCard';
import { CollapsedRecommendation, ExpandedRecommendation } from '@/src/components/halfway/Sheet';
import { FallbackBanner, LoadFailed, LoadingRecommendations, NoSuitablePlaces } from '@/src/components/halfway/States';
import { HalfwayHeader, HalfwayTitle, MapListToggle, SheetSurface } from '@/src/components/halfway/chrome';
import { AddFamilyByPostcode } from '@/src/components/planning/AddFamilyByPostcode';
import { HalfwayMap } from '@/src/components/planning/HalfwayMap';
import { PlaceCredits } from '@/src/components/shared/PlaceCredits';
import { Chip, EmptyState, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useConnectedFamilies } from '@/src/hooks/use-connected-families';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import { useBetweenVenues, useFamilyProfile, useNearbyVenues } from '@/src/hooks/use-queries';
import { HalfwayOption, meetHalfway } from '@/src/services/planning/meet-halfway';
import { DEFAULT_START_AT, firstValue, planDraftToParams } from '@/src/services/planning/plan-draft';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { PlanningFamily } from '@/src/services/planning/planner';
import { seedVenueDetail } from '@/src/services/venue-detail-seed';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { useChromeStore } from '@/src/stores/chrome-store';
import { localDate, localTime, usePlanningStore } from '@/src/stores/planning-store';
import { familyDisplayName } from '@/src/utils/family-title';
import { shortDateLabel } from '@/src/utils/plan-quick-choices';

/**
 * MEET HALFWAY: a place that works for two families. Its own tab (Home, Explore, Families, Halfway, Plans, Profile).
 *
 * The map is the screen. It is drawn on the device (no tiles, no provider, no spend) and shows the two families as rough
 * AREAS and the recommended places as numbered pins; a collapsible sheet under it carries the selected place: the engine's
 * own label, each family's Family Fit and journey, and "Plan this day". The List is the same places as cards, and tapping
 * one selects it on the map. "Edit meeting details" (who, when, indoor or outdoor) opens from the selector at the top.
 *
 * The engine (`meetHalfway`) is unchanged by any of this: places ranked by fair journeys for BOTH families, the planner's
 * own idea of suitability applied to each. Nothing is invented for the screen: a journey is "about N min", estimated from
 * distance; a Family Fit is the engine's grade for that family, and for the other family only what they chose to share.
 *
 * WHERE THE PLACES COME FROM. Not from Home, which is one family's recommendations and would bias the answer toward them.
 * `useBetweenVenues` reads the stored venue catalogue in the corridor between the two homes (a database read: no Google, no
 * spend), and the engine then applies both families' needs. Home's places are used only if that lookup fails, and the
 * screen says so. Opening this makes no paid route request and no paid image request beyond what a card already shows.
 */
export default function MeetHalfwayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const params = useLocalSearchParams();
  const preselected = firstValue(params.family);

  const { data: profile } = useFamilyProfile();
  const authStatus = useAuthStore((s) => s.status);
  const signedIn = accountRequired() && authStatus === 'signed_in';
  const connected = useConnectedFamilies(signedIn);
  const stored = usePlanningStore((s) => s.families);

  const today = localDate();
  const [date, setDate] = useState(today);
  const [dateOpen, setDateOpen] = useState(false);
  const [startAt, setStartAt] = useState(DEFAULT_START_AT);
  const [environment, setEnvironment] = useState<MeetingEnvironment>('either');
  const [adding, setAdding] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(preselected ?? null);
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  // The edit sheet is a focused modal: it has the whole screen, so the floating navigation steps aside while it is open and
  // is restored when it closes, and also if this screen goes away with the sheet still open.
  const setTabBarHidden = useChromeStore((s) => s.setTabBarHidden);
  const [sheetHeight, setSheetHeight] = useState(380);
  useEffect(() => {
    setTabBarHidden(editOpen);
    return () => setTabBarHidden(false);
  }, [editOpen, setTabBarHidden]);
  // A later link that names a family ("Meet halfway" on a connected family in Families) selects them here, even when the
  // screen is already open, rather than only on first open.
  useEffect(() => {
    if (preselected) setChosen(preselected);
  }, [preselected]);

  // Everyone this person could meet, from one model: connected families (accepted) and families added by postcode.
  const candidates = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; family: PlanningFamily }>();
    // Families on this phone first (added by postcode, or a connection stored for a plan); a connection loaded from the
    // account then replaces its stored copy, so a family that has since updated what they share is read as they are now.
    for (const family of stored) {
      if (family.id.startsWith('guest-') || family.id.startsWith('connected-')) byId.set(family.id, { id: family.id, label: family.label, family });
    }
    for (const { family } of connected.accepted) byId.set(family.id, { id: family.id, label: family.label, family });
    return [...byId.values()];
  }, [connected.accepted, stored]);

  // Opens directly on an answer where there is only one family it could be about; with none, on the way to add one.
  useEffect(() => {
    if (!chosen && candidates.length === 1) setChosen(candidates[0].id);
  }, [candidates, chosen]);

  // With nobody to choose yet, the way to add a starting point is already open (once the account's connections have loaded,
  // so it does not flash up for someone who is about to see theirs).
  const showAdd = adding || (candidates.length === 0 && (connected.loaded || !signedIn));

  const mine = useMemo(() => (profile ? planningFamilyFromProfile(profile) : 'not-described'), [profile]);
  const other = candidates.find((c) => c.id === chosen)?.family ?? null;

  // Candidates come from where BOTH families are. Home's list is only the fallback when the catalogue cannot be reached.
  const between = useBetweenVenues(
    typeof mine === 'string' || !other ? null : { latitude: mine.latitude, longitude: mine.longitude, maxDriveMinutes: mine.maxDriveMinutes },
    typeof mine === 'string' || !other ? null : { latitude: other.latitude, longitude: other.longitude, maxDriveMinutes: other.maxDriveMinutes },
  );
  const homeFallback = useNearbyVenues({ enabled: between.isError });
  const usingHomeFallback = between.isError && Boolean(homeFallback.data);
  const venues = between.data ?? (usingHomeFallback ? homeFallback.data : undefined);
  const isLoading = between.isLoading || (between.isError && homeFallback.isLoading);
  const isError = between.isError && homeFallback.isError;
  const refetch = () => (between.isError ? Promise.all([between.refetch(), homeFallback.refetch()]) : between.refetch());

  const result = useMemo(() => {
    if (typeof mine === 'string' || !other || !venues) return null;
    return meetHalfway({
      venues,
      mine,
      other,
      date,
      arriveAt: startAt,
      today,
      nowMinutes: Number(localTime().slice(0, 2)) * 60 + Number(localTime().slice(3, 5)),
      environment,
    });
  }, [mine, other, venues, date, startAt, today, environment]);

  // The place in focus: the one tapped, else the top recommendation. A new result (another family, another time) that no
  // longer holds the tapped place falls back to its own first.
  const options = result?.options ?? [];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.venue.id === selectedId));
  const selected: HalfwayOption | null = options[selectedIndex] ?? null;

  const choose = (id: string) => {
    setSelectedId(id);
    setMode('map');
  };

  const plan = (option: HalfwayOption) => {
    if (!other) return;
    // A connection that is not on this phone yet is stored now, so the Plan screen finds it by its id.
    const connection = connected.accepted.find((c) => c.family.id === other.id)?.connection;
    if (connection) connected.addToPlan(connection);
    router.push({
      pathname: '/plan',
      params: {
        venue: option.venue.id,
        ...planDraftToParams({
          date,
          startAt,
          partyIds: ['mine', other.id],
          attendeeIds: null,
          visit: 'not-sure',
          returnBy: '',
          bufferMinutes: 15,
          environment,
        }),
      },
    } as never);
  };
  const openPlace = (option: HalfwayOption) => {
    seedVenueDetail(option.venue);
    router.push(`/venue/${option.venue.id}` as never);
  };
  const openProfile = () => {
    setEditOpen(false);
    router.push('/profile/edit' as never);
  };
  const onAdded = (family: PlanningFamily) => {
    setChosen(family.id);
    setAdding(false);
  };

  const sheetTop = Math.max(64, insets.top + 17);
  const editSheet = editOpen ? (
    <HalfwayEditSheet
      top={sheetTop}
      candidates={candidates}
      chosen={chosen}
      onChoose={setChosen}
      adding={adding}
      onToggleAdding={() => setAdding((open) => !open)}
      onAdded={onAdded}
      mine={typeof mine === 'string' ? null : mine}
      other={other}
      date={date}
      onDate={setDate}
      startAt={startAt}
      onStartAt={setStartAt}
      dateOpen={dateOpen}
      onDateOpen={setDateOpen}
      today={today}
      environment={environment}
      onEnvironment={setEnvironment}
      onEditProfile={openProfile}
      onClose={() => setEditOpen(false)}
    />
  ) : null;

  // ---- states with no meeting yet: your starting point is missing, or nobody is chosen --------------------------------
  if (typeof mine === 'string') {
    return (
      <View style={styles.screen}>
        <HalfwayTitle />
        <View style={styles.centre}>
          <EmptyState
            icon="search-outline"
            title="Add where you set off from"
            message="We need your home area to work out your journey."
            actionLabel="Edit your family"
            onAction={() => router.push('/profile/edit' as never)}
          />
        </View>
      </View>
    );
  }
  if (!other) {
    return (
      <View style={styles.screen}>
        <HalfwayTitle />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text variant="heading3" accessibilityRole="header">Who are you meeting?</Text>
          <View style={styles.chips}>
            {candidates.map((candidate) => (
              <Chip key={candidate.id} size="small" label={familyDisplayName(candidate.label)} active={chosen === candidate.id} onPress={() => setChosen(candidate.id)} />
            ))}
            <Chip size="small" label="+ Add by postcode" active={showAdd} onPress={() => setAdding((open) => !open)} />
          </View>
          {showAdd && candidates.length === 0 ? (
            <Text variant="caption" color={colors.text.secondary} testID="halfway-no-families">
              You don’t need a connected family. Add where the other family sets off from, with a first name and a postcode. Connect families under Families to use their real details.
            </Text>
          ) : null}
          {showAdd ? <AddFamilyByPostcode onAdded={onAdded} onCancel={() => setAdding(false)} /> : null}
          {!showAdd || candidates.length > 0 ? (
            <Text variant="bodySmall" color={colors.text.secondary} testID="halfway-choose">
              Choose who you’re meeting to see places that suit you both.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  const otherName = familyDisplayName(other.label);
  const when = `${shortDateLabel(date)} · arrive ${startAt}`;
  const mapBlocked = isLoading || isError || options.length === 0;
  const retry = () => void refetch();

  // The card at the foot of the map: the selected recommendation, or what is happening instead.
  const dock = selected && !isLoading && !isError ? (
    <CollapsedRecommendation
      option={selected}
      index={selectedIndex}
      total={options.length}
      otherLabel={other.label}
      bottomClearance={tabBarClearance}
      onExpand={() => setDetailOpen(true)}
      onPlan={() => plan(selected)}
      onLayoutHeight={setSheetHeight}
    />
  ) : (
    <View style={styles.dock} onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}>
      <SheetSurface bottomPadding={tabBarClearance}>
        {isLoading ? (
          <LoadingRecommendations />
        ) : isError ? (
          <LoadFailed onRetry={retry} />
        ) : result ? (
          <NoSuitablePlaces result={result} other={other.label} onChangeWhen={() => setEditOpen(true)} onStartAt={setStartAt} />
        ) : null}
      </SheetSurface>
    </View>
  );

  return (
    <View style={styles.screen}>
      <HalfwayHeader who={`You + ${otherName}`} when={when} otherName={otherName} onEdit={() => setEditOpen(true)} />

      {mode === 'map' ? (
        <View style={styles.body} onLayout={(e) => setBodyHeight(Math.round(e.nativeEvent.layout.height))} testID="halfway-map-body">
          {/* The map fills the screen under the header and the sheet: the places and both areas are fitted to the part left
              visible, so the frame is the same for every selection and nothing is hidden behind the card. */}
          {bodyHeight > 0 ? (
            <View style={StyleSheet.absoluteFill}>
              <HalfwayMap
                mine={{ latitude: mine.latitude, longitude: mine.longitude, label: 'Your family' }}
                other={{ latitude: other.latitude, longitude: other.longitude, label: otherName }}
                venue={selected && !mapBlocked ? { latitude: selected.venue.latitude, longitude: selected.venue.longitude, name: selected.venue.name } : undefined}
                venues={mapBlocked ? undefined : options.map((option) => ({ id: option.venue.id, latitude: option.venue.latitude, longitude: option.venue.longitude, name: option.venue.name }))}
                selectedId={selected?.venue.id}
                onSelectPin={(id) => setSelectedId(id)}
                height={bodyHeight}
                inset={{ top: 62, bottom: sheetHeight }}
                legend={false}
                bare
              />
            </View>
          ) : null}
          <View style={styles.toggleOverlay} pointerEvents="box-none">
            <MapListToggle mode={mode} onChange={setMode} disabled={isLoading} />
            {usingHomeFallback ? <View style={styles.bannerOverlay}><FallbackBanner compact /></View> : null}
          </View>
          {dock}
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance + spacing.lg }]}
          showsVerticalScrollIndicator={false}
          testID="halfway-list"
        >
          <View style={styles.toggleRow}>
            <MapListToggle mode={mode} onChange={setMode} disabled={isLoading} />
          </View>
          {usingHomeFallback ? (
            <Text variant="caption" color={colors.text.secondary} style={styles.centreText} testID="halfway-from-home">
              {`Showing ${options.length} ${options.length === 1 ? 'place' : 'places'} from Home`}
            </Text>
          ) : options.length > 0 ? (
            <Text variant="caption" color={colors.text.secondary} style={styles.centreText} testID="halfway-ranking-note">
              Ranked by fair journeys and what each family needs
            </Text>
          ) : null}
          {usingHomeFallback ? <FallbackBanner /> : null}
          {isLoading ? (
            <LoadingRecommendations />
          ) : isError ? (
            <LoadFailed onRetry={retry} />
          ) : result && options.length === 0 ? (
            <NoSuitablePlaces result={result} other={other.label} onChangeWhen={() => setEditOpen(true)} onStartAt={setStartAt} />
          ) : (
            <>
              {options.map((option, index) => (
                <HalfwayListCard
                  key={option.venue.id}
                  option={option}
                  index={index}
                  otherLabel={other.label}
                  selected={option.venue.id === selected?.venue.id}
                  onSelect={() => choose(option.venue.id)}
                  onPlan={() => plan(option)}
                />
              ))}
              {result && result.considered > 0 && !usingHomeFallback ? (
                <Text variant="caption" color={colors.text.secondary} testID="halfway-source">
                  We looked at {result.considered} {result.considered === 1 ? 'place' : 'places'} between your two homes, not just the ones on Home.
                </Text>
              ) : null}
              {result && result.options.length > 0 && !result.otherKnown.children && !result.otherKnown.routines ? (
                <Text variant="caption" color={colors.text.secondary}>
                  We only know where {otherName} sets off from, so we’ve checked journeys, opening hours and what you need.
                </Text>
              ) : null}
              <Text variant="caption" color={colors.text.tertiary}>
                Ranked by how fair the two journeys are and what each family needs, not by the midpoint between your homes. Journey times are estimated from distance, not routed. Hours and facilities are as recorded for each place. Each shaded circle on the map is about 1.5 km across, never a home address; no routes are drawn.
              </Text>
              <PlaceCredits places={options.map((option) => option.venue)} />
            </>
          )}
        </ScrollView>
      )}

      {detailOpen && selected && mode === 'map' ? (
        <ExpandedRecommendation
          option={selected}
          index={selectedIndex}
          total={options.length}
          otherLabel={other.label}
          bottomClearance={tabBarClearance}
          top={sheetTop}
          onCollapse={() => setDetailOpen(false)}
          onPlan={() => plan(selected)}
          onOpenPlace={() => openPlace(selected)}
        />
      ) : null}
      {editSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centre: { flex: 1, justifyContent: 'center', paddingBottom: 120 },
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.lg, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  body: { flex: 1, overflow: 'hidden' },
  toggleOverlay: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', gap: 8 },
  bannerOverlay: { alignSelf: 'stretch', paddingHorizontal: spacing.screenPadding },
  toggleRow: { alignItems: 'center', paddingTop: 6 },
  centreText: { textAlign: 'center' },
  listContent: { paddingHorizontal: spacing.screenPadding, gap: spacing.md, paddingTop: 6 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
