import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeneratingPlan } from '@/src/components/planning/GeneratingPlan';
import { PlanScreenView } from '@/src/components/planning/PlanScreenView';
import { BottomSheet, Button, Chip, EmptyState, Field, Text } from '@/src/components/ui';
import { TimeField } from '@/src/components/ui/DateTimeField';
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
import { PlanAdviceOptionView, PlanLunchFacts, PlanViewModelInput, toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { TimelineEdit, planTimeline, timelineChildren } from '@/src/services/planning/plan-timeline';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { VISIT_CHOICES, VisitLength, visitLengthToParam } from '@/src/services/planning/visit-duration';
import { lunchEvidence, lunchNeeds, rankLunchCandidates } from '@/src/services/planning/lunch-evidence';
import { FoodCandidate } from '@/src/types/nearby-food';
import { isRouted } from '@/src/types/travel';
import { householdTitle } from '@/src/utils/household';
import { PLANNING_STORAGE_KEY, usePlanningStore } from '@/src/stores/planning-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { alreadySavedId, planContentKey, savePlanDurably } from '@/src/services/planning/save-plan';
import { buildCalendarEvent } from '@/src/services/planning/calendar-event';
import { addToCalendar } from '@/src/services/planning/add-to-calendar';
import { usePlanShare } from '@/src/hooks/use-plan-share';

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
  // Lunch is the parent's call: `on` (they chose a place, or named their own), `off` (they said no thanks), or nothing yet.
  const lunchParam = firstValue(params.lunch) ?? '';
  // Which of the real places nearby is lunch: the one the parent confirmed in the picker.
  const lunchPlaceParam = firstValue(params.lunchPlace) ?? '';
  // A place the parent named themselves, and the time they gave it, if any.
  const lunchOwnParam = firstValue(params.lunchOwn) ?? '';
  const lunchOwnAtParam = firstValue(params.lunchOwnAt) ?? '';
  // Opened from a saved day's Edit: saving replaces that day rather than adding another.
  const savedIdParam = firstValue(params.savedId) ?? '';
  // The overlap the parent chose to keep ("Keep it as planned"). It applies only to that overlap, and is saved with the day.
  const keepParam = firstValue(params.keep) ?? '';
  const { data: venue, isPending: venuePending, isError: venueError } = useVenue(venueId);
  const { data: profile } = useFamilyProfile();
  const planningFamilies = usePlanningStore((state) => state.families);
  const saveDay = usePlanningStore((state) => state.saveDay);
  const deleteDay = usePlanningStore((state) => state.deleteDay);
  const savedDays = usePlanningStore((state) => state.savedDays);

  // Parsed in one tested place rather than here, and from the narrowed primitives above so the
  // result is referentially stable across renders.
  const draft = useMemo(
    () => planDraftFromParams({ date: dateParam, start: startParam, visit: visitParam, parties: partiesParam, who: whoParam, home: homeParam, buffer: bufferParam, setting: settingParam }),
    [dateParam, startParam, visitParam, partiesParam, whoParam, homeParam, bufferParam, settingParam],
  );
  const lunchOff = lunchParam === 'off';
  /**
   * Nothing is added unless the parent says so. A lunch is in the day only when they chose one (`lunch=on`), or when the day
   * was saved before lunch was optional and carries the place it was saved with (`lunchPlace` without a decision): that lunch
   * is kept, never taken out of a saved day. A lunch that is in the day is theirs and stays whatever the hour (`chosen`): the
   * window arithmetic in meal-window.ts is advice in the picker, not a rule.
   */
  const legacyLunch = lunchParam === '' && lunchPlaceParam !== '';
  const lunchDecided = lunchParam === 'on' || lunchOff || legacyLunch;
  const ownLunch = useMemo(
    () => (lunchParam === 'on' && lunchOwnParam ? { name: lunchOwnParam, ...(lunchOwnAtParam ? { startAt: lunchOwnAtParam } : {}) } : undefined),
    [lunchParam, lunchOwnParam, lunchOwnAtParam],
  );
  const lunchIncluded = (lunchParam === 'on' || legacyLunch) && !ownLunch;
  const mealMode = 'chosen' as const;

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
  const lunchCandidates: FoodCandidate[] = useMemo(() => nearbyFood.data?.candidates ?? [], [nearbyFood.data]);
  // The place the parent confirmed. With none confirmed there is no lunch; the discovery's first is never taken on their behalf.
  const chosenCandidate = useMemo(
    () => (lunchPlaceParam ? lunchCandidates.find((c) => c.familypilotId === lunchPlaceParam) : undefined),
    [lunchCandidates, lunchPlaceParam],
  );
  const knownLunch = useMemo(() => (chosenCandidate ? mealFromFoodCandidate(chosenCandidate) : undefined), [chosenCandidate]);
  // What is on record about that place, for the timeline: the mappers' tags and the walk the discovery worked out.
  const mealFacts: PlanLunchFacts | undefined = useMemo(() => {
    if (!chosenCandidate) return undefined;
    const walk = chosenCandidate.travel.find((leg) => leg.mode === 'walk');
    return {
      provider: 'osm',
      highchair: chosenCandidate.tagged.highchair,
      changingTable: chosenCandidate.tagged.changingTable,
      outdoorSeating: chosenCandidate.tagged.outdoorSeating,
      cuisine: chosenCandidate.cuisine,
      ...(walk ? { walkMinutes: walk.durationMinutes, walkSource: isRouted(walk) ? ('measured' as const) : ('estimated' as const) } : {}),
    };
  }, [chosenCandidate]);
  // In the day only once the parent put it there.
  const lunch = lunchIncluded ? knownLunch : undefined;
  /** Primitives for the generation effect's dependency list, never the objects. */
  const lunchKey = `${lunch?.place.placeId ?? 'no-lunch'}|${lunchOff ? 'off' : lunchDecided ? 'on' : 'undecided'}|${ownLunch ? `${ownLunch.name}@${ownLunch.startAt ?? ''}` : ''}`;
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
    const key = [venueId, draft.date, draft.startAt, String(draft.visit), mealMode, partiesParam, whoParam, homeParam, bufferParam, settingParam, familyIds, lunchKey, foodLookupFailed ? 'food-failed' : 'food-ok'].join('|');
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
          mealMode,
          mealFacts,
          lunchAvailable: Boolean(knownLunch),
          mealLookupFailed: foodLookupFailed,
          ownLunch,
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
  }, [venue, venueId, draft, familyIds, partiesParam, whoParam, foodPending, foodLookupFailed, lunchKey, lunch, knownLunch, mealFacts, mealMode, ownLunch]);

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

  const readySource = useMemo(
    () => (phase.status === 'ready' ? (keepParam ? { ...phase.source, acceptedConflict: keepParam } : phase.source) : null),
    [phase, keepParam],
  );
  // Saved is said only once the day is confirmed in the phone's storage (save-plan.ts). The state is tied to the content
  // it was saved for, so a day rebuilt by an advice option or "Add lunch" is a new, unsaved day.
  const [saveFor, setSaveFor] = useState<{ key: string; status: 'saving' | 'saved' | 'already' | 'failed'; message?: string } | null>(null);
  const [calendarMessage, setCalendarMessage] = useState<string | undefined>(undefined);
  const readyKey = readySource ? planContentKey(readySource) : null;
  const alreadyId = useMemo(() => (readySource ? alreadySavedId(readySource, savedDays) : null), [readySource, savedDays]);
  const currentSave = saveFor && saveFor.key === readyKey ? saveFor : null;
  const saveState = currentSave?.status ?? (alreadyId ? 'already' : 'idle');
  const keptId = (currentSave && (currentSave.status === 'saved' || currentSave.status === 'already') ? savedId : null) ?? alreadyId;

  const handleSave = useCallback(async () => {
    // The ref, not the state, is the guard: a second tap can land before React re-renders, and each
    // press mints its own id, so state alone would store the same day twice.
    if (!readySource || !readyKey || saving.current) return null;
    saving.current = true;
    setSaveFor({ key: readyKey, status: 'saving' });
    const outcome = await savePlanDurably(readySource, {
      existing: usePlanningStore.getState().savedDays,
      saveDay,
      deleteDay,
      readStored: () => AsyncStorage.getItem(PLANNING_STORAGE_KEY),
      // The answers this day was built from, so it can be edited later; an edit of a saved day replaces that day.
      draft: {
        venueId,
        params: {
          ...planDraftToParams(draft),
          // The decision travels with the day: a chosen place or an own one as `on`, "no thanks" as `off`, nothing until decided.
          // A day saved before lunch was optional keeps its lunch (`legacyLunch`), now said as chosen.
          ...(lunchOff ? { lunch: 'off' } : lunchIncluded || ownLunch ? { lunch: 'on' } : {}),
          ...(lunchIncluded && chosenCandidate ? { lunchPlace: chosenCandidate.familypilotId } : {}),
          ...(ownLunch ? { lunchOwn: ownLunch.name, ...(ownLunch.startAt ? { lunchOwnAt: ownLunch.startAt } : {}) } : {}),
          ...(keepParam ? { keep: keepParam } : {}),
        },
      },
      replaceId: savedIdParam || null,
    });
    saving.current = false;
    if (outcome.status === 'failed') {
      setSaveFor({ key: readyKey, status: 'failed', message: outcome.message });
      return null;
    }
    setSavedId(outcome.id);
    setSaveFor({ key: readyKey, status: outcome.status });
    return outcome.id;
  }, [saveDay, deleteDay, readySource, readyKey, venueId, draft, lunchOff, lunchIncluded, ownLunch, chosenCandidate, savedIdParam, keepParam]);

  // "View plan": the saved plan itself, as Plans shows it. A plain push, so the phone's own Back (Safari's swipe included)
  // and the screen's Back agree: both return here, which now reads "Already in your plans". From there, "See all your
  // plans" goes on to the list. (Popping the stack to Plans and opening the plan over it left web history behind the
  // app: Safari's Back then returned to this screen while the app showed Plans.)
  const handleViewPlan = useCallback(() => {
    if (!keptId) return;
    router.push({ pathname: '/saved-plan', params: { id: keptId, from: 'save' } } as never);
  }, [router, keptId]);

  const handleAddToCalendar = useCallback(async () => {
    if (!keptId || !readySource) return;
    setCalendarMessage(undefined);
    const result = await addToCalendar(buildCalendarEvent({ id: keptId, source: readySource }));
    if (result === 'failed') setCalendarMessage('We couldn’t open your calendar. Please try again.');
    if (result === 'shared') setCalendarMessage('Shared the plan’s details. Adding it straight to your calendar works in the FamilyPilot web app.');
  }, [keptId, readySource]);

  /**
   * "Change the plan" goes back to the place with the sheet already open on what was chosen, so changing one answer
   * is one tap rather than starting again. Replaces this screen, so Back from the place does not return to a day that
   * has been abandoned.
   */
  const handleChangePlan = useCallback(() => {
    if (!venueId) return handleBack();
    // The lunch the parent chose travels too, so changing the day or who is coming does not undo it.
    router.replace({ pathname: '/venue/[id]', params: { id: venueId, plan: 'open', ...planDraftToParams(draft), ...(lunchParam ? { lunch: lunchParam } : {}), ...(lunchPlaceParam ? { lunchPlace: lunchPlaceParam } : {}), ...(lunchOwnParam ? { lunchOwn: lunchOwnParam } : {}), ...(lunchOwnAtParam ? { lunchOwnAt: lunchOwnAtParam } : {}) } } as never);
  }, [router, venueId, draft, handleBack, lunchParam, lunchPlaceParam, lunchOwnParam, lunchOwnAtParam]);

  /**
   * The timeline's edits. Each one changes this screen's own answers (the URL parameters), so the plan builds again
   * through the real planner: nothing on the timeline is moved by hand.
   */
  const [editing, setEditing] = useState<'arrival' | 'visit' | 'lunch' | null>(null);

  /** Applies a verified option straight onto this screen's own answers: the plan builds again, nothing else changes. */
  const applyOption = useCallback(
    (option: PlanAdviceOptionView) => {
      if (option.kind === 'add-lunch') {
        // Adding lunch is a choice made in the picker, with the evidence in front of the parent; never applied unseen.
        setEditing('lunch');
        return;
      }
      const alternative = option.alternative;
      if (!alternative) return;
      if (alternative.kind === 'shorter') router.setParams({ visit: visitLengthToParam(alternative.visitMinutes) } as never);
      else if (alternative.kind === 'combined') router.setParams({ start: alternative.arriveAt, visit: visitLengthToParam(alternative.visitMinutes) } as never);
      else router.setParams({ start: alternative.arriveAt } as never);
    },
    [router],
  );
  const keepConflict = useCallback(
    (signature: string | null) => {
      router.setParams({ keep: signature ?? '' } as never);
    },
    [router],
  );
  /** Takes lunch out: the parent's "no", remembered for this plan. A lunch is only ever put in through the picker. */
  const toggleLunch = useCallback(() => {
    router.setParams({ lunch: 'off', lunchPlace: undefined, lunchOwn: undefined, lunchOwnAt: undefined } as never);
  }, [router]);
  const declineLunch = useCallback(() => {
    router.setParams({ lunch: 'off' } as never);
  }, [router]);
  // What the picker needs to say when each lunch would start, and which places list what this family needs.
  const lunchContext = useMemo(() => lunchNeeds(parties.families), [parties.families]);
  const rankedCandidates = useMemo(() => rankLunchCandidates(lunchCandidates, lunchContext), [lunchCandidates, lunchContext]);
  const chooseArrival = useCallback((time: string) => { setEditing(null); router.setParams({ start: time } as never); }, [router]);
  const chooseVisit = useCallback((length: VisitLength) => { setEditing(null); router.setParams({ visit: visitLengthToParam(length) } as never); }, [router]);
  const chooseLunch = useCallback((candidate: FoodCandidate | null) => {
    setEditing(null);
    if (!candidate) router.setParams({ lunch: 'off', lunchPlace: undefined, lunchOwn: undefined, lunchOwnAt: undefined } as never);
    else router.setParams({ lunch: 'on', lunchPlace: candidate.familypilotId, lunchOwn: undefined, lunchOwnAt: undefined } as never);
  }, [router]);
  const chooseOwnLunch = useCallback((own: { name: string; startAt?: string }) => {
    setEditing(null);
    router.setParams({ lunch: 'on', lunchOwn: own.name, lunchOwnAt: own.startAt ?? undefined, lunchPlace: undefined } as never);
  }, [router]);
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
              parties.families,
            ),
            householdTitle: householdTitle(profile),
          })
        : null,
    [readySource, profile, parties.families],
  );

  // Sending or sharing this day: to the connected family it was planned with, or as text. Saving is a step on the way.
  const { share, sendDay } = usePlanShare({ source: readySource, dayId: keptId, title: view?.title ?? '', dateLabel: view?.dateSummary ?? '' });
  const handleSaveAndSend = useCallback(async () => {
    const id = await handleSave();
    if (id) await sendDay(id);
  }, [handleSave, sendDay]);
  const planShare = share ? { ...share, onSend: share.to ? () => (keptId ? void sendDay(keptId) : void handleSaveAndSend()) : undefined } : undefined;

  const tightOption = view?.routines?.tight[0]?.options[0];
  const timeline = useMemo(
    () =>
      readySource
        ? planTimeline(readySource, {
            resolveSubject: makeSubjectResolver(profile, parties.families),
            children: timelineChildren(profile),
            leaveEarlier: Boolean(tightOption),
          })
        : [],
    [readySource, profile, parties.families, tightOption],
  );
  const editRow = useCallback(
    (edit: TimelineEdit) => {
      if (edit === 'leave-earlier') {
        if (tightOption) applyOption(tightOption);
        return;
      }
      setEditing(edit);
    },
    [tightOption, applyOption],
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
    <>
    <PlanScreenView
      view={view}
      notices={partyNotices}
      onApplyOption={applyOption}
      onKeepConflict={keepConflict}
      onChooseVisit={chooseVisit}
      onChangePlan={handleChangePlan}
      onToggleLunch={toggleLunch}
      lunchDecision={lunchOff ? 'declined' : lunchIncluded || ownLunch ? 'included' : 'undecided'}
      onChooseLunch={() => setEditing('lunch')}
      onDeclineLunch={declineLunch}
      timeline={timeline}
      onEditRow={editRow}
      onBack={handleBack}
      onSave={() => void handleSave()}
      share={planShare}
      saveState={saveState}
      saveError={currentSave?.message}
      onViewPlan={handleViewPlan}
      onAddToCalendar={() => void handleAddToCalendar()}
      calendarMessage={calendarMessage}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
    <PlanEditSheet
      editing={editing}
      onClose={() => setEditing(null)}
      startAt={draft.startAt}
      visit={draft.visit}
      lunchIncluded={lunchIncluded || Boolean(ownLunch)}
      candidates={rankedCandidates}
      chosenLunchId={lunchIncluded ? chosenCandidate?.familypilotId ?? null : null}
      ownLunch={ownLunch}
      evidence={(candidate) => lunchEvidence(candidate, { arriveAt: draft.startAt, visitMinutes: readySource?.visit?.minutes ?? 90, needs: lunchContext })}
      anchorName={venue.name}
      onArrival={chooseArrival}
      onVisit={chooseVisit}
      onLunch={chooseLunch}
      onOwnLunch={chooseOwnLunch}
    />
    </>
  );
}

