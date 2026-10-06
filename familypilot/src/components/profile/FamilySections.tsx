import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AddFamilyByPostcode } from '@/src/components/planning/AddFamilyByPostcode';
import { InviteLinkCard } from '@/src/components/planning/InviteLinkCard';
import { Button, Card, Chip, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useConnectedFamilies } from '@/src/hooks/use-connected-families';
import { INVITE_RELATIONSHIPS, InviteRelationship } from '@/src/services/planning/invite-links';
import { PlanningFamily } from '@/src/services/planning/planner';
import { usePlanningStore } from '@/src/stores/planning-store';
import { FamilyProfile } from '@/src/types';
import { MOBILITY_LABELS } from '@/src/utils/family-mobility';
import { householdPeople } from '@/src/utils/household';
import { formatChildAge } from '@/src/utils/profile-defaults';

/**
 * YOUR FAMILY and CONNECTED FAMILIES: the two halves of "who do I plan with", side by side on the Profile.
 *
 * Both feed the same places. The household here is who is selected under Who's coming; the connected families here are
 * the ones offered there and in Meet halfway (one shared model: `useConnectedFamilies`). A parent does not have to
 * discover a hidden screen to add a family: they invite one from here, or add one by postcode, and it is there wherever
 * a plan asks who is coming.
 *
 * What a connected family shares is shown plainly on each row, so nobody is left wondering what the other side can see.
 */
const RELATIONSHIP_LABEL: Record<InviteRelationship, string> = { partner: 'Partner', family: 'Family', friend: 'Friend' };

export function YourFamilySection({ profile }: { profile: FamilyProfile }) {
  const people = householdPeople(profile);
  const byId = new Map(profile.members.map((m) => [m.id, m]));
  return (
    <View testID="profile-your-family">
      <Text variant="heading2" style={styles.title}>
        Your family
      </Text>
      <Card style={styles.card}>
        {people.length === 0 ? (
          <Row icon="person-add-outline" label="Nobody yet" value="Add in Edit" />
        ) : null}
        {people.map((person) => {
          const member = byId.get(person.id);
          const value =
            person.kind === 'adult'
              ? person.isYou
                ? 'You'
                : person.relationship
                  ? { partner: 'Partner', 'co-parent': 'Co-parent', other: 'Adult' }[person.relationship]
                  : 'Adult'
              : [
                  member ? formatChildAge(member) : person.ageLabel,
                  // A child whose birthday was never entered keeps being asked for it, by the row itself.
                  member && !member.dobKnown ? 'add birthday' : null,
                  ...(member?.mobility ?? []).map((m) => MOBILITY_LABELS[m].toLowerCase()),
                ]
                  .filter(Boolean)
                  .join(' · ');
          return <Row key={person.id} icon={person.kind === 'adult' ? 'person-outline' : 'happy-outline'} label={person.name} value={value} />;
        })}
      </Card>
    </View>
  );
}

