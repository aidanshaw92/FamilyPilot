import { useIsFocused } from 'expo-router';
import { useMemo } from 'react';

import { usePlanInvites } from '@/src/hooks/use-plan-invites';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { InvitationCandidate, UpNext, UpNextCandidate, pickUpNext } from '@/src/services/planning/up-next';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { describeSent, isSharedDayEnvelope, reframeForRecipient } from '@/src/services/planning/shared-day';
import { SavedDay, localDate, usePlanningStore } from '@/src/stores/planning-store';
import { familyDisplayName } from '@/src/utils/family-title';
import { householdTitle } from '@/src/utils/household';

/**
 * The one thing Home leads with when a day is already in motion (up-next.ts), read from what this phone already holds and the
 * account's own invitation list. Nothing is fetched from any place provider, and without an account nothing is fetched at all.
 * The invitation list is read again each time Home comes back on screen, so an invitation that arrived while the parent was
 * elsewhere is here when they return.
 */
export function useUpNext(): UpNext | null {
  const focused = useIsFocused();
  const { data: profile } = useFamilyProfile();
  const savedDays = usePlanningStore((s) => s.savedDays);
  const families = usePlanningStore((s) => s.families);
  const invites = usePlanInvites(focused);

  return useMemo(() => {
    const resolver = makeSubjectResolver(profile, families);
    const title = householdTitle(profile);
    const view = (source: SavedDay['source']) => toPlanViewModel(source, { resolveSubject: resolver, householdTitle: title });
    const start = (source: SavedDay['source']) => source.itinerary.stops[0]?.arrive ?? 0;

    const plans: UpNextCandidate[] = savedDays.map((day) => {
      const v = view(day.source);
      const status = day.shared ? { text: `From ${familyDisplayName(day.shared.fromLabel)} · you’re going` } : describeSent(invites.sent.filter((i) => i.planId === day.id));
      return { id: day.id, date: day.source.itinerary.date, start: start(day.source), title: v.title, dateSummary: v.dateSummary, note: status?.text };
    });

    const invitations: InvitationCandidate[] = [];
    for (const i of invites.received) {
      if (i.status !== 'pending' || !isSharedDayEnvelope(i.plan)) continue;
      const source = reframeForRecipient(i.plan.day, { connectionId: i.connectionId, senderLabel: i.otherLabel });
      const v = view(source);
      invitations.push({ id: i.id, date: source.itinerary.date, start: start(source), title: v.title, dateSummary: v.dateSummary, from: familyDisplayName(i.otherLabel) });
    }

    return pickUpNext({ today: localDate(), plans, invitations });
  }, [profile, families, savedDays, invites.sent, invites.received]);
}