/** Half-hour arrival times around the one chosen, so the common change is one tap; any time is one more. */
function shiftedTimes(startAt: string): string[] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startAt);
  if (!m) return ['09:00', '09:30', '10:00', '10:30', '11:00'];
  const base = Number(m[1]) * 60 + Number(m[2]);
  return [-60, -30, 30, 60]
    .map((delta) => base + delta)
    .filter((t) => t >= 6 * 60 && t <= 20 * 60)
    .map((t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
}

/**
 * The timeline's edit sheet: the arrival time, how long at the place, or which real place lunch is (or none). Every
 * choice re-plans the day; nothing here moves a time by hand.
 */
function PlanEditSheet({
  editing,
  onClose,
  startAt,
  visit,
  lunchIncluded,
  candidates,
  chosenLunchId,
  ownLunch,
  evidence,
  anchorName,
  onArrival,
  onVisit,
  onLunch,
  onOwnLunch,
}: {
  editing: 'arrival' | 'visit' | 'lunch' | null;
  onClose: () => void;
  startAt: string;
  visit: VisitLength;
  lunchIncluded: boolean;
  /** Recommended order: the places listing what this family needs first, then the shortest walk. */
  candidates: FoodCandidate[];
  chosenLunchId: string | null;
  ownLunch?: { name: string; startAt?: string };
  /** What can honestly be said about a place before choosing it (lunch-evidence.ts). */
  evidence: (candidate: FoodCandidate) => { text: string; provenance: string; warn?: boolean }[];
  anchorName: string;
  onArrival: (time: string) => void;
  onVisit: (length: VisitLength) => void;
  onLunch: (candidate: FoodCandidate | null) => void;
  onOwnLunch: (own: { name: string; startAt?: string }) => void;
}) {
  const [time, setTime] = useState(startAt);
  useEffect(() => setTime(startAt), [startAt, editing]);
  // Lunch is chosen in two steps: a place is picked, then confirmed. Nothing enters the day on the first tap.
  const [pending, setPending] = useState<string | null>(null);
  const [ownForm, setOwnForm] = useState(false);
  const [ownName, setOwnName] = useState('');
  const [ownTime, setOwnTime] = useState('');
  useEffect(() => { setPending(chosenLunchId); setOwnForm(false); setOwnName(ownLunch?.name ?? ''); setOwnTime(ownLunch?.startAt ?? ''); }, [editing, chosenLunchId, ownLunch]);
  const title = editing === 'arrival' ? 'Change your arrival' : editing === 'visit' ? 'Change how long you stay' : lunchIncluded ? 'Change lunch' : 'Add lunch to your day';
  return (
    <BottomSheet visible={editing !== null} onClose={onClose} accessibilityLabel={title} testID="plan-edit-sheet">
      <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
        <Text variant="heading2">{title}</Text>
        {editing === 'arrival' ? (
          <>
            <Text variant="bodySmall" color={colors.text.secondary}>
              When you want to arrive at {anchorName}. Leaving time, the routines and the time home are all worked out again.
            </Text>
            <View style={styles.sheetChips}>
              {shiftedTimes(startAt).map((t) => (
                <Chip key={t} size="small" label={t} active={t === time} onPress={() => onArrival(t)} testID={`plan-edit-arrival-${t}`} />
              ))}
            </View>
            <TimeField label="Any time" a11yLabel="Arrival time" value={time} onChange={setTime} />
            <Button label={`Arrive at ${time}`} onPress={() => onArrival(time)} disabled={!/^\d{1,2}:\d{2}$/.test(time)} testID="plan-edit-arrival-apply" />
          </>
        ) : null}
        {editing === 'visit' ? (
          <>
            <Text variant="bodySmall" color={colors.text.secondary}>
              How long at {anchorName}. Lunch, leaving and the time home move with it.
            </Text>
            <View style={styles.sheetChips}>
              {VISIT_CHOICES.map((choice) => (
                <Chip key={String(choice.value)} size="small" label={choice.label} active={choice.value === visit} onPress={() => onVisit(choice.value)} testID={`plan-edit-visit-${String(choice.value)}`} />
              ))}
            </View>
          </>
        ) : null}
        {editing === 'lunch' && !ownForm ? (
          <>
            <Text variant="bodySmall" color={colors.text.secondary} testID="plan-lunch-intro">
              {candidates.length
                ? `Places to eat near ${anchorName}, from OpenStreetMap. Listed first: places with the facilities your family needs on record, then the shortest walk. What is listed is what the mappers recorded, not something we checked, and “not listed” doesn’t mean “not there”.`
                : `We found no places to eat near ${anchorName} on OpenStreetMap. You can still add a place of your own.`}
            </Text>
            {candidates.map((candidate) => {
              const selected = candidate.familypilotId === pending;
              return (
                <Pressable
                  key={candidate.familypilotId}
                  onPress={() => setPending(candidate.familypilotId)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${candidate.name}${selected ? ', selected' : ''}`}
                  style={[styles.lunchOption, selected ? styles.lunchOptionChosen : null]}
                  testID="plan-edit-lunch-option"
                >
                  <View style={styles.lunchOptionText}>
                    <Text variant="heading3" numberOfLines={1}>{candidate.name}</Text>
                    {evidence(candidate).map((line) => (
                      <Text key={line.text} variant="caption" color={line.warn ? colors.warning[600] : line.provenance === 'unknown' ? colors.text.tertiary : colors.text.secondary}>
                        {line.text}
                      </Text>
                    ))}
                  </View>
                  <View style={[styles.lunchRadio, selected ? styles.lunchRadioOn : null]} />
                </Pressable>
              );
            })}
            {candidates.length ? (
              <Button
                label={lunchIncluded && pending === chosenLunchId ? 'Keep this lunch' : 'Add lunch to my day'}
                disabled={!pending}
                onPress={() => { const chosen = candidates.find((c) => c.familypilotId === pending); if (chosen) onLunch(chosen); }}
                testID="plan-lunch-confirm"
              />
            ) : null}
            <Button label="Add a place of your own" variant="ghost" onPress={() => setOwnForm(true)} testID="plan-lunch-own" />
            {lunchIncluded ? <Button label="Take lunch out of the day" variant="outline" onPress={() => onLunch(null)} testID="plan-edit-lunch-off" /> : null}
          </>
        ) : null}
        {editing === 'lunch' && ownForm ? (
          <>
            <Text variant="bodySmall" color={colors.text.secondary}>
              A place you know. We add nothing about it: no hours, facilities, journey or availability, and your time home isn’t adjusted.
            </Text>
            <Field label="Place name" value={ownName} onChange={setOwnName} placeholder="e.g. Sam’s Kitchen" testID="plan-lunch-own-name" />
            <TimeField label="Time (optional)" a11yLabel="Lunch time" value={ownTime} onChange={setOwnTime} optional />
            <Text variant="caption" color={colors.text.secondary}>Leave the time empty and lunch is shown straight after your visit.</Text>
            <Button
              label="Add lunch to my day"
              disabled={!ownName.trim() || (ownTime.trim() !== '' && !/^\d{1,2}:\d{2}$/.test(ownTime.trim()))}
              onPress={() => onOwnLunch({ name: ownName.trim(), ...(ownTime.trim() ? { startAt: ownTime.trim() } : {}) })}
              testID="plan-lunch-own-confirm"
            />
            <Button label="Back to places nearby" variant="ghost" onPress={() => setOwnForm(false)} />
          </>
        ) : null}
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </ScrollView>
    </BottomSheet>
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
  sheet: { paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.lg, gap: spacing.md },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lunchOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface },
  lunchOptionChosen: { borderColor: colors.action, borderWidth: 2 },
  lunchRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  lunchRadioOn: { borderColor: colors.action, backgroundColor: colors.action },
  lunchOptionText: { flex: 1, gap: 2 },
});
