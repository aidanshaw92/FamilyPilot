import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanScreenView } from '@/src/components/planning/PlanScreenView';
import { EmptyState } from '@/src/components/ui';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { firstValue } from '@/src/services/planning/plan-draft';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { usePlanningStore } from '@/src/stores/planning-store';
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

  if (!view) {
    return (
      <EmptyState
        icon="help-circle-outline"
        title="We could not find that plan"
        message="It may have been deleted from this device."
      />
    );
  }
  return <PlanScreenView view={view} onBack={back} onSave={() => {}} saved topInset={insets.top} bottomInset={insets.bottom} />;
}
