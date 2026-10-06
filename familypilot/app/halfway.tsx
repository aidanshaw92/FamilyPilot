import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddFamilyByPostcode } from '@/src/components/planning/AddFamilyByPostcode';
import { PlanFormRow } from '@/src/components/planning/PlanDraftForm';
import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Chip, EmptyState, Skeleton, Text } from '@/src/components/ui';
import { DateField, TimeField } from '@/src/components/ui/DateTimeField';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useConnectedFamilies } from '@/src/hooks/use-connected-families';
import { useBetweenVenues, useFamilyProfile, useNearbyVenues } from '@/src/hooks/use-queries';
import { HalfwayOption, familyPhrase, meetHalfway, topCardLabel } from '@/src/services/planning/meet-halfway';
import { DEFAULT_START_AT, firstValue, planDraftToParams } from '@/src/services/planning/plan-draft';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { PlanningFamily } from '@/src/services/planning/planner';
import { localDate, localTime, usePlanningStore } from '@/src/stores/planning-store';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { formatCategory } from '@/src/utils/format-category';
import { dateQuickChoices, shortDateLabel } from '@/src/utils/plan-quick-choices';
import { travelTimeLabel } from '@/src/utils/travel-time';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * MEET HALFWAY: a place that works for two families.
 *
 * One screen, one question: who are you meeting, and when. Everything after that is the engine's answer
 * (`meetHalfway`): places ranked by fair journeys for BOTH families, the planner's own idea of suitability applied to each,
 * and the reasons said in plain words ("about 28 min for your family, about 31 for Hannah's"). Tapping "Plan this day"
 * hands the place and both families to the same Plan screen every other plan uses, with lunch, routines and advice, so a
 * meeting is not a separate product.
 *
 * WHERE THE PLACES COME FROM. Not from Home, which is one family's recommendations and would bias the answer toward them.
 * `useBetweenVenues` reads the stored venue catalogue in the corridor between the two homes (a database read: no Google, no
 * spend), and the engine then applies both families' needs. Home's places are used only if that lookup fails, and the
 * screen says so. Journeys are the free distance estimate: opening this makes no paid route request.
 */
