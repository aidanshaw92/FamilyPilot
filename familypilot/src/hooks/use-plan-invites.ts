import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  PlanInvite,
  cancelPlanInvite,
  createPlanInvite,
  listPlanInvites,
  respondToPlanInvite,
} from '@/src/services/planning/plan-invites';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import {
  SharedDayTooLargeError,
  buildSharedDay,
  isSharedDayEnvelope,
  reframeForRecipient,
  sharedDayRecipients,
} from '@/src/services/planning/shared-day';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { SavedDay, usePlanningStore } from '@/src/stores/planning-store';

/**
 * Plans sent between connected families: the one place the app lists them, sends them, answers them and keeps what was
 * accepted.
 *
 * - `send` makes one invitation per connected family the day was planned with (the day, with the sender's private detail
 *   removed: shared-day.ts) and never sends the same day to the same family twice while an invitation to them is still
 *   open or accepted.
 * - `respond` accepts or declines. An accepted day is saved on this phone as the recipient's own plan, so it is in Plans,
 *   opens offline and goes to the calendar like any other; it is saved before "accepted" is reported, and a failure to
 *   answer leaves everything as it was.
 * - Without an account there are no invitations: `available` is false and nothing here touches the network.
 */

export interface SendOutcome {
  label: string;
  connectionId: string;
  ok: boolean;
  /** Parent-facing, only when `ok` is false. */
  message?: string;
}

export interface PlanInvites {
  available: boolean;
  loaded: boolean;
  error: string;
  /** The id of the invitation being answered, or 'send'. */
  busy: string | null;
  received: PlanInvite[];
  sent: PlanInvite[];
  refresh: () => Promise<void>;
  send: (day: SavedDay) => Promise<SendOutcome[]>;
  respond: (invite: PlanInvite, status: 'accepted' | 'declined') => Promise<string | null>;
  cancel: (id: string) => Promise<void>;
}

const TOO_LARGE = 'This plan is too large to send in the app. Use Share instead.';
const OFFLINE = 'We couldn’t reach FamilyPilot. Check your connection and try again.';
const messageOf = (e: unknown): string => {
  if (e instanceof SharedDayTooLargeError) return TOO_LARGE;
  if (e instanceof TypeError) return OFFLINE;
  return e instanceof Error && e.message ? e.message : OFFLINE;
};

/** The id an accepted invitation is saved under, so answering twice (or from two screens) is one saved day. */
export const acceptedDayId = (inviteId: string): string => `invite-${inviteId}`;

/** The day an accepted invitation becomes on the recipient's phone: their own plan, with the sender as the other family. */
export function acceptedDay(invite: PlanInvite, at = new Date().toISOString()): SavedDay | null {
  if (!isSharedDayEnvelope(invite.plan)) return null;
  return {
    id: acceptedDayId(invite.id),
    createdAt: at,
    source: reframeForRecipient(invite.plan.day, { connectionId: invite.connectionId, senderLabel: invite.otherLabel }),
    shared: { inviteId: invite.id, connectionId: invite.connectionId, fromLabel: invite.otherLabel, acceptedAt: invite.respondedAt ?? at },
  };
}

export function usePlanInvites(enabled = true): PlanInvites {
  const status = useAuthStore((s) => s.status);
  const available = accountRequired() && status === 'signed_in';
  const saveDay = usePlanningStore((s) => s.saveDay);
  const [invites, setInvites] = useState<PlanInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!available) {
      setInvites([]);
      setLoaded(true);
      return;
    }
    try {
      const list = await listPlanInvites();
      setInvites(list);
      setError('');
      // Accepted on another device (or before this phone saved it): keep it here too, once.
      const have = new Set(usePlanningStore.getState().savedDays.map((d) => d.id));
      for (const i of list) {
        if (i.direction === 'received' && i.status === 'accepted' && !have.has(acceptedDayId(i.id))) {
          const day = acceptedDay(i);
          if (day) usePlanningStore.getState().saveDay(day);
        }
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoaded(true);
    }
  }, [available]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const send = useCallback(
    async (day: SavedDay): Promise<SendOutcome[]> => {
      const recipients = sharedDayRecipients(day.source);
      if (!available) return recipients.map((r) => ({ label: r.label, connectionId: r.connectionId, ok: false, message: 'Sign in to send plans to a connected family.' }));
      setBusy('send');
      const name = toPlanViewModel(day.source).title;
      let current = invites;
      try {
        current = await listPlanInvites();
      } catch {
        // Not being able to list is not a reason not to try: the endpoint is the authority on what is allowed.
      }
      const outcomes: SendOutcome[] = [];
      for (const r of recipients) {
        const open = current.some((i) => i.direction === 'sent' && i.planId === day.id && i.connectionId === r.connectionId && i.status !== 'declined');
        if (open) {
          outcomes.push({ label: r.label, connectionId: r.connectionId, ok: true });
          continue;
        }
        try {
          await createPlanInvite(r.connectionId, { id: day.id, date: day.source.itinerary.date, plan: buildSharedDay(day.source, r.connectionId, name) });
          outcomes.push({ label: r.label, connectionId: r.connectionId, ok: true });
        } catch (e) {
          outcomes.push({ label: r.label, connectionId: r.connectionId, ok: false, message: messageOf(e) });
        }
      }
      await refresh();
      setBusy(null);
      return outcomes;
    },
    [available, invites, refresh],
  );

  const respond = useCallback(
    async (invite: PlanInvite, answer: 'accepted' | 'declined'): Promise<string | null> => {
      setBusy(invite.id);
      try {
        await respondToPlanInvite(invite.id, answer);
        if (answer === 'accepted') {
          const day = acceptedDay(invite);
          if (day) saveDay(day);
        }
        await refresh();
        return null;
      } catch (e) {
        return messageOf(e);
      } finally {
        setBusy(null);
      }
    },
    [refresh, saveDay],
  );

  const cancel = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await cancelPlanInvite(id);
        await refresh();
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const received = useMemo(() => invites.filter((i) => i.direction === 'received'), [invites]);
  const sent = useMemo(() => invites.filter((i) => i.direction === 'sent'), [invites]);
  return { available, loaded, error, busy, received, sent, refresh, send, respond, cancel };
}
