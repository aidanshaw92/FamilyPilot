import { useCallback, useMemo, useState } from 'react';
import { Share } from 'react-native';

import type { PlanScreenViewProps } from '@/src/components/planning/PlanScreenView';
import { usePlanInvites } from '@/src/hooks/use-plan-invites';
import type { PlanViewModelInput } from '@/src/services/planning/plan-view-model';
import { describeSent, outingText, sharedDayRecipients } from '@/src/services/planning/shared-day';
import { usePlanningStore } from '@/src/stores/planning-store';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * What the Plan screen and a saved plan offer for the people a day is for, from one place so they cannot disagree.
 *
 * - A day planned with connected families can be sent to them in the app (`to` is set, `onSend` saves-then-sends or sends).
 * - Where a sent day has got to is read from its invitations (`status`), so a saved plan says "Kevin’s family accepted".
 * - Any day can be handed to the phone's share sheet as a few lines of text; that is also how a family added by postcode, who
 *   has no account here, is invited.
 *
 * A day that was received (someone else's, accepted) is never sent on.
 */
export function usePlanShare(args: { source: PlanViewModelInput | null; dayId: string | null; title: string; dateLabel: string; received?: boolean }) {
  const { source, dayId, title, dateLabel, received = false } = args;
  const recipients = useMemo(() => (source && !received ? sharedDayRecipients(source) : []), [source, received]);
  const invites = usePlanInvites(recipients.length > 0);
  const [outcome, setOutcome] = useState<{ state: 'idle' | 'sending' | 'sent' | 'failed'; message?: string }>({ state: 'idle' });

  const to = recipients.length > 0 && invites.available ? recipients.map((r) => familyDisplayName(r.label)).join(' and ') : undefined;
  const status = useMemo(() => (dayId ? describeSent(invites.sent.filter((i) => i.planId === dayId)) : undefined), [invites.sent, dayId]);

  const sendDay = useCallback(
    async (id: string | null) => {
      const day = id ? usePlanningStore.getState().savedDays.find((d) => d.id === id) : undefined;
      if (!day) return;
      setOutcome({ state: 'sending' });
      const results = await invites.send(day);
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) setOutcome({ state: 'sent' });
      else
        setOutcome({
          state: 'failed',
          message: `Your plan is saved, but we couldn’t send it to ${failed.map((f) => familyDisplayName(f.label)).join(' and ')}. ${failed[0].message ?? ''}`.trim(),
        });
    },
    [invites],
  );

  const shareText = useCallback(async () => {
    if (!source) return;
    try {
      await Share.share({ message: outingText(source, title, dateLabel) });
    } catch {
      // Sharing is the phone's own sheet; being dismissed or unavailable needs no message of ours.
    }
  }, [source, title, dateLabel]);

  const share: PlanScreenViewProps['share'] | undefined = source && !received
    ? { to, state: outcome.state, message: outcome.message, status, onSend: to ? () => void sendDay(dayId) : undefined, onShareText: () => void shareText() }
    : undefined;
  return { share, sendDay, invites, to };
}
