import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/src/components/navigation/PageHeader';
import { LegacyPlans } from '@/src/components/planning/LegacyPlans';
import { PostVisitInbox } from '@/src/components/planning/VisitFeedback';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { usePlanInvites } from '@/src/hooks/use-plan-invites';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { PlanInvite } from '@/src/services/planning/plan-invites';
import { PlanViewModel, toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { describeSent, isSharedDayEnvelope, reframeForRecipient } from '@/src/services/planning/shared-day';
import { useFamilyStore } from '@/src/stores/family-store';
import { SavedDay, localDate, usePlanningStore } from '@/src/stores/planning-store';
import { useSavedStore } from '@/src/stores/saved-store';
import { familyDisplayName } from '@/src/utils/family-title';
import { familyUsesBuggy } from '@/src/utils/family-mobility';
import { householdTitle } from '@/src/utils/household';

type Tone = 'waiting' | 'accepted' | 'declined';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  waiting: { bg: colors.warning[50], fg: colors.warning[600] },
  accepted: { bg: colors.secondary[50], fg: colors.secondary[600] },
  declined: { bg: colors.fill, fg: colors.text.secondary },
};

/**
 * PLANS: every day this family has made, been sent or accepted, in one list, with where each one stands.
 *
 * Invitations waiting for an answer come first (they are the only thing here that is waiting on the parent), then what is
 * coming up, then what has been. A plan you made that you sent to another family says so ("Kevin’s family accepted"); a plan
 * you accepted says who it is from. Older plans saved by a previous version are kept below, and saved places are one tap
 * away. It starts a plan from the one place a plan starts, a place that suits the family.
 */
