import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanScreenView } from '@/src/components/planning/PlanScreenView';
import { EmptyState } from '@/src/components/ui';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { firstValue } from '@/src/services/planning/plan-draft';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { usePlanningStore } from '@/src/stores/planning-store';
import { buildCalendarEvent } from '@/src/services/planning/calendar-event';
import { addToCalendar } from '@/src/services/planning/add-to-calendar';
import { householdTitle } from '@/src/utils/household';

/**
 * A saved day, opened again.
 *
 * Renders the planner's saved answer through the same adapter and the same screen as the day it was saved from, with
 * names added from this device's profile, so it reads exactly as it did. It is a snapshot: nothing is rebuilt and nothing
 * is looked up, so opening it costs no journey request and no search.
 */
export default function SavedPlanScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const id = firstValue(params.id) ?? '';
  const { data: profile } = useFamilyProfile();
  const day = usePlanningStore((state) => state.savedDays.find((d) => d.id === id));
  const families = usePlanningStore((state) => state.families);

  const view = useMemo(
    () =>
      day
        ? toPlanViewModel(day.source, {
            resolveSubject: makeSubjectResolver(
              profile,
              families,
            ),
            householdTitle: householdTitle(profile),
          })
        : null,
    [day, profile, families],
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips' as never));
  // Reached through "View plan" straight after saving: offer the way on to Plans, where the row is marked as just saved.
  const fromSave = firstValue(params.from) === 'save';
  const seeAllPlans = () => router.dismissTo({ pathname: '/(tabs)/trips', params: { justSaved: id } } as never);

  // A saved plan can always be put in the calendar from here, as well as straight after saving it.
  const [calendarMessage, setCalendarMessage] = useState<string | undefined>(undefined);
  const addPlanToCalendar = async () => {
    if (!day) return;
    setCalendarMessage(undefined);
    const result = await addToCalendar(buildCalendarEvent(day));
    if (result === 'failed') setCalendarMessage('We couldn’t open your calendar. Please try again.');
    if (result === 'shared') setCalendarMessage('Shared the plan’s details. Adding it straight to your calendar works in the FamilyPilot web app.');
  };

  if (!view) {
    return (
      <EmptyState
        icon="help-circle-outline"
        title="We could not find that plan"
        message="It may have been deleted from this device."
      />
    );
  }
  return (
    <PlanScreenView
      view={view}
      onBack={back}
      onSave={() => {}}
      saved
      onAddToCalendar={() => void addPlanToCalendar()}
      onSeeAllPlans={fromSave ? seeAllPlans : undefined}
      calendarMessage={calendarMessage}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