export function ConnectedFamiliesSection({ accountsAvailable }: { accountsAvailable: boolean }) {
  const router = useRouter();
  const families = useConnectedFamilies(accountsAvailable);
  // Selected whole and filtered here: a selector that returns a new array every time re-renders without end.
  const storedFamilies = usePlanningStore((s) => s.families);
  const local = useMemo(() => storedFamilies.filter((f) => f.id.startsWith('guest-')), [storedFamilies]);
  const removeFamily = usePlanningStore((s) => s.removeFamily);
  const [shareRoutines, setShareRoutines] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const { accepted, pending, loaded, error, busy, invite } = families;

  const meet = (familyId: string) => router.push({ pathname: '/halfway', params: { family: familyId } } as never);

  return (
    <View testID="profile-connected-families">
      <Text variant="heading2" style={styles.title}>
        Connected families
      </Text>
      <Card style={styles.card}>
        <Text variant="bodySmall" color={colors.text.secondary}>
          Families you plan with. They see only what they agreed to share: a first name, a rough area, the children’s ages
          and the drive they’re happy with. Never names or an address.
        </Text>

        {accountsAvailable ? (
          !loaded ? (
            <Text variant="bodySmall" color={colors.text.secondary}>
              Loading…
            </Text>
          ) : accepted.length === 0 && local.length === 0 ? (
            <Text variant="bodySmall" color={colors.text.secondary} testID="profile-no-connections">
              Nobody is connected yet.
            </Text>
          ) : null
        ) : (
          <Text variant="bodySmall" color={colors.text.secondary}>
            Connecting families needs an account. You can still add a family by postcode below.
          </Text>
        )}

        {accepted.map(({ connection, family }) => (
          <View key={connection.id} style={styles.family} testID="connected-family-row">
            <View style={styles.familyHead}>
              <Ionicons name="people-outline" size={20} color={colors.text.secondary} />
              <View style={styles.familyText}>
                <Text variant="heading3">{family.label}</Text>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  {sharedSummary(family)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button label="Meet halfway" size="sm" variant="outline" onPress={() => meet(family.id)} />
              {confirm === connection.id ? (
                <>
                  <Button label="Disconnect now" size="sm" onPress={() => { void families.disconnect(connection.id); setConfirm(null); }} />
                  <Button label="Keep" size="sm" variant="ghost" onPress={() => setConfirm(null)} />
                </>
              ) : (
                <Button label="Disconnect" size="sm" variant="ghost" onPress={() => setConfirm(connection.id)} />
              )}
            </View>
            {confirm === connection.id ? (
              <Text variant="caption" color={colors.text.tertiary}>
                What was shared before can’t be recalled from their phone.
              </Text>
            ) : null}
          </View>
        ))}

        {local.map((family) => (
          <View key={family.id} style={styles.family} testID="local-family-row">
            <View style={styles.familyHead}>
              <Ionicons name="pin-outline" size={20} color={colors.text.secondary} />
              <View style={styles.familyText}>
                <Text variant="heading3">{family.label}</Text>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  {family.area} · starting point only, on this phone
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button label="Meet halfway" size="sm" variant="outline" onPress={() => meet(family.id)} />
              <Button label="Remove" size="sm" variant="ghost" onPress={() => removeFamily(family.id)} />
            </View>
          </View>
        ))}

        {pending.map((connection) => {
          const expired = Date.parse(connection.expiresAt) <= Date.now();
          return (
            <View key={connection.id} style={styles.pendingRow}>
              <Text variant="bodySmall" style={styles.familyText}>
                {RELATIONSHIP_LABEL[connection.relationship ?? 'friend']} invitation · {expired ? 'expired' : 'waiting'}
              </Text>
              <Button label={expired ? 'Remove' : 'Cancel'} size="sm" variant="ghost" onPress={() => void families.cancel(connection.id)} />
            </View>
          );
        })}

        {accountsAvailable ? (
          <View style={styles.invite}>
            <Text variant="label">+ Invite another family</Text>
            <View style={styles.chips}>
              {INVITE_RELATIONSHIPS.map((relationship) => (
                <Chip
                  key={relationship}
                  size="small"
                  label={busy === relationship ? 'Creating…' : RELATIONSHIP_LABEL[relationship]}
                  onPress={() => void families.create(relationship, shareRoutines)}
                />
              ))}
            </View>
            <View style={styles.shareRow}>
              <Switch
                accessibilityLabel="Also share when naps and feeds usually happen"
                value={shareRoutines}
                onValueChange={setShareRoutines}
              />
              <Text variant="bodySmall" style={styles.familyText}>
                Also share when naps and feeds usually happen (no names), so plans can work around both families’ routines.
              </Text>
            </View>
            {invite ? <InviteLinkCard url={invite.url} relationship={invite.relationship} /> : null}
          </View>
        ) : null}

        {adding ? (
          <AddFamilyByPostcode onAdded={() => setAdding(false)} onCancel={() => setAdding(false)} />
        ) : (
          <Button label="Add a family by postcode" variant="ghost" size="sm" onPress={() => setAdding(true)} testID="profile-add-by-postcode" />
        )}

        {error ? (
          <Text variant="caption" color={colors.error[600]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

/** What this connection has actually shared, in a line: only what the snapshot holds. */
function sharedSummary(family: PlanningFamily): string {
  const parts = [family.area, family.ages.length ? `${family.ages.length} ${family.ages.length === 1 ? 'child' : 'children'}` : null];
  parts.push(family.routines.length ? 'shares their routines' : 'routines not shared');
  return parts.filter(Boolean).join(' · ');
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.text.secondary} />
      <Text variant="body" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.lg, marginBottom: spacing.lg },
  card: { gap: spacing.md, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: spacing.sm,
  },
  rowLabel: { flex: 1 },
  rowValue: { textAlign: 'right', flexShrink: 1 },
  family: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  familyHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  familyText: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  invite: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