export default function TripsScreen() {
  const router = useRouter();
  const tabBarClearance = useTabBarClearance();
  const hydrated = usePlanningStore((s) => s.hydrated);
  const savedDays = usePlanningStore((s) => s.savedDays);
  const legacy = usePlanningStore((s) => s.saved);
  const families = usePlanningStore((s) => s.families);
  const profile = useFamilyStore((s) => s.profile);
  const savedPlaces = useSavedStore((s) => s.items.length);
  const invites = usePlanInvites(true);

  // "See all your plans", from a plan just saved, lands here with its id: the row is marked so the parent sees where it went.
  const params = useLocalSearchParams();
  const justSavedParam = typeof params.justSaved === 'string' ? params.justSaved : null;
  const [justSaved, setJustSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!justSavedParam) return;
    setJustSaved(justSavedParam);
    router.setParams({ justSaved: undefined } as never);
  }, [justSavedParam, router]);

  // "mine" is seeded from the profile once when first created, but a parent's home, pushchair or children's ages are facts,
  // not a planning-session choice: keep them in sync so they cannot drift from the profile, the one source of truth. Label,
  // budget, max drive, required facilities and routines stay untouched: a parent may legitimately set those per day.
  useEffect(() => {
    if (!hydrated) return;
    const mine = usePlanningStore.getState().families.find((f) => f.id === 'mine');
    if (!mine) return;
    const home = resolveHomeCoordinates(profile);
    const ages = profile.members.filter((m) => m.role === 'child').map((m) => m.age);
    const pushchair = familyUsesBuggy(profile);
    const agesChanged = JSON.stringify(ages) !== JSON.stringify(mine.ages);
    if (mine.area !== profile.homeLocation || mine.latitude !== home.latitude || mine.longitude !== home.longitude || mine.pushchair !== pushchair || agesChanged) {
      usePlanningStore.getState().setFamily({ ...mine, area: profile.homeLocation, latitude: home.latitude, longitude: home.longitude, pushchair, ages });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, profile.homeLocation, profile.homeLatitude, profile.homeLongitude, profile.pushchair, profile.members]);

  const resolver = useMemo(() => makeSubjectResolver(profile, families), [profile, families]);
  const title = householdTitle(profile);
  const viewOf = (day: SavedDay): PlanViewModel => toPlanViewModel(day.source, { resolveSubject: resolver, householdTitle: title });

  const today = localDate();
  const dated = useMemo(() => savedDays.map((day) => ({ day, date: day.source.itinerary.date, start: day.source.itinerary.stops[0]?.arrive ?? 0 })), [savedDays]);
  const upcoming = dated.filter((d) => d.date >= today).sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1));
  const past = dated.filter((d) => d.date < today).sort((a, b) => (a.date === b.date ? b.start - a.start : a.date < b.date ? 1 : -1));

  const pending = invites.received.filter((i) => i.status === 'pending');
  const pendingDays = pending.filter((i) => isSharedDayEnvelope(i.plan));
  // Invitations sent in the older form: still answered (and, once accepted, added to the saved plans) where they always were.
  const legacyInvites = invites.received.filter((i) => !isSharedDayEnvelope(i.plan) && (i.status === 'pending' || (i.status === 'accepted' && !legacy.some((p) => p.id === i.planId))));
  const sentFor = (day: SavedDay) => invites.sent.filter((i) => i.planId === day.id);
  const empty = savedDays.length === 0 && pending.length === 0 && legacy.length === 0 && legacyInvites.length === 0;

  const row = (entry: { day: SavedDay }, index: number, list: unknown[]) => {
    const { day } = entry;
    const view = viewOf(day);
    const fresh = day.id === justSaved;
    const status = day.shared
      ? { text: `From ${familyDisplayName(day.shared.fromLabel)} · you’re going`, tone: 'accepted' as Tone }
      : describeSent(sentFor(day));
    return (
      <Pressable
        key={day.id}
        onPress={() => router.push({ pathname: '/saved-plan', params: { id: day.id } } as never)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${view.title}${status ? `, ${status.text}` : ''}${fresh ? ', just saved' : ''}`}
        testID={fresh ? 'plans-just-saved' : undefined}
        style={[styles.row, index > 0 && list.length > 1 && styles.rowDivider, fresh && styles.rowFresh]}
      >
        {fresh ? <Text variant="caption" color={colors.action}>✓ Just saved</Text> : null}
        <View style={styles.rowMain}>
          <View style={styles.rowText}>
            <Text variant="heading3">{view.title}</Text>
            <Text variant="bodySmall" color={colors.text.secondary}>{view.dateSummary}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
        </View>
        {status ? <StatusTag text={status.text} tone={status.tone} testID={`plans-status-${day.id}`} /> : null}
      </Pressable>
    );
  };

  const invitation = (invite: PlanInvite) => {
    if (!isSharedDayEnvelope(invite.plan)) return null;
    const source = reframeForRecipient(invite.plan.day, { connectionId: invite.connectionId, senderLabel: invite.otherLabel });
    const view = toPlanViewModel(source, { resolveSubject: resolver, householdTitle: title });
    const busy = invites.busy === invite.id;
    return (
      <Card key={invite.id} style={styles.invite} testID="plans-invitation">
        <Pressable
          onPress={() => router.push({ pathname: '/shared-plan', params: { invite: invite.id } } as never)}
          accessibilityRole="button"
          accessibilityLabel={`Open the invitation from ${familyDisplayName(invite.otherLabel)}: ${view.title}`}
          style={styles.rowMain}
        >
          <View style={styles.rowText}>
            <Text variant="caption" color={colors.warning[600]}>{`${familyDisplayName(invite.otherLabel)} invited you`}</Text>
            <Text variant="heading3">{view.title}</Text>
            <Text variant="bodySmall" color={colors.text.secondary}>{view.dateSummary}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
        </Pressable>
        <View style={styles.inviteActions}>
          <Button label="Accept" size="sm" disabled={busy} onPress={() => void invites.respond(invite, 'accepted')} testID="plans-invitation-accept" />
          <Button label="Decline" size="sm" variant="ghost" disabled={busy} onPress={() => void invites.respond(invite, 'declined')} testID="plans-invitation-decline" />
        </View>
      </Card>
    );
  };

  if (!hydrated) {
    return (
      <ScreenContainer>
        <Text>Loading your plans…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]} keyboardShouldPersistTaps="handled">
        <PostVisitInbox />
        <PageHeader title="Plans" subtitle="Days that work for everyone involved." flush testID="plans-header" />

        {invites.error ? (
          <Text variant="caption" accessibilityRole="alert" color={colors.warning[600]} testID="plans-invites-error">{invites.error}</Text>
        ) : null}

        {pendingDays.length > 0 ? (
          <View style={styles.section} testID="plans-invitations">
            <Text variant="heading2">Invitations</Text>
            {pendingDays.map(invitation)}
          </View>
        ) : null}

        {empty ? (
          <Card style={styles.panel} testID="plans-start">
            <Text variant="heading2">No plans yet</Text>
            <Text color={colors.text.secondary}>Pick somewhere that suits your family and a plan takes two taps.</Text>
            <View style={styles.actions}>
              <Button label="Best for us today" onPress={() => router.push('/(tabs)' as never)} testID="plans-go-home" />
              <Button label="Explore London" variant="outline" onPress={() => router.push('/(tabs)/explore' as never)} testID="plans-go-explore" />
            </View>
          </Card>
        ) : null}

        {upcoming.length > 0 || past.length > 0 ? (
          <View style={styles.section} testID="plans-saved-days">
            {upcoming.length > 0 ? (
              <Card style={styles.panel}>
                <Text variant="heading2">Coming up</Text>
                {upcoming.map((entry, i) => row(entry, i, upcoming))}
              </Card>
            ) : null}
            {past.length > 0 ? (
              <Card style={styles.panel}>
                <Text variant="heading2" color={colors.text.secondary}>Past</Text>
                {past.map((entry, i) => row(entry, i, past))}
              </Card>
            ) : null}
          </View>
        ) : null}

        {!empty ? (
          <View style={styles.actions}>
            <Button label="Plan another day" variant="outline" onPress={() => router.push('/(tabs)' as never)} testID="plans-go-home" />
          </View>
        ) : null}

        {legacy.length > 0 || legacyInvites.length > 0 ? (
          <LegacyPlans
            plans={legacy}
            pendingInvites={legacyInvites}
            sent={invites.sent}
            busy={invites.busy}
            onRespond={(invite, status) => invites.respond(invite, status)}
            onChanged={() => invites.refresh()}
            available={invites.available}
          />
        ) : null}

        {/* Saved places live here: the places a family keeps are part of what they plan from. */}
        <Pressable
          onPress={() => router.push('/saved' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Saved places, ${savedPlaces} ${savedPlaces === 1 ? 'place' : 'places'}`}
          testID="plans-saved-places"
        >
          <Card style={styles.panel}>
            <Text variant="heading2">Saved places</Text>
            <Text color={colors.text.secondary}>
              {savedPlaces ? `${savedPlaces} ${savedPlaces === 1 ? 'place' : 'places'} your family wants to remember.` : 'Places you save with the heart appear here.'}
            </Text>
            <Text variant="link">Open saved places →</Text>
          </Card>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function StatusTag({ text, tone, testID }: { text: string; tone: Tone; testID?: string }) {
  const t = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]} testID={testID}>
      <Text variant="caption" color={t.fg}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm, gap: spacing.md },
  section: { gap: spacing.md },
  panel: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { minHeight: 56, gap: spacing.xs, paddingVertical: spacing.sm },
  rowDivider: { borderTopWidth: 1, borderColor: colors.border },
  rowFresh: { backgroundColor: colors.actionSoft, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  tag: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  invite: { gap: spacing.sm },
  inviteActions: { flexDirection: 'row', gap: spacing.sm },
});
