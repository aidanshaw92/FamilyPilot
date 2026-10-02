import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { CreatePlanStep, CreatePlanStepId } from '@/src/services/planning/create-plan';

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
}

export function GeneratingPlan({ venueName, steps, done, current }: GeneratingPlanProps) {
  return (
    <View style={styles.container} testID="generating-plan">
      <Text variant="caption" color={colors.text.secondary} style={styles.eyebrow}>
        BUILDING YOUR DAY
      </Text>
      <Text variant="heading1" style={styles.title}>
        A day around {venueName}
      </Text>

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
              <View
                style={[
                  styles.marker,
                  complete && styles.markerDone,
                  active && styles.markerActive,
                ]}
              >
                {complete ? (
                  <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                ) : null}
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
  eyebrow: { letterSpacing: 0.8 },
  title: { marginBottom: spacing.xl },
  steps: { gap: spacing.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  marker: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerActive: { borderColor: colors.primary[500] },
  markerDone: { borderColor: colors.primary[500], backgroundColor: colors.primary[500] },
  stepLabel: { flex: 1 },
});
