import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { PlanningConnection, listAcceptedConnections } from '@/src/services/planning/connections';
import { PlanInvite, cancelPlanInvite, createPlanInvite } from '@/src/services/planning/plan-invites';
import { clockLabel, sharePlanText } from '@/src/services/planning/planner';
import { SavedPlan, usePlanningStore } from '@/src/stores/planning-store';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * Plans saved by an earlier version of FamilyPilot (a single place, no itinerary), and invitations sent in that older form.
 *
 * Nothing here is new: it is what the "Saved plans" view of Plans used to hold, kept so nobody loses a plan they saved or an
 * invitation they were sent. New plans are saved, sent and answered through the main Plans list.
 */
export function LegacyPlans({
  plans,
  pendingInvites,
  sent,
  busy,
  onRespond,
  onChanged,
  available,
}: {
  plans: SavedPlan[];
  pendingInvites: PlanInvite[];
  sent: PlanInvite[];
  busy: string | null;
  onRespond: (invite: PlanInvite, status: 'accepted' | 'declined') => Promise<string | null>;
  onChanged: () => Promise<void>;
  available: boolean;
}) {
  const state = usePlanningStore();
  const [connections, setConnections] = useState<PlanningConnection[]>([]);
  const [message, setMessage] = useState('');
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!available || plans.length === 0) return;
    listAcceptedConnections().then(setConnections).catch(() => setConnections([]));
  }, [available, plans.length]);

  const share = async (text: string) => {
    try {
      await Share.share({ message: text });
    } catch {
      setMessage('Sharing is unavailable on this device.');
    }
  };
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setWorking(true);
    setMessage('');
    try {
      await action();
      await onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : fallback);
    } finally {
      setWorking(false);
    }
  };
  const timings = (plan: SavedPlan['plan']) =>
    (Array.isArray(plan.timings) ? plan.timings : []).map((t) => (
      <Text key={t.familyId} variant="bodySmall">
        {`${t.familyId === 'mine' ? t.label : familyDisplayName(t.label)}: leave ${clockLabel(t.depart)}, home about ${clockLabel(t.home)}`}
      </Text>
    ));

  return (
    <View style={styles.section} testID="plans-earlier">
      <Text variant="heading2">Earlier plans</Text>
      <Text variant="bodySmall" color={colors.text.secondary}>Saved by an earlier version of FamilyPilot.</Text>
      {message ? <Text accessibilityRole="alert" color={colors.warning[600]}>{message}</Text> : null}

      {pendingInvites.map((invite) => (
        <Card key={invite.id} style={styles.card}>
          <Text variant="heading3">{invite.plan.name}</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>{`From ${invite.otherLabel} · ${invite.planDate} · ${clockLabel(invite.plan.start)}–${clockLabel(invite.plan.end)}`}</Text>
          {timings(invite.plan)}
          {invite.status === 'pending' ? (
            <View style={styles.row}>
              <Button label="Accept" size="sm" disabled={busy === invite.id} onPress={() => void onRespond(invite, 'accepted').then((problem) => problem && setMessage(problem))} />
              <Button label="Decline" size="sm" variant="ghost" disabled={busy === invite.id} onPress={() => void onRespond(invite, 'declined')} />
            </View>
          ) : (
            <Button
              label="Add to my saved plans"
              size="sm"
              variant="outline"
              onPress={() => {
                state.savePlan({ id: invite.planId, date: invite.planDate, plan: invite.plan, checked: [], createdAt: new Date().toISOString() });
                setMessage(`Added "${invite.plan.name}" to your saved plans.`);
              }}
            />
          )}
        </Card>
      ))}

      {plans.map((saved) => {
        const mine = sent.filter((i) => i.planId === saved.id);
        return (
          <Card key={saved.id} style={styles.card}>
            <Text variant="heading3">{saved.plan.name}</Text>
            <Text>{`${saved.date} · ${clockLabel(saved.plan.start)}–${clockLabel(saved.plan.end)}`}</Text>
            {timings(saved.plan)}
            <Text variant="bodySmall">Saved timings are a snapshot. Recheck before leaving if routines, weather or travel change.</Text>
            <View style={styles.row}>
              {['Check opening hours and booking', 'Check travel time', 'Pack feeds and snacks', 'Nappies, wipes and spare clothes', 'Buggy and weather layers'].map((item) => (
                <Chip key={item} label={`${saved.checked.includes(item) ? '✓ ' : ''}${item}`} active={saved.checked.includes(item)} onPress={() => state.togglePacked(saved.id, item)} />
              ))}
            </View>
            {mine.map((invite) => (
              <View key={invite.id} style={styles.sent}>
                <Text variant="bodySmall" style={{ flex: 1 }}>{`${invite.otherLabel} · ${invite.status === 'pending' ? 'waiting for a reply' : invite.status}`}</Text>
                {invite.status === 'pending' ? <Button label="Cancel" size="sm" variant="ghost" onPress={() => void run(() => cancelPlanInvite(invite.id), 'Could not cancel invite.')} /> : null}
              </View>
            ))}
            {connections.length > 0 ? (
              targetPlanId === saved.id ? (
                <>
                  <Text variant="bodySmall" color={colors.text.secondary}>Choose a connected family to invite:</Text>
                  <View style={styles.row}>
                    {connections
                      .filter((c) => !mine.some((i) => i.status !== 'declined' && i.connectionId === c.id))
                      .map((c) => (
                        <Chip key={c.id} label={familyDisplayName(c.family?.label)} onPress={() => void run(async () => { await createPlanInvite(c.id, { id: saved.id, date: saved.date, plan: saved.plan }); setTargetPlanId(null); }, 'Could not send invite.')} />
                      ))}
                  </View>
                  <Button label="Cancel" variant="ghost" size="sm" onPress={() => setTargetPlanId(null)} />
                </>
              ) : (
                <Button label="Invite a family to this plan" variant="outline" disabled={working} onPress={() => setTargetPlanId(saved.id)} />
              )
            ) : null}
            <View style={styles.row}>
              <Button label="Share plan" onPress={() => void share(sharePlanText(saved.plan, saved.date))} />
              <Button label="Delete saved plan" variant="ghost" onPress={() => state.deletePlan(saved.id)} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md },
});
