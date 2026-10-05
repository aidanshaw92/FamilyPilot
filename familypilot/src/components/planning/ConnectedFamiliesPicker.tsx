import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { Connection, InviteError, createInvite, listConnections, removeConnection } from '@/src/services/planning/connection-invites';
import { INVITE_RELATIONSHIPS, InviteRelationship } from '@/src/services/planning/invite-links';
import { usePlanningStore } from '@/src/stores/planning-store';

import { InviteLinkCard } from './InviteLinkCard';

/**
 * "Add another family", under Who's coming: the families already connected to this account, and a way to invite
 * someone new.
 *
 * A connected family is added to the plan with one tap and appears as a chip with the others. What a plan knows about
 * them is the snapshot they agreed to share (first name, rounded area, ages, preferences); nothing else about them is
 * reachable from here. Someone not yet connected is invited with a single-use link, never by typing their details.
 */
const RELATIONSHIP_LABEL: Record<InviteRelationship, string> = {
  partner: 'Partner',
  family: 'Family',
  friend: 'Friend',
};

export function ConnectedFamiliesPicker({
  selectedIds,
  onSelect,
  onAddManually,
}: {
  selectedIds: string[];
  /** Called with the planning-family id once a connected family has been added, so it can be chosen. */
  onSelect: (id: string) => void;
  onAddManually?: () => void;
}) {
  const { data: profile } = useFamilyProfile();
  const setFamily = usePlanningStore((s) => s.setFamily);
  const known = usePlanningStore((s) => s.families);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<InviteRelationship | null>(null);
  const [invite, setInvite] = useState<{ url: string; relationship: InviteRelationship } | null>(null);

  const load = useCallback(async () => {
    try {
      setConnections(await listConnections());
      setError('');
    } catch (e) {
      setConnections([]);
      setError(e instanceof Error ? e.message : 'Connections are unavailable.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accepted = (connections ?? []).filter((c) => !c.pending && c.family);
  const pending = (connections ?? []).filter((c) => c.pending);

  const add = (connection: Connection) => {
    if (!connection.family) return;
    const id = `connected-${connection.id}`;
    if (!known.some((f) => f.id === id)) setFamily({ ...connection.family, id });
    onSelect(id);
  };

  // Cancelling a pending invitation deletes it: the link stops working at once.
  const cancel = async (id: string) => {
    setError('');
    try {
      await removeConnection(id);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel the invitation.');
    }
  };

  const create = async (relationship: InviteRelationship) => {
    if (!profile || busy) return;
    setBusy(relationship);
    setError('');
    try {
      const created = await createInvite(profile, relationship);
      setInvite({ url: created.url, relationship });
      void load();
    } catch (e) {
      setError(e instanceof InviteError || e instanceof Error ? e.message : 'Could not create the invitation.');
    } finally {
      setBusy(null);
    }
  };

  const first = profile?.parentName?.trim().split(/\s+/)[0];

  return (
    <View style={styles.panel} testID="connected-families-picker">
      <Text variant="label">Your connected families</Text>
      {connections === null ? (
        <Text variant="bodySmall" color={colors.text.secondary}>
          Loading…
        </Text>
      ) : accepted.length === 0 ? (
        <Text variant="bodySmall" color={colors.text.secondary} testID="no-connections">
          Nobody is connected yet. Invite someone below and they will appear here once they accept.
        </Text>
      ) : (
        <View style={styles.chips}>
          {accepted.map((connection) => {
            const id = `connected-${connection.id}`;
            const chosen = selectedIds.includes(id);
            return (
              <Chip
                key={connection.id}
                size="small"
                label={`${chosen ? '' : '+ '}${connection.family!.label} · ${connection.family!.ages.length} ${connection.family!.ages.length === 1 ? 'child' : 'children'}`}
                active={chosen}
                onPress={() => add(connection)}
              />
            );
          })}
        </View>
      )}
      {pending.length > 0 ? (
        <View style={styles.pending} testID="pending-invitations">
          <Text variant="caption" color={colors.text.tertiary}>
            {pending.length === 1 ? '1 invitation is waiting.' : `${pending.length} invitations are waiting.`}
          </Text>
          {pending.map((connection) => {
            const expired = Date.parse(connection.expiresAt) <= Date.now();
            return (
              <View key={connection.id} style={styles.pendingRow}>
                <Text variant="bodySmall" style={styles.pendingText}>
                  {RELATIONSHIP_LABEL[connection.relationship ?? 'friend']} invitation · {expired ? 'expired' : `expires ${formatExpiry(connection.expiresAt)}`}
                </Text>
                <Button
                  label={expired ? 'Remove' : 'Cancel'}
                  variant="ghost"
                  size="sm"
                  onPress={() => void cancel(connection.id)}
                  testID={`${expired ? 'remove' : 'cancel'}-invitation-${connection.id}`}
                />
              </View>
            );
          })}
        </View>
      ) : null}

      <Text variant="label" style={styles.gap}>
        Invite someone new
      </Text>
      <View style={styles.chips}>
        {INVITE_RELATIONSHIPS.map((relationship) => (
          <Chip
            key={relationship}
            size="small"
            label={busy === relationship ? 'Creating…' : `+ ${RELATIONSHIP_LABEL[relationship]}`}
            onPress={() => void create(relationship)}
          />
        ))}
      </View>
      {invite ? <InviteLinkCard url={invite.url} relationship={invite.relationship} inviterFirstName={first} /> : null}
      {error ? (
        <Text variant="caption" color={colors.error[600]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {onAddManually ? <Button label="Add a family manually" variant="ghost" size="sm" onPress={onAddManually} /> : null}
    </View>
  );
}

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'soon' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  pending: { gap: spacing.xs },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pendingText: { flex: 1 },
  panel: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap: { marginTop: spacing.sm },
});
