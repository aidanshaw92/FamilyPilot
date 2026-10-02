import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeneratingPlan } from '@/src/components/planning/GeneratingPlan';
import { PlanScreenView } from '@/src/components/planning/PlanScreenView';
import { Button, EmptyState, Text } from '@/src/components/ui';
import { BackButton } from '@/src/components/ui/BackButton';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useVenue } from '@/src/hooks/use-queries';
import {
  CreatePlanFailure,
  CreatePlanStepId,
  createPlan,
  createPlanSteps,
} from '@/src/services/planning/create-plan';
import { planStopFromVenueDetail } from '@/src/services/planning/day-plan';
import { firstValue, planDraftFromParams } from '@/src/services/planning/plan-draft';
import { resolvePlanParties } from '@/src/services/planning/plan-parties';
import { PlanViewModel, PlanViewModelInput } from '@/src/services/planning/plan-view-model';
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
  | { status: 'ready'; view: PlanViewModel }
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
  const leaveAtParam = firstValue(params.leaveAt) ?? '';
  const visitParam = firstValue(params.visit) ?? '';
  const partiesParam = firstValue(params.parties) ?? '';
  const { data: venue, isPending: venuePending, isError: venueError } = useVenue(venueId);
  const { data: profile } = useFamilyProfile();
  const planningFamilies = usePlanningStore((state) => state.families);
  const saveDay = usePlanningStore((state) => state.saveDay);
  const savedDays = usePlanningStore((state) => state.savedDays);

  // Parsed in one tested place rather than here, and from the narrowed primitives above so the
  // result is referentially stable across renders.
  const draft = useMemo(
    () => planDraftFromParams({ date: dateParam, leaveAt: leaveAtParam, visit: visitParam, parties: partiesParam }),
    [dateParam, leaveAtParam, visitParam, partiesParam],
  );

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
  // What the view was built from, so Save stores the planner's answer and not the rendered screen.
  const source = useRef<PlanViewModelInput | null>(null);
  const saving = useRef(false);

  const steps = useMemo(
    () => createPlanSteps({ venueName: venue?.name ?? 'this place' }),
    [venue?.name],
  );

  const parties = useMemo(
    () => resolvePlanParties(draft.partyIds, { profile, planningFamilies }),
    [draft.partyIds, profile, planningFamilies],
  );
  /** A primitive, so the generation effect cannot be restarted by array identity alone. */
  const familyIds = parties.families.map((family) => family.id).join(',');

  useEffect(() => {
    if (!venue) return;
    // The resolved households are part of the key, not just the chosen ids. The profile and the
    // venue are two separate queries: if the venue lands first, the day would be built for nobody,
    // and without this the arriving profile would never trigger a rebuild -- a cold load would
    // intermittently end on "Nobody is coming yet".
    const key = [venueId, draft.date, draft.leaveAt, draft.visitMinutes, partiesParam, familyIds].join('|');
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
          draft: {
            date: draft.date,
            leaveAt: draft.leaveAt,
            visitMinutes: draft.visitMinutes,
            partyIds: draft.partyIds,
          },
          families: parties.families,
          parkingInfo: venue.parkingInfo,
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
      setPhase(outcome.ok ? { status: 'ready', view: outcome.view } : { status: 'failed', failure: outcome });
      if (outcome.ok) source.current = outcome.source;
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
  }, [venue, venueId, draft, familyIds, partiesParam]);

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

  const handleSave = useCallback(() => {
    // The ref, not the state, is the guard: a second tap can land before React re-renders, and each
    // press mints its own id, so state alone would store the same day twice.
    if (!source.current || saving.current) return;
    saving.current = true;
    const id = `day-${Date.now()}`;
    saveDay({ id, createdAt: new Date().toISOString(), source: source.current });
    setSavedId(id);
  }, [saveDay]);

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
      <Shell onBack={handleBack} topInset={insets.top}>
        <GeneratingPlan venueName="this place" steps={steps} done={done} current={current} />
      </Shell>
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
      <Shell onBack={handleBack} topInset={insets.top}>
        <GeneratingPlan venueName={venue.name} steps={steps} done={done} current={current} />
      </Shell>
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
              <Text variant="label" color={colors.text.secondary} style={styles.suggestionsTitle}>
                WHAT WOULD HELP
              </Text>
              {phase.failure.suggestions.map((suggestion) => (
                <Text key={suggestion} variant="bodySmall">
                  {suggestion}
                </Text>
              ))}
            </View>
          ) : null}

          <Button label="Change the plan" onPress={handleBack} style={styles.failureAction} />
        </ScrollView>
      </Shell>
    );
  }

  return (
    <PlanScreenView
      view={phase.view}
      notices={partyNotices}
      onBack={handleBack}
      onSave={handleSave}
      saved={savedDays.some((day) => day.id === savedId)}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}

/** The chrome the pre-plan states share: a way back, and nothing else to distract from waiting. */
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
  shellHeader: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing.sm },
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
  suggestionsTitle: { letterSpacing: 0.8, marginBottom: spacing.xs },
  failureAction: { marginTop: spacing.md },
});
