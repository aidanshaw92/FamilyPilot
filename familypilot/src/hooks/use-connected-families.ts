import { useCallback, useEffect, useState } from 'react';

import { useFamilyProfile } from '@/src/hooks/use-queries';
import {
  Connection,
  InviteError,
  MySharing,
  createInvite,
  listConnections,
  removeConnection,
  updateSharing,
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
  /**
   * Updates what I share in an existing connection, in place: no reconnecting. Only ever called from the explicit
   * "Update what I share" panel, so every change is something the person asked for.
   */
  updateSharing: (connectionId: string, shareRoutines: boolean) => Promise<MySharing | null>;
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

  const share = useCallback(
    async (connectionId: string, shareRoutines: boolean): Promise<MySharing | null> => {
      if (!profile) return null;
      setError('');
      try {
        const result = await updateSharing(connectionId, profile, shareRoutines);
        await refresh();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update what you share.');
        return null;
      }
    },
    [profile, refresh],
  );

  const addToPlan = useCallback(
    (connection: Connection): string | null => {
      if (!connection.family) return null;
      const id = connectedFamilyId(connection.id);
      // The copy on this phone is replaced when what they share has changed (they may have updated it since), so a plan
      // never works from a stale picture of the other family. An unchanged copy is left alone.
      const stored = known.find((f) => f.id === id);
      const fresh = { ...connection.family, id };
      if (!stored || JSON.stringify(stored) !== JSON.stringify(fresh)) setFamily(fresh);
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
    updateSharing: share,
    addToPlan,
    refresh,
  };
}
