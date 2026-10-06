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
import { MySharing } from '@/src/services/planning/connection-invites';
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
  // The "what I share" panel: which connection is open, what the switch says, and the line confirming a change.
  const [sharingOpen, setSharingOpen] = useState<string | null>(null);
  const [shareChoice, setShareChoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const { accepted, pending, loaded, error, busy, invite } = families;

  const openSharing = (connectionId: string, mine: MySharing | null | undefined) => {
    // The switch opens on what is shared today, so an update is only ever a change the person makes.
    setShareChoice(Boolean(mine && mine.routines !== 'none'));
    setUpdated(null);
    setSharingOpen((open) => (open === connectionId ? null : connectionId));
  };
  const saveSharing = async (connectionId: string, label: string) => {
    setSaving(true);
    const result = await families.updateSharing(connectionId, shareChoice);
    setSaving(false);
    if (result) {
      setSharingOpen(null);
      // Said from what was actually stored, not from the switch: with no routines on the profile there is nothing to see.
      const said =
        result.routines === 'current'
          ? 'now sees when naps and feeds usually happen'
          : shareChoice
            ? 'has nothing to see yet, because there are no routines on your profile to share'
            : 'no longer sees your routines';
      setUpdated(`${label}: ${said}. You’re still connected.`);
    }
  };

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
            {connection.mySharing ? (
              <Text variant="caption" color={colors.text.secondary} testID="connection-my-sharing">
                {mySharingLine(connection.mySharing)}
              </Text>
            ) : null}
            {connection.mySharing?.routines === 'legacy' ? (
              <Text variant="caption" color={colors.warning[600]} testID="connection-legacy-note">
                You shared your home times before routines had a kind, so plans treat them cautiously (never as a nap or a feed) until you
                update what you share. You stay connected.
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button label="Meet halfway" size="sm" variant="outline" onPress={() => meet(family.id)} />
              <Button
                label="What I share"
                size="sm"
                variant="ghost"
                onPress={() => openSharing(connection.id, connection.mySharing)}
                testID="connection-what-i-share"
              />
              {confirm === connection.id ? (
                <>
                  <Button label="Disconnect now" size="sm" onPress={() => { void families.disconnect(connection.id); setConfirm(null); }} />
                  <Button label="Keep" size="sm" variant="ghost" onPress={() => setConfirm(null)} />
                </>
              ) : (
                <Button label="Disconnect" size="sm" variant="ghost" onPress={() => setConfirm(connection.id)} />
              )}
            </View>
            {sharingOpen === connection.id ? (
              <View style={styles.sharePanel} testID="connection-share-panel">
                <Text variant="label">What {family.label} sees about you</Text>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  A first name, a rough area, your children’s ages, the drive you’re happy with and your must-haves. Never names or an
                  address. Nothing changes until you tap Update, and you stay connected.
                </Text>
                <View style={styles.shareRow}>
                  <Switch
                    accessibilityLabel="Share when naps and feeds usually happen"
                    value={shareChoice}
                    onValueChange={setShareChoice}
                    testID="connection-share-routines"
                  />
                  <Text variant="bodySmall" style={styles.familyText}>
                    Share when naps and feeds usually happen (no names), so plans can work around both families’ routines.
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Button label={saving ? 'Updating…' : 'Update what I share'} size="sm" onPress={() => void saveSharing(connection.id, family.label)} testID="connection-update-sharing" />
                  <Button label="Cancel" size="sm" variant="ghost" onPress={() => setSharingOpen(null)} />
                </View>
              </View>
            ) : null}
            {updated && sharingOpen === null && updated.startsWith(family.label) ? (
              <Text variant="caption" color={colors.action} testID="connection-sharing-updated">
                {updated}
              </Text>
            ) : null}
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

/** What I share in a connection, in a line. */
function mySharingLine(sharing: MySharing): string {
  if (sharing.routines === 'current') return 'You share when naps and feeds usually happen.';
  if (sharing.routines === 'legacy') return 'You share when you’re home, but not what for (an older connection).';
  return 'You don’t share your routines with them.';
}

/** What this connection has actually shared, in a line: only what the snapshot holds. */
function sharedSummary(family: PlanningFamily): string {
  const parts = [family.area, family.ages.length ? `${family.ages.length} ${family.ages.length === 1 ? 'child' : 'children'}` : null];
  // A routine shared before routines carried a kind is only "home time": never called a nap or a feed.
  const legacy = family.routines.length > 0 && family.routines.some((r) => r.label === 'Home time');
  parts.push(legacy ? 'shares when they’re home (older link)' : family.routines.length ? 'shares their routines' : 'routines not shared');
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
  sharePanel: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface },
});
