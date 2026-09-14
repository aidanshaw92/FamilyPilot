import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { PlanningConnection, listAcceptedConnections } from '@/src/services/planning/connections';
import { createPlanInvite, listPlanInvites, PlanInvite } from '@/src/services/planning/plan-invites';
import { PlanMatch } from '@/src/services/planning/planner';
import { supabase } from '@/src/services/supabase/client';

interface PlanInviteSheetProps {
  visible: boolean;
  onClose: () => void;
  plan: PlanMatch | null;
  date: string;
  onMessage: (message: string) => void;
}

/**
 * Invites a connected family to this specific day. Sits on the existing plan_invites
 * integration, so pending/accepted state is the real one the other family responds to.
 */
export function PlanInviteSheet({ visible, onClose, plan, date, onMessage }: PlanInviteSheetProps) {
  const [connections, setConnections] = useState<PlanningConnection[]>([]);
  const [invites, setInvites] = useState<PlanInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const planId = plan ? `${date}-${plan.venueId}` : null;

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    setSignedIn(Boolean(data.session));
    if (!data.session) return;
    setBusy(true);
    try {
      const [conns, invs] = await Promise.all([listAcceptedConnections(), listPlanInvites()]);
      setConnections(conns);
      setInvites(invs);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not load your families.');
    } finally {
      setBusy(false);
    }
  }, [onMessage]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const sent = invites.filter((invite) => invite.direction === 'sent' && invite.planId === planId);

  const invite = async (connectionId: string) => {
    if (!plan || !planId) return;
    setBusy(true);
    try {
      await createPlanInvite(connectionId, { id: planId, date, plan });
      onMessage('Invite sent. They will see it as pending until they respond.');
      await load();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not send that invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Invite a family">
      {!supabase ? (
        <Text variant="body" color={colors.text.secondary}>
          Sharing plans with other families needs an account, which is not enabled in this build.
          You can still share a summary from the button below.
        </Text>
      ) : !signedIn ? (
        <Text variant="body" color={colors.text.secondary}>
          Sign in under Families to connect with another family, then invite them to this day.
        </Text>
      ) : connections.length === 0 ? (
        <Text variant="body" color={colors.text.secondary}>
          You have not connected with another family yet. Swap a connection code under Families
          first, then invite them here.
        </Text>
      ) : (
        <>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.intro}>
            They will see where, when and the timings for this day, and can accept or decline.
          </Text>
          <View style={styles.chips}>
            {connections.map((connection) => {
              const existing = sent.find((row) => row.connectionId === connection.id);
              return (
                <Chip
                  key={connection.id}
                  label={
                    existing
                      ? `${connection.family?.label ?? 'Family'} · ${existing.status}`
                      : (connection.family?.label ?? 'Family')
                  }
                  active={Boolean(existing)}
                  onPress={() => (existing ? undefined : void invite(connection.id))}
                />
              );
            })}
          </View>
        </>
      )}

      {busy ? (
        <Text variant="caption" color={colors.text.tertiary} style={styles.busy}>
          Working…
        </Text>
      ) : null}

      <Button label="Done" variant="outline" fullWidth onPress={onClose} style={styles.done} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  busy: {
    marginTop: spacing.md,
  },
  done: {
    marginTop: spacing.xl,
    borderRadius: radius.full,
  },
});
