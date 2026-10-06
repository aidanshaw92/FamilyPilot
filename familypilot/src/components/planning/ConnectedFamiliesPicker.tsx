import { StyleSheet, View } from 'react-native';

import { Button, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useConnectedFamilies } from '@/src/hooks/use-connected-families';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { Connection } from '@/src/services/planning/connection-invites';
import { INVITE_RELATIONSHIPS, InviteRelationship } from '@/src/services/planning/invite-links';

import { InviteLinkCard } from './InviteLinkCard';
import { familyDisplayName } from '@/src/utils/family-title';

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
  /** Opens the add-by-postcode form: a family that is not connected, from a first name and a postcode. */
  onAddManually?: () => void;
}) {
  const { data: profile } = useFamilyProfile();
  const families = useConnectedFamilies();
  const { accepted, pending, loaded, error, busy, invite } = families;

  const add = (connection: Connection) => {
    const id = families.addToPlan(connection);
    if (id) onSelect(id);
  };

  const first = profile?.parentName?.trim().split(/\s+/)[0];

  return (
    <View style={styles.panel} testID="connected-families-picker">
      <Text variant="label">Your connected families</Text>
      {!loaded ? (
        <Text variant="bodySmall" color={colors.text.secondary}>
          Loading…
        </Text>
      ) : accepted.length === 0 ? (
        <Text variant="bodySmall" color={colors.text.secondary} testID="no-connections">
          Nobody is connected yet. Invite someone below and they will appear here once they accept.
        </Text>
      ) : (
        <View style={styles.chips}>
          {accepted.map(({ connection, family }) => {
            const chosen = selectedIds.includes(family.id);
            return (
              <Chip
                key={connection.id}
                size="small"
                label={`${chosen ? '' : '+ '}${familyDisplayName(family.label)} · ${family.ages.length} ${family.ages.length === 1 ? 'child' : 'children'}`}
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
                  onPress={() => void families.cancel(connection.id)}
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
            onPress={() => void families.create(relationship)}
          />
        ))}
      </View>
      {invite ? <InviteLinkCard url={invite.url} relationship={invite.relationship} inviterFirstName={first} /> : null}
      {error ? (
        <Text variant="caption" color={colors.error[600]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {onAddManually ? <Button label="Add a family by postcode" variant="ghost" size="sm" onPress={onAddManually} testID="add-by-postcode" /> : null}
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
