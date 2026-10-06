import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeneratingPlan } from '@/src/components/planning/GeneratingPlan';
import { PlanScreenView } from '@/src/components/planning/PlanScreenView';
import { Button, EmptyState, Text } from '@/src/components/ui';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { profileReceipt } from '@/src/utils/profile-receipt';
import { BackButton } from '@/src/components/ui/BackButton';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useNearbyFood, useVenue } from '@/src/hooks/use-queries';
import {
  CreatePlanFailure,
  CreatePlanStepId,
  createPlan,
  createPlanSteps,
} from '@/src/services/planning/create-plan';
import { mealFromFoodCandidate, planStopFromVenueDetail } from '@/src/services/planning/day-plan';
import { firstValue, planDraftFromParams, planDraftToParams } from '@/src/services/planning/plan-draft';
import { resolvePlanParties } from '@/src/services/planning/plan-parties';
import { PlanAdviceOptionView, PlanViewModelInput, toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { visitLengthToParam } from '@/src/services/planning/visit-duration';
import { householdTitle } from '@/src/utils/household';
import { usePlanningStore } from '@/src/stores/planning-store';

/**
 * GENERATING, then PLAN -- the last two screens of the approved journey.
 *
 * A view and nothing more. It gathers what the parent already chose, hands it to `createPlan`, and
 * renders whichever of the three outcomes comes back: the steps while the work happens, the day when
 * it succeeds, or exactly what stood in the way when it does not. No planning decision is made here.
 *
 * The venue arrives as an id rather than as an object, so the screen survives a reload and a shared
 * link. Reading it back through `useVenue` hits the cache the detail screen already filled, which is
 * also why this costs no Google call: the detail was bought once, when the parent opened the venue.
 */

type Phase =
  | { status: 'generating' }
  /**
   * What the planner answered, not the rendered screen: the view is built from it at draw time, with the profile on
   * this device, so naps and feeds read with the children's names and nothing named is ever saved.
   */
  | { status: 'ready'; source: PlanViewModelInput }
  | { status: 'failed'; failure: CreatePlanFailure };

/**
 * Why a chosen household could not be planned for, in a parent's words.
 *
 * Both numbers are written out rather than derived by rewriting the verb. A regex that turns
 * "needs" into "need" works until the day somebody adds a reason it does not fit, and then it
 * produces broken English on a screen nobody is testing that case on.
 */
/**
 * The ceiling on restarts for one set of answers. Three allows a genuine remount or a late-arriving
 * profile to rebuild the day; it does not allow a loop.
 */
const MAX_GENERATION_ATTEMPTS = 3;

const MISSING_PARTY_MESSAGE: Record<string, { one: string; many: string }> = {
  'not-described': {
    one: 'A family you chose needs its details before we can plan around it',
    many: 'families you chose need their details before we can plan around them',
  },
  'no-location': {
    one: 'A family you chose has not said where it is leaving from',
    many: 'families you chose have not said where they are leaving from',
  },
};

const UNUSABLE_PARTY = {
  one: 'A family you chose could not be used',
  many: 'families you chose could not be used',
};

export default function PlanScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /**
   * Every answer narrowed to a primitive before anything memoises on it.
   *
   * A repeated query parameter (`?date=a&date=b`) arrives as an array, and an array is a new
   * identity on every render. Memoising the draft on the raw params therefore rebuilt it every
   * render, which rebuilt the resolved households, which changed the generation effect's
   * dependencies, which cancelled the run in flight and started another -- for ever. Measured at
   * 3,094 journey requests in nine seconds, against an endpoint that can reach a billable Google
   * service. Primitives cannot do that.
   */
  const venueId = firstValue(params.venue) ?? '';
  const dateParam = firstValue(params.date) ?? '';
  const startParam = firstValue(params.start) ?? firstValue(params.leaveAt) ?? '';
  const visitParam = firstValue(params.visit) ?? '';
  const partiesParam = firstValue(params.parties) ?? '';
  const whoParam = firstValue(params.who) ?? '';
  const homeParam = firstValue(params.home) ?? '';
  const bufferParam = firstValue(params.buffer) ?? '';
  const settingParam = firstValue(params.setting) ?? '';
  // `off`: the parent took lunch out of the day. Anything else keeps the lunch that is already known.
  const lunchParam = firstValue(params.lunch) ?? '';
  const { data: venue, isPending: venuePending, isError: venueError } = useVenue(venueId);
  const { data: profile } = useFamilyProfile();
  const planningFamilies = usePlanningStore((state) => state.families);
  const saveDay = usePlanningStore((state) => state.saveDay);
  const savedDays = usePlanningStore((state) => state.savedDays);

  // Parsed in one tested place rather than here, and from the narrowed primitives above so the
  // result is referentially stable across renders.
  const draft = useMemo(
    () => planDraftFromParams({ date: dateParam, start: startParam, visit: visitParam, parties: partiesParam, who: whoParam, home: homeParam, buffer: bufferParam, setting: settingParam }),
    [dateParam, startParam, visitParam, partiesParam, whoParam, homeParam, bufferParam, settingParam],
  );
  const lunchOff = lunchParam === 'off';

  /**
   * The lunch stop, from the OpenStreetMap discovery this venue's detail screen already ran.
   *
   * Read from the react-query cache under the same key the detail screen uses, so arriving here costs
   * nothing: no Overpass request, and certainly no Google call. A parent who reached the Plan by any
   * other route simply gets no meal, and `createPlanSteps` omits the lunch step rather than showing a
   * progress line for work that will not happen.
   *
   * The highest-ranked candidate is taken rather than offering a choice: Section 13 says keep this
   * deliberately simple, and a lunch picker is a product decision nobody has made.
   */
  const nearbyFood = useNearbyFood({
    latitude: venue?.latitude,
    longitude: venue?.longitude,
    placeId: venue?.id,
  });
  const knownLunch = useMemo(() => {
    const best = nearbyFood.data?.candidates?.[0];
    return best ? mealFromFoodCandidate(best) : undefined;
  }, [nearbyFood.data]);
  // Taking lunch out of the day is the parent's choice; the lunch that is known stays available to add back.
  const lunch = lunchOff ? undefined : knownLunch;
  /** Primitives for the generation effect's dependency list, never the objects. */
  const lunchKey = `${lunch?.place.placeId ?? 'no-lunch'}${knownLunch && lunchOff ? '|off' : ''}`;
  /**
   * Whether a lunch answer is still coming. NOT simply `isPending`.
   *
   * react-query v5 reports a DISABLED query as `status: 'pending'` with `fetchStatus: 'idle'`, and the
   * lookup is disabled whenever the venue has no coordinates. So a bare `isPending` gate would wait for
   * an answer that is never coming and the plan would never generate at all -- a hang, for a venue
   * missing a latitude. Verified against react-query itself rather than assumed.
   *
   * The condition that actually matters is "we expect an answer and have not got one": the venue has
   * coordinates, so the query is enabled, and it has not resolved.
   */
  const foodExpected =
    Number.isFinite(venue?.latitude) && Number.isFinite(venue?.longitude);
  const foodPending = foodExpected && nearbyFood.isPending && nearbyFood.fetchStatus !== 'idle';
  /**
   * The lookup was asked and did not answer, which is not the same as "nowhere to eat near here".
   *
   * Both used to produce the same plan: no lunch stop, no explanation. A parent could only read that
   * as the area having nothing, which is a fact we have not established. `foodExpected` is part of it
   * on purpose -- a venue with no coordinates was never asked, so nothing failed, and claiming a
   * lookup error there would be its own false statement.
   */
  const foodLookupFailed = foodExpected && nearbyFood.isError;

  const [phase, setPhase] = useState<Phase>({ status: 'generating' });
  const [done, setDone] = useState<CreatePlanStepId[]>([]);
  const [current, setCurrent] = useState<CreatePlanStepId | undefined>(undefined);
  const [savedId, setSavedId] = useState<string | null>(null);
  // One generation per set of answers. Without this, any re-render while the promise is in flight
  // would start a second day being built behind the first.
  const requested = useRef<string | null>(null);
  /**
   * How many times the current answers have been started, as a bound on any future regression.
   *
   * Releasing the key when a run is cancelled is what lets a remount rebuild the day, and it is also
   * what let unstable dependencies restart generation without limit. The dependencies are primitives
   * now, so that cannot happen -- but this path reaches a journey endpoint that can call a billable
   * Google service, and a defect that merely wastes renders elsewhere spends money here. A ceiling
   * costs nothing when the code is correct and caps the damage when it is not.
   */
  const attempts = useRef({ key: '', count: 0 });
  const saving = useRef(false);

  const steps = useMemo(
    () => createPlanSteps({ venueName: venue?.name ?? 'this place', meal: lunch }),
    // `lunch?.place.placeId` rather than the object: a primitive, for the same reason the generation
    // effect below takes primitives. An object identity in a dependency list is what restarted
    // generation 3,094 times once already.
    [venue?.name, lunch],
  );

  const parties = useMemo(
    () => resolvePlanParties(draft.partyIds, { profile, planningFamilies, attendeeIds: draft.attendeeIds }),
    [draft.partyIds, draft.attendeeIds, profile, planningFamilies],
  );
  /** A primitive, so the generation effect cannot be restarted by array identity alone. */
  const familyIds = parties.families.map((family) => family.id).join(',');

  useEffect(() => {
    if (!venue) return;
    /**
     * Wait for the lunch lookup to settle, rather than generating now and regenerating when it lands.
     *
     * Regenerating would work -- `lunchKey` is a primitive and MAX_GENERATION_ATTEMPTS bounds it -- but
     * it would build the day twice, and the second build reaches a journey endpoint that can spend. One
     * build with whatever the lookup found is cheaper and shows the parent one Generating sequence.
     *
     * Settling means resolved OR failed: a failed lookup gives no lunch and the day is built without
     * one, which `createPlanSteps` reflects by omitting the step rather than promising work it will not
     * do. The client has a 20-second timeout and one retry, so this cannot wait indefinitely.
     */
    if (foodPending) return;
    // The resolved households are part of the key, not just the chosen ids. The profile and the
    // venue are two separate queries: if the venue lands first, the day would be built for nobody,
    // and without this the arriving profile would never trigger a rebuild -- a cold load would
    // intermittently end on "Nobody is coming yet".
    const key = [venueId, draft.date, draft.startAt, String(draft.visit), partiesParam, whoParam, homeParam, bufferParam, settingParam, familyIds, lunchKey, foodLookupFailed ? 'food-failed' : 'food-ok'].join('|');
    if (requested.current === key) return;
    if (attempts.current.key !== key) attempts.current = { key, count: 0 };
    if (attempts.current.count >= MAX_GENERATION_ATTEMPTS) return;
    attempts.current.count += 1;
    requested.current = key;

    let cancelled = false;
    setPhase({ status: 'generating' });
    setDone([]);
    setCurrent(undefined);

    void (async () => {
      const outcome = await createPlan(
        {
          venue: planStopFromVenueDetail(venue),
          draft,
          families: parties.families,
          parkingInfo: venue.parkingInfo,
          anchorImageUrl: venue.photos?.[0],
          meal: lunch,
          lunchAvailable: Boolean(knownLunch),
          mealLookupFailed: foodLookupFailed,
        },
        {
          onStep: (id) => {
            if (cancelled) return;
            setCurrent(id);
            setDone((previous) => (previous.includes(id) ? previous : [...previous, id]));
          },
        },
      );
      if (cancelled) return;
      setCurrent(undefined);
      setPhase(outcome.ok ? { status: 'ready', source: outcome.source } : { status: 'failed', failure: outcome });
    })();

    return () => {
      cancelled = true;
      // A cancelled run never reached `setPhase`, so it must not leave the key claimed. React can
      // run an effect, clean it up, and run it again with the same deps (a remount, a fast refresh,
      // StrictMode in development); without this the second run would return early and the screen
      // would sit on the generating steps for ever, with nothing still working.
      if (requested.current === key) requested.current = null;
    };
    // Deps are the venue object and primitives only. `parties.families` is deliberately absent: it is
    // a fresh array every time the resolver runs, and `familyIds` carries the same information
    // without the identity churn.
  }, [venue, venueId, draft, familyIds, partiesParam, whoParam, foodPending, foodLookupFailed, lunchKey, lunch, knownLunch]);

  /**
   * Households that were chosen and could not be planned for.
   *
   * Shown on the finished plan as well as on a failure. A day that quietly covers one family when
   * the parent picked two is a wrong answer wearing the shape of a right one, and it is the failure
   * the party resolver exists to make visible.
   */
  const partyNotices = useMemo(() => {
    // Grouped by reason rather than listed one per household. Two households dropped for the same
    // reason produced the same sentence twice, which reads as a rendering fault and, as a React key,
    // is one. The count is kept because losing it would understate how much of the day is missing.
    const byReason = new Map<string, number>();
    for (const party of parties.unresolved) {
      byReason.set(party.reason, (byReason.get(party.reason) ?? 0) + 1);
    }
    return [...byReason.entries()].map(([reason, count]) => {
      const phrasing = MISSING_PARTY_MESSAGE[reason] ?? UNUSABLE_PARTY;
      const clause = count === 1 ? phrasing.one : `${count} ${phrasing.many}`;
      return `${clause}, so this day does not include them.`;
    });
  }, [parties.unresolved]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(venueId ? (`/venue/${venueId}` as never) : ('/(tabs)' as never));
  }, [router, venueId]);

  const readySource = phase.status === 'ready' ? phase.source : null;
  const handleSave = useCallback(() => {
    // The ref, not the state, is the guard: a second tap can land before React re-renders, and each
    // press mints its own id, so state alone would store the same day twice.
    if (!readySource || saving.current) return;
    saving.current = true;
    const id = `day-${Date.now()}`;
    saveDay({ id, createdAt: new Date().toISOString(), source: readySource });
    setSavedId(id);
  }, [saveDay, readySource]);

  /**
   * "Change the plan" goes back to the place with the sheet already open on what was chosen, so changing one answer
   * is one tap rather than starting again. Replaces this screen, so Back from the place does not return to a day that
   * has been abandoned.
   */
  const handleChangePlan = useCallback(() => {
    if (!venueId) return handleBack();
    router.replace({ pathname: '/venue/[id]', params: { id: venueId, plan: 'open', ...planDraftToParams(draft) } } as never);
  }, [router, venueId, draft, handleBack]);

  /** Applies a verified option straight onto this screen's own answers: the plan builds again, nothing else changes. */
  const applyOption = useCallback(
    (option: PlanAdviceOptionView) => {
      if (option.kind === 'add-lunch') {
        router.setParams({ lunch: 'on' } as never);
        return;
      }
      const alternative = option.alternative;
      if (!alternative) return;
      if (alternative.kind === 'shorter') router.setParams({ visit: visitLengthToParam(alternative.visitMinutes) } as never);
      else router.setParams({ start: alternative.arriveAt } as never);
    },
    [router],
  );
  const toggleLunch = useCallback(() => {
    router.setParams({ lunch: lunchOff ? 'on' : 'off' } as never);
  }, [router, lunchOff]);
  const applyFailureAction = useCallback(
    (action: NonNullable<CreatePlanFailure['actions']>[number]) => {
      if (action.kind === 'start' && action.startAt) router.setParams({ start: action.startAt } as never);
      else if (action.kind === 'visit' && action.visit !== undefined) router.setParams({ visit: visitLengthToParam(action.visit) } as never);
    },
    [router],
  );

  // Names are added here and nowhere else: the planner and the saved day never carry a child's name.
  const view = useMemo(
    () =>
      readySource
        ? toPlanViewModel(readySource, {
            resolveSubject: makeSubjectResolver(
              profile,
              parties.families.map((f) => ({ id: f.id, label: f.label })),
            ),
            householdTitle: householdTitle(profile),
          })
        : null,
    [readySource, profile, parties.families],
  );

  if (!venueId) {
    return (
      <Shell onBack={handleBack} topInset={insets.top}>
        <EmptyState
          icon="help-circle-outline"
          title="No place to plan around"
          message="Open a place first, then create a plan from there."
        />
      </Shell>
    );
  }

  if (venuePending) {
    return (
      <GeneratingShell onBack={handleBack} topInset={insets.top}>
        <GeneratingPlan venueName="this place" steps={steps} done={done} current={current} inSheet />
      </GeneratingShell>
    );
  }

  if (venueError) {
    return (
      <Shell onBack={handleBack} topInset={insets.top}>
        <EmptyState
          icon="cloud-offline-outline"
          title="We could not load that place"
          message="Check your connection and try opening it again."
        />
      </Shell>
    );
  }

  // Loaded, and there is nothing there. Separate from the error above and from the loading state:
  // the lookup succeeded and returned no venue, which an earlier version read as "still loading" and
  // left generating for ever against a place that does not exist.
  if (!venue) {
    return (
      <Shell onBack={handleBack} topInset={insets.top}>
        <EmptyState
          icon="help-circle-outline"
          title="We could not find that place"
          message="It may have been removed. Try searching for it again."
        />
      </Shell>
    );
  }

  if (phase.status === 'generating') {
    return (
      <GeneratingShell onBack={handleBack} topInset={insets.top} photo={venue.photos?.[0]} category={venue.category} alt={venue.name}>
        <GeneratingPlan
          venueName={venue.name}
          steps={steps}
          done={done}
          current={current}
          receipt={profileReceipt(profile)}
          inSheet
        />
      </GeneratingShell>
    );
  }

  if (phase.status === 'failed') {
    return (
      <Shell onBack={handleBack} topInset={insets.top}>
        <ScrollView contentContainerStyle={styles.failure}>
          <Text variant="heading2">{phase.failure.title}</Text>
          <Text variant="body" color={colors.text.secondary}>
            {phase.failure.message}
          </Text>

          {partyNotices.length ? (
            <View style={styles.notice}>
              {partyNotices.map((line) => (
                <Text key={line} variant="bodySmall" color={colors.warning[600]}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {phase.failure.suggestions.length ? (
            <View style={styles.suggestions}>
              <Text variant="eyebrow" style={styles.suggestionsTitle}>
                WHAT WOULD HELP
              </Text>
              {phase.failure.suggestions.map((suggestion) => (
                <Text key={suggestion} variant="bodySmall">
                  {suggestion}
                </Text>
              ))}
            </View>
          ) : null}

          {phase.failure.actions?.length ? (
            <View style={styles.actions}>
              {phase.failure.actions.map((action) => (
                <Button
                  key={action.label}
                  label={action.label}
                  onPress={() => applyFailureAction(action)}
                  style={styles.failureAction}
                  testID="plan-failure-action"
                />
              ))}
            </View>
          ) : null}
          <Button
            label="Change the plan"
            variant={phase.failure.actions?.length ? 'outline' : 'primary'}
            onPress={handleChangePlan}
            style={styles.failureAction}
            testID="plan-change"
          />
        </ScrollView>
      </Shell>
    );
  }

  if (!view) return null;
  return (
    <PlanScreenView
      view={view}
      notices={partyNotices}
      onApplyOption={applyOption}
      onToggleLunch={toggleLunch}
      onBack={handleBack}
      onSave={handleSave}
      saved={savedDays.some((day) => day.id === savedId)}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}

/** The chrome the pre-plan states share: a way back, and nothing else to distract from waiting. */
/**
 * Frame 04b (node 76:71): the generating list sits in the same sheet Create a plan used, over the
 * venue's photograph, so the moment after "Build my plan" looks like the moment before it. The sheet
 * starts at the frame's 212 over a 300 hero.
 */
function GeneratingShell({
  children,
  onBack,
  topInset,
  photo,
  category,
  alt,
}: {
  children: React.ReactNode;
  onBack: () => void;
  topInset: number;
  photo?: string;
  category?: string;
  alt?: string;
}) {
  return (
    <View style={styles.shell}>
      <View style={styles.generatingHero}>
        <VenueImage uri={photo} category={category} alt={alt ?? 'Place'} style={styles.generatingHeroImage} borderRadius={0} />
        <View style={styles.generatingScrim} />
        <View style={[styles.generatingBack, { top: topInset + spacing.sm }]}>
          <BackButton onPress={onBack} />
        </View>
      </View>
      <View style={styles.generatingSheet}>
        <View style={styles.grabber} />
        {children}
      </View>
    </View>
  );
}

function Shell({
  children,
  onBack,
  topInset,
}: {
  children: React.ReactNode;
  onBack: () => void;
  topInset: number;
}) {
  return (
    <View style={[styles.shell, { paddingTop: topInset + spacing.sm }]}>
      <View style={styles.shellHeader}>
        <BackButton onPress={onBack} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  generatingHero: { height: 300, overflow: 'hidden' },
  generatingHeroImage: { width: '100%', height: '100%' },
  // Node 76:93: the frame darkens the photograph behind the sheet.
  generatingScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  generatingBack: {
    position: 'absolute',
    left: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Node 76:94: the sheet starts at 212 over the 300 hero, 28 radius, grabber 10 below its top.
  generatingSheet: {
    flex: 1,
    marginTop: -88,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.lg },
  // flex-start, or the 44pt back control stretches across the row and its chevron lands centred.
  shellHeader: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing.sm, alignItems: 'flex-start' },
  failure: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  notice: {
    backgroundColor: colors.warning[50],
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  suggestions: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  suggestionsTitle: { marginBottom: spacing.xs },
  failureAction: { marginTop: spacing.md },
  actions: { gap: spacing.xs },
});
