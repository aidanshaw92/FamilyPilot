import { useCallback, useEffect, useState } from 'react';

import { useFamilyProfile } from '@/src/hooks/use-queries';
import {
  Connection,
  InviteError,
  createInvite,
  listConnections,
  removeConnection,
} from '@/src/services/planning/connection-invites';
import { InviteRelationship } from '@/src/services/planning/invite-links';
import { PlanningFamily } from '@/src/services/planning/planner';
import { usePlanningStore } from '@/src/stores/planning-store';

/**
 * Connected families, as one thing the whole product reads.
 *
 * Profile lists them and invites new ones; Who's coming adds them to a plan; Meet halfway plans a meeting with one.
 * They used to be three separate bits of state. This is the one place that loads the connections, creates and cancels an
 * invitation, and turns a connection into the planning family every other screen already understands, so a family
 * connected on the Profile is the same family offered under Who's coming and in Meet halfway.
 *
 * What a connection carries is only the snapshot the other family agreed to share (first-name label, area rounded to
 * about a kilometre, children's ages, drive limit, preferences, and routines only if they opted in). Nothing else about
 * them is reachable from here.
 */
export interface ConnectedFamilies {
  /** Accepted connections, as planning families (id `connected-<connection id>`), with the relationship they were made as. */
  accepted: { connection: Connection; family: PlanningFamily }[];
  pending: Connection[];
  /** `null` while the first load is in flight. */
  loaded: boolean;
  error: string;
  busy: InviteRelationship | null;
  invite: { url: string; relationship: InviteRelationship } | null;
  create: (relationship: InviteRelationship, shareRoutines?: boolean) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  /** Ends a connection. The other family's copy of what was shared cannot be recalled, and the screen says so. */
  disconnect: (id: string) => Promise<void>;
  /** Puts a connection into the planning store so a plan can include it; returns its planning-family id. */
  addToPlan: (connection: Connection) => string | null;
  refresh: () => Promise<void>;
}

export const connectedFamilyId = (connectionId: string): string => `connected-${connectionId}`;

export function useConnectedFamilies(enabled = true): ConnectedFamilies {
  const { data: profile } = useFamilyProfile();
  const setFamily = usePlanningStore((s) => s.setFamily);
  const removeFamily = usePlanningStore((s) => s.removeFamily);
  const known = usePlanningStore((s) => s.families);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<InviteRelationship | null>(null);
  const [invite, setInvite] = useState<{ url: string; relationship: InviteRelationship } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConnections(await listConnections());
      setError('');
    } catch (e) {
      setConnections([]);
      setError(e instanceof Error ? e.message : 'Connections are unavailable.');
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const create = useCallback(
    async (relationship: InviteRelationship, shareRoutines = false) => {
      if (!profile || busy) return;
      setBusy(relationship);
      setError('');
      try {
        const created = await createInvite(profile, relationship, shareRoutines);
        setInvite({ url: created.url, relationship });
        void refresh();
      } catch (e) {
        setError(e instanceof InviteError || e instanceof Error ? e.message : 'Could not create the invitation.');
      } finally {
        setBusy(null);
      }
    },
    [profile, busy, refresh],
  );

  const cancel = useCallback(
    async (id: string) => {
      setError('');
      try {
        await removeConnection(id);
        void refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel the invitation.');
      }
    },
    [refresh],
  );

  const disconnect = useCallback(
    async (id: string) => {
      setError('');
      try {
        await removeConnection(id);
        removeFamily(connectedFamilyId(id));
        void refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not disconnect that family.');
      }
    },
    [refresh, removeFamily],
  );

  const addToPlan = useCallback(
    (connection: Connection): string | null => {
      if (!connection.family) return null;
      const id = connectedFamilyId(connection.id);
      if (!known.some((f) => f.id === id)) setFamily({ ...connection.family, id });
      return id;
    },
    [known, setFamily],
  );

  const all = connections ?? [];
  return {
    accepted: all
      .filter((c) => !c.pending && c.family)
      .map((connection) => ({ connection, family: { ...(connection.family as PlanningFamily), id: connectedFamilyId(connection.id) } })),
    pending: all.filter((c) => c.pending),
    loaded: connections !== null,
    error,
    busy,
    invite,
    create,
    cancel,
    disconnect,
    addToPlan,
    refresh,
  };
}
