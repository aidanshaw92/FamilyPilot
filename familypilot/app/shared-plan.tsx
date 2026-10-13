import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanScreenView } from '@/src/components/planning/PlanScreenView';
import { EmptyState } from '@/src/components/ui';
import { acceptedDayId, usePlanInvites } from '@/src/hooks/use-plan-invites';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { firstValue } from '@/src/services/planning/plan-draft';
import { planTimeline, timelineChildren } from '@/src/services/planning/plan-timeline';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { isSharedDayEnvelope, reframeForRecipient } from '@/src/services/planning/shared-day';
import { buildCalendarEvent } from '@/src/services/planning/calendar-event';
import { addToCalendar } from '@/src/services/planning/add-to-calendar';
import { usePlanningStore } from '@/src/stores/planning-store';
import { householdTitle } from '@/src/utils/household';

/**
 * A day another family sent, read before answering it.
 *
 * It is the same Plan screen as the day they saved, read from the recipient's side: they are "Our family", the sender is the
 * connected family, and nothing about the sender but what they chose to share and what the outing needs (shared-day.ts).
 * Accepting saves it on this phone as their own plan (so it is in Plans, opens offline and goes to the calendar); declining
 * leaves nothing behind.
 */
export default function SharedPlanScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inviteId = firstValue(params.invite) ?? '';
  const invites = usePlanInvites(true);
  const { data: profile } = useFamilyProfile();
  const families = usePlanningStore((s) => s.families);
  const invite = invites.received.find((i) => i.id === inviteId);
  const [error, setError] = useState<string | undefined>(undefined);
  const [calendarMessage, setCalendarMessage] = useState<string | undefined>(undefined);

  const source = useMemo(
    () => (invite && isSharedDayEnvelope(invite.plan) ? reframeForRecipient(invite.plan.day, { connectionId: invite.connectionId, senderLabel: invite.otherLabel }) : null),
    [invite],
  );
  const resolver = useMemo(() => makeSubjectResolver(profile, families), [profile, families]);
  const view = useMemo(() => (source ? toPlanViewModel(source, { resolveSubject: resolver, householdTitle: householdTitle(profile) }) : null), [source, resolver, profile]);
  const timeline = useMemo(() => (source ? planTimeline(source, { resolveSubject: resolver, children: timelineChildren(profile) }) : []), [source, resolver, profile]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips' as never));
  const toPlans = () => router.replace('/(tabs)/trips' as never);

  if (!invite && !invites.loaded) return null;
  if (!invite || !source || !view) {
    return (
      <EmptyState
        icon="help-circle-outline"
        title="We couldn’t find that invitation"
        message={invites.error || 'It may have been withdrawn, or this phone isn’t signed in to the account it was sent to.'}
      />
    );
  }

  const answer = async (status: 'accepted' | 'declined') => {
    setError(undefined);
    const problem = await invites.respond(invite, status);
    if (problem) setError(problem);
    else if (status === 'declined') toPlans();
  };
  const addToMyCalendar = async () => {
    setCalendarMessage(undefined);
    const result = await addToCalendar(buildCalendarEvent({ id: acceptedDayId(invite.id), source }));
    if (result === 'failed') setCalendarMessage('We couldn’t open your calendar. Please try again.');
    if (result === 'shared') setCalendarMessage('Shared the plan’s details. Adding it straight to your calendar works in the FamilyPilot web app.');
  };

  return (
    <PlanScreenView
      view={view}
      onBack={back}
      onSave={() => {}}
      timeline={timeline}
      invite={{
        fromLabel: invite.otherLabel,
        status: invite.status,
        busy: invites.busy === invite.id,
        error,
        onAccept: () => void answer('accepted'),
        onDecline: () => void answer('declined'),
      }}
      onAddToCalendar={() => void addToMyCalendar()}
      onSeeAllPlans={toPlans}
      calendarMessage={calendarMessage}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
