import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { CreatePlanStep, CreatePlanStepId } from '@/src/services/planning/create-plan';

import { ProfileReceipt } from './ProfileReceipt';

/**
 * What a parent sees while the day is being worked out.
 *
 * Every line names a piece of real work -- "Finding lunch within a 5-minute walk" -- and ticks when
 * that work is done, because the steps come from the orchestrator as it passes each one rather than
 * from a timer. Nothing here says "Thinking…", claims to be an assistant, or animates for its own
 * sake: a parent waiting four seconds wants to know what is happening to their day.
 */

export interface GeneratingPlanProps {
  venueName: string;
  steps: CreatePlanStep[];
  /** Steps already finished, in the order they completed. */
  done: CreatePlanStepId[];
  /** The step being worked on now, if any. */
  current?: CreatePlanStepId;
  /** Frame 04b keeps the profile receipt under the progress list. Null hides it. */
  receipt?: string | null;
  /** True when drawn inside the sheet frame 04b shows; the title then matches the sheet's. */
  inSheet?: boolean;
}

/**
 * Frame 04b (node 76:71): the same sheet as Create a plan, its title unchanged, and a four-line list
 * where a finished step is a tick, the current one a filled dot and the rest an empty ring.
 */
export function GeneratingPlan({ venueName, steps, done, current, receipt = null, inSheet = false }: GeneratingPlanProps) {
  return (
    <View style={[styles.container, inSheet && styles.inSheet]} testID="generating-plan">
      {inSheet ? (
        <View style={styles.header}>
          <Text variant="heading2">Plan your day</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Around {venueName}
          </Text>
        </View>
      ) : (
        <>
          <Text variant="eyebrow">BUILDING YOUR DAY</Text>
          <Text variant="heading1" style={styles.title}>
            A day around {venueName}
          </Text>
        </>
      )}

      <View
        style={styles.steps}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: steps.length, now: done.length }}
      >
        {steps.map((step) => {
          const complete = done.includes(step.id);
          const active = !complete && step.id === current;
          return (
            <View key={step.id} style={styles.step}>
              {/* Nodes 76:140, 76:146, 76:148: tick, filled dot, empty ring. */}
              <View style={styles.markerBox}>
                {complete ? (
                  <Ionicons name="checkmark" size={16} color={colors.ink} />
                ) : active ? (
                  <View style={styles.dot} />
                ) : (
                  <View style={styles.ring} />
                )}
              </View>
              <Text
                variant="body"
                color={complete || active ? colors.text.primary : colors.text.tertiary}
                style={styles.stepLabel}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
      {receipt ? <ProfileReceipt text={receipt} style={styles.receipt} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // Not `flex: 0`: on web that becomes a zero flex-basis and the box measures 0 tall with its
  // children overflowing, which Playwright (and a screen reader's bounds) reads as "not visible".
  inSheet: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', justifyContent: 'flex-start', paddingHorizontal: 0 },
  header: { gap: 2, marginBottom: spacing['3xl'] },
  title: { marginBottom: spacing.xl },
  steps: { gap: spacing.xl },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  markerBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: radius.full, backgroundColor: colors.action },
  ring: { width: 11, height: 11, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border },
  stepLabel: { flex: 1 },
  receipt: { marginTop: spacing['3xl'] },
});
