import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { contextApiClient } from '@/src/services/context/context-api-client';
import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { Journey, PlanMatch, PlanningFamily, clockLabel, planVenue } from '@/src/services/planning/planner';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { MatchableVenueFacts } from '@/src/types/day-request';

interface CheckTodaySectionProps {
  facts: MatchableVenueFacts;
  latitude: number;
  longitude: number;
}

type CheckState =
  | { status: 'idle' }
  | { status: 'no_families' }
  | { status: 'loading' }
  | { status: 'fits'; plan: PlanMatch }
  | { status: 'no_fit' }
  | { status: 'error'; message: string };

async function journeyFor(
  family: PlanningFamily,
  placeId: string,
  latitude: number,
  longitude: number,
): Promise<Journey> {
  try {
    const result = await contextApiClient.getDriveTimes(
      { latitude: family.latitude, longitude: family.longitude },
      [{ placeId, latitude, longitude }],
    );
    const match = result.journeys.find((j) => j.placeId === placeId);
    if (match) return { outbound: match.driveMinutes, inbound: match.driveMinutes, source: match.source };
  } catch {
    // Fall through to the estimate below - a routine check should never hard-fail on a
    // transient journey-API error, just be honest that the timing is estimated.
  }
  const estimate = estimateDriveMinutes(family.latitude, family.longitude, latitude, longitude);
  return { outbound: estimate, inbound: estimate, source: 'estimated' };
}

/**
 * Checks whether leaving right now fits every family's home routines (set up under Plans ->
 * Families & routines) alongside this venue's confirmed age range and required facilities.
 * Fails closed like the rest of the trust model: an unconfirmed fact never counts as a fit.
 */
export function CheckTodaySection({ facts, latitude, longitude }: CheckTodaySectionProps) {
  const router = useRouter();
  const families = usePlanningStore((s) => s.families);
  const hydrated = usePlanningStore((s) => s.hydrated);
  const [state, setState] = useState<CheckState>({ status: 'idle' });

  const visible = isPilotFeatureVisible('trips_tab');

  useEffect(() => {
    if (!visible || !hydrated) {
      setState({ status: 'idle' });
      return;
    }
    if (!families.length) {
      setState({ status: 'no_families' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const journeys: Record<string, Journey> = {};
        await Promise.all(
          families.map(async (family) => {
            journeys[family.id] = await journeyFor(family, facts.placeId, latitude, longitude);
          }),
        );
        if (cancelled) return;
        const now = new Date();
        const plan = planVenue(
          facts,
          families,
          journeys,
          {
            date: localDate(),
            leaveAt: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            visitMinutes: 90,
            bufferMinutes: 15,
            environment: 'either',
            returnBy: '',
          },
          now,
        );
        setState(plan ? { status: 'fits', plan } : { status: 'no_fit' });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : "Could not check today's routines.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // families/facts are read fresh each render; re-run only when the identity of what we're
    // checking against changes, not on every store notification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hydrated, families.length, facts.placeId, latitude, longitude]);

  if (state.status === 'idle') return null;

  return (
    <View style={styles.section}>
      <Text variant="heading3" style={styles.title}>
        Will this work today?
      </Text>

      {state.status === 'no_families' ? (
        <View style={styles.card}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary[500]} />
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.text}>
            Add your family's nap and feed routine in Plans to check whether a visit fits around
            it right now.
          </Text>
        </View>
      ) : null}

      {state.status === 'loading' ? (
        <View style={styles.card}>
          <Ionicons name="time-outline" size={20} color={colors.primary[500]} />
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.text}>
            Checking against your family's routines…
          </Text>
        </View>
      ) : null}

      {state.status === 'fits' ? (
        <View style={styles.card}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.secondary[600]} />
          <View style={styles.textBlock}>
            <Text variant="body">
              Leave now, home by about{' '}
              {clockLabel(Math.max(...state.plan.timings.map((t) => t.home)))}
            </Text>
            {[...new Set(state.plan.timings.flatMap((t) => t.notes))].map((note) => (
              <Text key={note} variant="caption" color={colors.text.secondary}>
                {note}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {state.status === 'no_fit' ? (
        <View style={[styles.card, styles.cardMuted]}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.warning[600]} />
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.text}>
            Leaving right now doesn't fit everyone's routine, the confirmed age range, or your
            required facilities. Try a different time in Plans.
          </Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={[styles.card, styles.cardMuted]}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.warning[600]} />
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.text}>
            {state.message}
          </Text>
        </View>
      ) : null}

      <Button
        label={state.status === 'no_families' ? 'Set up routines in Plans' : 'Check a different time in Plans'}
        variant="outline"
        style={styles.button}
        onPress={() => router.push('/(tabs)/trips' as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing['2xl'],
  },
  title: {
    marginBottom: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.secondary[50],
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.secondary[100],
  },
  cardMuted: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[100],
  },
  textBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  text: {
    flex: 1,
    lineHeight: 20,
  },
  button: {
    marginTop: spacing.md,
  },
});
