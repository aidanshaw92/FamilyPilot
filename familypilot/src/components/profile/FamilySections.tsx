import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AddFamilyByPostcode } from '@/src/components/planning/AddFamilyByPostcode';
import { InviteLinkCard } from '@/src/components/planning/InviteLinkCard';
import { Button, Card, Chip, Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, spacing } from '@/src/design-system/tokens';
import { useConnectedFamilies } from '@/src/hooks/use-connected-families';
import { INVITE_RELATIONSHIPS, InviteRelationship } from '@/src/services/planning/invite-links';
import { MySharing } from '@/src/services/planning/connection-invites';
import { plannableFamilies } from '@/src/services/planning/family-visibility';
import { PlanningFamily } from '@/src/services/planning/planner';
import { usePlanningStore } from '@/src/stores/planning-store';
import { FacilityType, FamilyProfile } from '@/src/types';
import { formatClock } from '@/src/utils/clock-format';
import { MOBILITY_LABELS, familyUsesBuggy } from '@/src/utils/family-mobility';
import { householdPeople } from '@/src/utils/household';
import { formatChildAge } from '@/src/utils/profile-defaults';
import { resolveRoutines } from '@/src/utils/routine-schedule';
import { familyDisplayName } from '@/src/utils/family-title';

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

export function YourFamilySection({ profile, onEdit }: { profile: FamilyProfile; onEdit?: () => void }) {
  const people = householdPeople(profile);
  const byId = new Map(profile.members.map((m) => [m.id, m]));
  return (
    <View testID="profile-your-family">
      <View style={styles.titleRow}>
        <Text variant="heading2" style={styles.title}>
          Your family
        </Text>
        {onEdit ? <Button label="Edit" size="sm" style={styles.target} variant="ghost" onPress={onEdit} testID="your-family-edit" /> : null}
      </View>
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

/**
 * YOUR HOUSEHOLD, in a line: who the planner plans for and whether it knows their naps and feeds, with one way in to change
 * any of it. The full detail lives in the Profile; this is what a parent planning with another family needs to glance at.
 */
export function HouseholdSummary({ profile, onEdit }: { profile: FamilyProfile; onEdit: () => void }) {
  const people = householdPeople(profile);
  const byId = new Map(profile.members.map((m) => [m.id, m]));
  const who = people.map((person) => {
    if (person.kind === 'adult') return person.isYou ? 'You' : person.name;
    const member = byId.get(person.id);
    return `${person.name} (${member ? formatChildAge(member) : person.ageLabel})`;
  });
  const routines = resolveRoutines(profile);
  return (
    <Card style={styles.summary} testID="families-household-summary">
      <View style={styles.titleRow}>
        <View style={styles.familyText}>
          <Text variant="heading3">Your household</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            {who.length ? who.join(', ') : 'Nobody added yet'}
          </Text>
          <Text variant="caption" color={colors.text.secondary}>
            {routines.length === 0
              ? 'Naps and feeds not set'
              : `${routines.length} nap${routines.length === 1 ? '' : 's'} and feed${routines.length === 1 ? '' : 's'} set · private unless you share them`}
          </Text>
        </View>
        <Button label="Edit" size="sm" style={styles.target} variant="outline" onPress={onEdit} testID="families-household-edit" />
      </View>
    </Card>
  );
}

const MUST_HAVE_LABELS: Partial<Record<FacilityType, string>> = {
  toilets: 'Toilets',
  baby_changing: 'Baby changing',
  parking: 'Parking',
  blue_badge_parking: 'Blue Badge parking',
  pushchair_friendly: 'Pushchair access',
};

function routineTime(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? formatClock(Number(match[1]) * 60 + Number(match[2])) : time;
}

/**
 * NAPS, FEEDS AND MUST-HAVES: what a day has to work around, as the planner reads it. Private by default: none of it
 * reaches a connected family unless the parent turns sharing on for that connection (and then only the times, never
 * a child's name). The line under the card says so, because that is the question a parent has when they see it here.
 */
export function RoutinesSection({ profile, onEdit }: { profile: FamilyProfile; onEdit?: () => void }) {
  const routines = resolveRoutines(profile);
  const mustHaves = (profile.mustHaveFacilities ?? []).map((f) => MUST_HAVE_LABELS[f] ?? f);
  const buggy = familyUsesBuggy(profile);
  return (
    <View testID="families-routines">
      <View style={styles.titleRow}>
        <Text variant="heading2" style={styles.title}>
          Naps, feeds and must-haves
        </Text>
        {onEdit ? <Button label="Edit" size="sm" style={styles.target} variant="ghost" onPress={onEdit} testID="families-routines-edit" /> : null}
      </View>
      <Card style={styles.card}>
        {routines.length === 0 ? (
          <Row icon="moon-outline" label="Naps and feeds" value="Not set" />
        ) : (
          routines.map((routine) => (
            <Row
              key={routine.id}
              icon={routine.kind === 'nap' ? 'moon-outline' : 'restaurant-outline'}
              label={routine.label?.trim() || (routine.kind === 'nap' ? 'Nap' : 'Feed')}
              value={`${routineTime(routine.time)}${routine.atHome ? ' · at home' : ''}`}
            />
          ))
        )}
        <Row icon="checkmark-done-outline" label="Must-haves" value={mustHaves.length ? mustHaves.join(', ') : 'None set'} />
        <Row icon="walk-outline" label="Getting about" value={buggy ? 'With a pushchair' : 'No pushchair'} />
        <Text variant="caption" color={colors.text.tertiary}>
          Plans are built around these. They stay private: a connected family sees the times only if you choose to share them, and never a name.
        </Text>
      </Card>
    </View>
  );
}

/**
 * `profile` is the section as it sits on the Profile tab (its own heading, the invite tools always open). `screen` is the
 * same section on the Families screen, which has its own heading: the invite tools open when the parent asks to add a
 * family, the groups are named (connected, waiting for a reply, on this phone only), and with nobody connected the screen
 * says what a connection is for and offers "Add a family". Same data, same hook, same invitation flow: nothing here is a
 * second copy of any of it.
 */
export function ConnectedFamiliesSection({
  accountsAvailable,
  variant = 'profile',
  onPlanTogether,
  onEditLocal,
  onMeetHalfway,
  planningWith,
}: {
  accountsAvailable: boolean;
  variant?: 'profile' | 'screen';
  /** "Plan together" on a family's card: the Families screen keeps them selected for the next plan. */
  onPlanTogether?: (family: PlanningFamily) => void;
  /** Edit a family that is only on this phone (ages, area, routines typed in by the parent). */
  onEditLocal?: (family: PlanningFamily) => void;
  /** The family currently chosen with "Plan together", so its card says so. */
  planningWith?: string | null;
  /** "Meet halfway" on a family's card: Together switches to that view with this family chosen. */
  onMeetHalfway?: (familyId: string) => void;
}) {
  const router = useRouter();
  const families = useConnectedFamilies(accountsAvailable);
  // Selected whole and filtered here: a selector that returns a new array every time re-renders without end.
  const storedFamilies = usePlanningStore((s) => s.families);
  // The families on this phone that are not a loaded connection: typed in by the parent (`local`), or a connection's copy that
  // the account cannot confirm right now (`unchecked`: signed out, still loading). The same rule Meet halfway uses, so the two
  // screens can never disagree about who the parent plans with (family-visibility.ts).
  const removeFamily = usePlanningStore((s) => s.removeFamily);
  const [shareRoutines, setShareRoutines] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  // The family on this phone an invitation link was just made for, so the link appears under that family's card.
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  // The "what I share" panel: which connection is open, what the switch says, and the line confirming a change.
  const [sharingOpen, setSharingOpen] = useState<string | null>(null);
  const [shareChoice, setShareChoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const { accepted, pending, loaded, error, busy, invite } = families;
  const onPhone = useMemo(
    () => plannableFamilies({ stored: storedFamilies, accepted, verified: accountsAvailable && loaded }).filter((f) => f.kind !== 'connected'),
    [storedFamilies, accepted, accountsAvailable, loaded],
  );
  const local = useMemo(() => onPhone.filter((f) => f.kind === 'local').map((f) => f.family), [onPhone]);
  const unchecked = useMemo(() => onPhone.filter((f) => f.kind === 'unverified').map((f) => f.family), [onPhone]);
  const onScreen = variant === 'screen';
  // On the Profile the invite tools are always there; on the Families screen they open when asked for.
  const showAdd = !onScreen || addOpen;
  const nobody = loaded && accepted.length === 0 && local.length + unchecked.length === 0 && pending.length === 0;
  // A first visit to Your families: nothing connected, nothing on this phone, nothing waiting. It says what the tab is for and
  // offers the two ways in, side by side (approved Figma page 09, "Together · first visit").
  const firstVisit = onScreen && accepted.length === 0 && local.length + unchecked.length === 0 && pending.length === 0 && (!accountsAvailable || loaded);

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

  const meet = (familyId: string) => (onMeetHalfway ? onMeetHalfway(familyId) : router.push({ pathname: '/together', params: { view: 'halfway', family: familyId } } as never));

  return (
    <View testID="profile-connected-families">
      {onScreen ? null : (
        <Text variant="heading2" style={styles.title}>
          Connected families
        </Text>
      )}
      <Card style={styles.card}>
        {firstVisit ? (
          <View style={styles.firstVisit} testID="families-first-visit">
            <Text variant="heading3">Plan days out with friends</Text>
            <Text color={colors.text.secondary}>Add a family to find places that work for both of you, then make one plan and send it.</Text>
            {accountsAvailable && !addOpen ? (
              <Button label="Invite a family" fullWidth onPress={() => setAddOpen(true)} testID="families-add" />
            ) : null}
            {!adding ? (
              <Button
                label="Add a family by postcode"
                variant={accountsAvailable ? 'outline' : 'primary'}
                fullWidth
                onPress={() => setAdding(true)}
                testID="families-add-postcode"
              />
            ) : null}
            <Text variant="caption" color={colors.text.secondary}>
              {accountsAvailable
                ? 'Inviting needs an account: a family you invite sees only what they agree to share. A family added by postcode stays on this phone only.'
                : 'Inviting needs an account. A family added by postcode stays on this phone only.'}
            </Text>
          </View>
        ) : (
        <Text variant="bodySmall" color={colors.text.secondary}>
          Families you plan with. They see only what they agreed to share: a first name, a rough area, the children’s ages
          and the drive they’re happy with. Never names or an address.
        </Text>
        )}

        {firstVisit ? null : accountsAvailable ? (
          !loaded ? (
            <Text variant="bodySmall" color={colors.text.secondary}>
              Loading…
            </Text>
          ) : accepted.length === 0 ? (
            <Text variant="bodySmall" color={colors.text.secondary} testID="profile-no-connections">
              {onScreen
                ? local.length + unchecked.length > 0
                  ? 'No families are connected yet. The families below are on this phone only: you entered where they set off from, so they can’t see or receive anything. Invite a family to connect with them.'
                  : 'No families connected yet. Connect a family to choose them under Who’s coming and to find a place that works for both of you.'
                : 'Nobody is connected yet.'}
            </Text>
          ) : null
        ) : (
          <Text variant="bodySmall" color={colors.text.secondary}>
            Connecting families needs an account. You can still add a family by postcode below.
          </Text>
        )}

        {onScreen && accepted.length > 0 ? (
          <Text variant="label" testID="families-connected-heading">
            Connected
          </Text>
        ) : null}

        {accepted.map(({ connection, family }) => (
          <View key={connection.id} style={styles.family} testID="connected-family-row">
            <View style={styles.familyHead}>
              <Ionicons name="people-outline" size={20} color={colors.text.secondary} />
              <View style={styles.familyText}>
                <Text variant="heading3">{familyDisplayName(family.label)}</Text>
                <Text variant="caption" color={colors.action} testID="connected-family-status">
                  {planningWith === family.id ? 'Connected · planning together' : 'Connected'}
                </Text>
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
              {onPlanTogether ? (
                <Button label="Plan together" size="sm" style={styles.target} onPress={() => onPlanTogether(family)} testID="family-plan-together" />
              ) : null}
              <Button label="Meet halfway" size="sm" style={styles.target} variant="outline" onPress={() => meet(family.id)} />
              <Button
                label="What I share"
                size="sm" style={styles.target}
                variant="ghost"
                onPress={() => openSharing(connection.id, connection.mySharing)}
                testID="connection-what-i-share"
              />
              {confirm === connection.id ? (
                <>
                  <Button label="Disconnect now" size="sm" style={styles.target} onPress={() => { void families.disconnect(connection.id); setConfirm(null); }} />
                  <Button label="Keep" size="sm" style={styles.target} variant="ghost" onPress={() => setConfirm(null)} />
                </>
              ) : (
                <Button label="Disconnect" size="sm" style={styles.target} variant="ghost" onPress={() => setConfirm(connection.id)} />
              )}
            </View>
            {sharingOpen === connection.id ? (
              <View style={styles.sharePanel} testID="connection-share-panel">
                <Text variant="label">What {familyDisplayName(family.label)} sees about you</Text>
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
                  <Button label={saving ? 'Updating…' : 'Update what I share'} size="sm" style={styles.target} onPress={() => void saveSharing(connection.id, family.label)} testID="connection-update-sharing" />
                  <Button label="Cancel" size="sm" style={styles.target} variant="ghost" onPress={() => setSharingOpen(null)} />
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

        {onScreen && local.length + unchecked.length > 0 ? (
          <Text variant="label" testID="families-local-heading">
            On this phone only
          </Text>
        ) : null}

        {local.map((family) => (
          <View key={family.id} style={styles.family} testID="local-family-row">
            <View style={styles.familyHead}>
              <Ionicons name="pin-outline" size={20} color={colors.text.secondary} />
              <View style={styles.familyText}>
                <Text variant="heading3">{familyDisplayName(family.label)}</Text>
                <Text variant="caption" color={colors.warning[600]} testID="local-family-status">
                  {planningWith === family.id ? 'On this phone only · planning together' : 'On this phone only · not connected'}
                </Text>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  {localSummary(family)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              {onPlanTogether ? (
                <Button label="Plan together" size="sm" style={styles.target} onPress={() => onPlanTogether(family)} testID="family-plan-together" />
              ) : null}
              <Button label="Meet halfway" size="sm" style={styles.target} variant="outline" onPress={() => meet(family.id)} />
              {onEditLocal ? <Button label="Edit" size="sm" style={styles.target} variant="ghost" onPress={() => onEditLocal(family)} testID="local-family-edit" /> : null}
              <Button label="Remove" size="sm" style={styles.target} variant="ghost" onPress={() => removeFamily(family.id)} />
            </View>
            {/* A family only on this phone can be invited to connect: the same single-use link, the same consent (routines are not
                shared unless the person switches that on in the invitation panel, and it is off here). Nothing is sent or shared
                until they accept; this just makes the link. Needs an account, like every other invitation. */}
            {accountsAvailable ? (
              <View style={styles.inviteLocal}>
                <Button
                  label={busy === 'friend' && inviteFor === family.id ? 'Creating…' : 'Invite to connect'}
                  size="sm" style={styles.target}
                  variant="outline"
                  disabled={busy !== null}
                  onPress={() => {
                    setInviteFor(family.id);
                    void families.create('friend', false);
                  }}
                  testID="local-family-invite"
                />
                <Text variant="caption" color={colors.text.secondary}>
                  Until they accept, {familyDisplayName(family.label)} can’t see or receive anything: plans stay on your phone.
                </Text>
                {inviteFor === family.id && invite ? <InviteLinkCard url={invite.url} relationship={invite.relationship} /> : null}
              </View>
            ) : null}
          </View>
        ))}

        {unchecked.map((family) => (
          <View key={family.id} style={styles.family} testID="unchecked-family-row">
            <View style={styles.familyHead}>
              <Ionicons name="cloud-offline-outline" size={20} color={colors.text.secondary} />
              <View style={styles.familyText}>
                <Text variant="heading3">{familyDisplayName(family.label)}</Text>
                <Text variant="caption" color={colors.text.secondary} testID="unchecked-family-status">
                  From a connection · can’t be checked right now
                </Text>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  {localSummary(family)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button label="Meet halfway" size="sm" style={styles.target} variant="outline" onPress={() => meet(family.id)} />
              <Button label="Remove" size="sm" style={styles.target} variant="ghost" onPress={() => removeFamily(family.id)} />
            </View>
          </View>
        ))}

        {onScreen && pending.length > 0 ? (
          <Text variant="label" testID="families-pending-heading">
            Waiting for a reply
          </Text>
        ) : null}

        {pending.map((connection) => {
          const expired = Date.parse(connection.expiresAt) <= Date.now();
          return (
            <View key={connection.id} style={styles.pendingRow}>
              <Text variant="bodySmall" style={styles.familyText}>
                {RELATIONSHIP_LABEL[connection.relationship ?? 'friend']} invitation · {expired ? 'expired' : 'waiting'}
              </Text>
              <Button label={expired ? 'Remove' : 'Cancel'} size="sm" style={styles.target} variant="ghost" onPress={() => void families.cancel(connection.id)} />
            </View>
          );
        })}

        {accountsAvailable && showAdd ? (
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

        {onScreen && !addOpen && !firstVisit ? (
          <Button
            label={nobody || (accepted.length === 0 && local.length + unchecked.length === 0) ? 'Add a family' : 'Add another family'}
            variant={nobody ? 'primary' : 'outline'}
            fullWidth
            onPress={() => setAddOpen(true)}
            testID="families-add"
          />
        ) : null}

        {showAdd || adding ? (
          adding ? (
            <AddFamilyByPostcode onAdded={() => setAdding(false)} onCancel={() => setAdding(false)} />
          ) : firstVisit ? null : (
            <Button label="Add a family by postcode" variant="ghost" size="sm" style={styles.target} onPress={() => setAdding(true)} testID="profile-add-by-postcode" />
          )
        ) : null}

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

/** A family typed in on this phone: what the parent entered, said as what is on record. */
function localSummary(family: PlanningFamily): string {
  const parts = [
    family.area,
    family.ages.length ? `${family.ages.length === 1 ? 'a child' : `${family.ages.length} children`} aged ${family.ages.join(', ')}` : 'no children added',
    family.routines.length ? `${family.routines.length} ${family.routines.length === 1 ? 'routine' : 'routines'}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
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
  // The small button draws 40 to 42pt tall around its text; the action on a family's card is a 44pt target.
  target: { minHeight: MIN_TARGET },
  firstVisit: { gap: spacing.md },
  inviteLocal: { gap: spacing.sm, alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { marginTop: spacing.lg, marginBottom: spacing.lg },
  card: { gap: spacing.md, marginBottom: spacing.md },
  summary: { gap: spacing.sm },
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