export default function MeetHalfwayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<string | null>(preselected ?? null);

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
  const dateChoices = dateQuickChoices(today);
  const dateIsQuick = dateChoices.some((c) => c.value === date);

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
    });
  }, [mine, other, venues, date, startAt, today]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips' as never));

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
          environment: 'either',
        }),
      },
    } as never);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <BackButton onPress={back} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['3xl'] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading1">Meet halfway</Text>
        <Text variant="body" color={colors.text.secondary}>
          Find a place that works for both families: fair journeys, what you each need, and both your routines.
        </Text>

        <PlanFormRow label="Who are you meeting?">
          <View style={styles.chips}>
            {candidates.map((candidate) => (
              <Chip
                key={candidate.id}
                size="small"
                label={familyDisplayName(candidate.label)}
                active={chosen === candidate.id}
                onPress={() => setChosen(candidate.id)}
              />
            ))}
            <Chip size="small" label="+ Add by postcode" active={adding} onPress={() => setAdding((open) => !open)} />
          </View>
          {candidates.length === 0 && !adding ? (
            <Text variant="caption" color={colors.text.secondary}>
              Connect a family from your Profile, or add one by postcode.
            </Text>
          ) : null}
          {adding ? (
            <AddFamilyByPostcode
              onAdded={(family) => {
                setChosen(family.id);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : null}
        </PlanFormRow>

        <PlanFormRow label="When">
          <View style={styles.chips}>
            {dateChoices.map((choice) => (
              <Chip
                key={choice.value}
                size="small"
                label={choice.label}
                active={date === choice.value}
                onPress={() => {
                  setDateOpen(false);
                  setDate(choice.value);
                }}
              />
            ))}
            <Chip
              size="small"
              label={!dateIsQuick ? shortDateLabel(date) : 'Other date'}
              active={!dateIsQuick || dateOpen}
              onPress={() => setDateOpen(true)}
            />
          </View>
          {dateOpen || !dateIsQuick ? <DateField label="" a11yLabel="Date of the meeting" value={date} onChange={setDate} /> : null}
        </PlanFormRow>

        <PlanFormRow label="Start">
          <TimeField label="" a11yLabel="Arrival time" value={startAt} onChange={setStartAt} />
          <Text variant="caption" color={colors.text.secondary}>
            When you’d both like to arrive. Each family’s leaving time is worked out from its own journey.
          </Text>
        </PlanFormRow>

        {typeof mine === 'string' ? (
          <EmptyState
            icon="home-outline"
            title="Add where you set off from"
            message="We need your home area to work out your journey."
            actionLabel="Edit your family"
            onAction={() => router.push('/profile/edit' as never)}
          />
        ) : !other ? (
          <Text variant="bodySmall" color={colors.text.secondary} testID="halfway-choose">
            Choose who you’re meeting to see places that suit you both.
          </Text>
        ) : isLoading ? (
          <Skeleton height={160} borderRadius={radius.lg} />
        ) : isError ? (
          <EmptyState icon="cloud-offline-outline" title="We couldn’t load places" message="Check your connection and try again." actionLabel="Try again" onAction={() => void refetch()} />
        ) : result ? (
          <Results result={result} other={other.label} usingHomeFallback={usingHomeFallback} onPlan={plan} onOpen={(option) => router.push(`/venue/${option.venue.id}` as never)} onStartAt={setStartAt} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Results({
  result,
  other,
  usingHomeFallback,
  onPlan,
  onOpen,
  onStartAt,
}: {
  result: ReturnType<typeof meetHalfway>;
  other: string;
  usingHomeFallback: boolean;
  onPlan: (option: HalfwayOption) => void;
  onOpen: (option: HalfwayOption) => void;
  onStartAt: (time: string) => void;
}) {
  const notes = (
    <>
      {usingHomeFallback ? (
        <Text variant="caption" color={colors.warning[600]} testID="halfway-fallback">
          We couldn’t search between your homes just now, so these are the places already on Home. There may be better ones in between.
        </Text>
      ) : result.considered > 0 ? (
        <Text variant="caption" color={colors.text.secondary} testID="halfway-source">
          We looked at {result.considered} {result.considered === 1 ? 'place' : 'places'} between your two homes, not just the ones on Home.
        </Text>
      ) : null}
      {result.otherKnown.routinesLegacy ? (
        <Text variant="caption" color={colors.text.secondary} testID="halfway-legacy-routines">
          {familyPhrase('other', other)} shared when they’re home but not what for, so we treat those times as fixed. They can update what they share for better advice.
        </Text>
      ) : null}
    </>
  );
  if (result.options.length === 0) {
    const { excluded } = result;
    return (
      <View style={styles.empty} testID="halfway-empty">
        <Text variant="heading3">No place works for both of you yet</Text>
        {notes}
        {result.considered === 0 ? (
          <Text variant="bodySmall" color={colors.text.secondary}>
            We don’t have any places on record between your two homes yet.
          </Text>
        ) : null}
        {result.earliestArrival ? (
          <>
            <Text variant="bodySmall" color={colors.text.secondary}>
              That start has already gone for one of you. The earliest you could both be there is {result.earliestArrival}.
            </Text>
            <Button label={`Start at ${result.earliestArrival}`} size="sm" onPress={() => onStartAt(result.earliestArrival!)} />
          </>
        ) : (
          <>
            {excluded.journey > 0 ? (
              <Text variant="bodySmall" color={colors.text.secondary}>
                {excluded.journey} places are further than one of you wants to drive.
              </Text>
            ) : null}
            {excluded.closed > 0 ? (
              <Text variant="bodySmall" color={colors.text.secondary}>
                {excluded.closed} are shut at that time.
              </Text>
            ) : null}
            {excluded.requirements > 0 ? (
              <Text variant="bodySmall" color={colors.text.secondary}>
                {excluded.requirements} are ruled out: they’re confirmed to lack something one of you needs, or their age policy doesn’t admit you.
              </Text>
            ) : null}
            <Text variant="bodySmall" color={colors.text.secondary}>
              Try another day or time.
            </Text>
          </>
        )}
      </View>
    );
  }
  return (
    <View style={styles.results} testID="halfway-results">
      <Text variant="heading2">Places that work for both</Text>
      {notes}
      {!result.otherKnown.children && !result.otherKnown.routines ? (
        <Text variant="caption" color={colors.text.secondary}>
          We only know where {familyPhrase('other', other)} sets off from, so we’ve checked journeys, opening hours and what you need.
        </Text>
      ) : null}
      {result.options.map((option, index) => (
        <View key={option.venue.id} style={styles.card} testID="halfway-option">
          <View style={styles.cardHead}>
            <VenueImage
              uri={option.venue.imageUrl}
              category={option.venue.category}
              alt={option.venue.name}
              style={styles.thumb}
              borderRadius={radius.lg}
            />
            <View style={styles.cardTitle}>
              <Text variant="caption" color={colors.text.secondary}>
                {index === 0 ? topCardLabel(option) : formatCategory(option.venue.category)}
              </Text>
              <Text variant="heading3" numberOfLines={2}>
                {option.venue.name}
              </Text>
            </View>
          </View>
          <View style={styles.journeys}>
            {option.journeys.map((journey) => (
              <View key={journey.familyId} style={styles.journeyRow}>
                <Text variant="bodySmall" color={colors.text.secondary} style={styles.journeyWho}>
                  {journey.role === 'mine' ? 'Your family' : familyDisplayName(journey.label)}
                </Text>
                <Text variant="bodySmall" style={styles.journeyTime}>
                  {travelTimeLabel(journey.minutes, 'estimated')}
                </Text>
              </View>
            ))}
          </View>
          {option.reasons.map((line) => (
            <Text key={line} variant="bodySmall">
              ✓ {line}
            </Text>
          ))}
          {option.needsChecking.length > 0 ? (
            <View style={styles.needsChecking} testID="halfway-needs-checking">
              <Text variant="label" color={colors.warning[600]}>
                Needs checking before you go
              </Text>
              {option.needsChecking.map((line) => (
                <Text key={line} variant="bodySmall">
                  {line}.
                </Text>
              ))}
            </View>
          ) : null}
          {option.toCheck
            .filter((line) => !option.needsChecking.includes(line))
            .map((line) => (
              <Text key={line} variant="bodySmall" color={colors.text.secondary}>
                ? {line}
              </Text>
            ))}
          <View style={styles.actions}>
            <Button label="Plan this day" size="sm" onPress={() => onPlan(option)} testID="halfway-plan" />
            <Button label="See the place" size="sm" variant="ghost" onPress={() => onOpen(option)} />
          </View>
        </View>
      ))}
      <Text variant="caption" color={colors.text.tertiary}>
        Journey times are estimated from distance, not routed. Hours and facilities are as recorded for each place.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing.sm, alignItems: 'flex-start' },
  content: { paddingHorizontal: spacing.screenPadding, gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  results: { gap: spacing.md },
  empty: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  card: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  cardHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 62, height: 62 },
  cardTitle: { flex: 1, gap: 2 },
  needsChecking: { gap: 2, backgroundColor: colors.warning[50], borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.warning[100] },
  journeys: { gap: 2, paddingVertical: spacing.xs },
  journeyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  journeyWho: { flex: 1 },
  journeyTime: { fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginTop: spacing.xs },
});
