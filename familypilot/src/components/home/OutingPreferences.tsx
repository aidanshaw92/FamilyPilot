import { StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useDayRequestStore } from '@/src/stores/day-request-store';
import { DayRequest, EnvironmentNeed } from '@/src/types/day-request';

/** Explicit choices use the existing deterministic matcher, without an AI call. */
export function OutingPreferences({ request }: { request: DayRequest | null }) {
  const setParsedRequest = useDayRequestStore((s) => s.setParsedRequest);
  const reset = useDayRequestStore((s) => s.reset);
  const source = useDayRequestStore((s) => s.requestSource);
  if (!request) return null;

  const update = (constraints: DayRequest['constraints']) => {
    setParsedRequest({ ...request, constraints, parsedAt: new Date().toISOString() }, 'user');
  };
  const environment = request.constraints.environment?.value ?? 'either';
  const maxMinutes = request.constraints.journey?.value.maxMinutes ?? request.maxDriveMinutes;
  const facilities = [
    ['toilets', 'Toilets'],
    ['babyChanging', 'Baby changing'],
    ['parking', 'Parking'],
  ] as const;

  return (
    <View style={styles.panel}>
      <Text variant="heading2">What does your family need today?</Text>
      <View style={styles.row}>
        {(['either', 'outdoor', 'indoor'] as EnvironmentNeed[]).map((value) => (
          <Chip key={value} label={{ either: 'Any setting', outdoor: 'Outdoors', indoor: 'Indoors' }[value]}
            active={environment === value}
            onPress={() => update({ ...request.constraints, environment: { strength: 'required', value } })} />
        ))}
      </View>
      <Text variant="bodySmall">Maximum drive each way</Text>
      <View style={styles.row}>
        {[...new Set([15, 30, 45, 60, maxMinutes])].sort((a, b) => a - b).map((minutes) => (
          <Chip key={minutes} label={`${minutes} min`} active={maxMinutes === minutes}
            onPress={() => update({ ...request.constraints, journey: { strength: 'required', value: { maxMinutes: minutes } } })} />
        ))}
      </View>
      <Text variant="bodySmall">Must have</Text>
      <View style={styles.row}>
        {facilities.map(([field, label]) => (
          <Chip key={field} label={label} active={request.constraints[field]?.strength === 'required'}
            onPress={() => update({ ...request.constraints, [field]: request.constraints[field]?.strength === 'required'
              ? { strength: 'preferred', value: 'yes' }
              : { strength: 'required', value: 'yes' } })} />
        ))}
      </View>
      <Text variant="bodySmall" color={colors.text.secondary}>
        Must-haves need confirmed details. We leave out places where those details are missing.
      </Text>
      {source === 'user' ? <Button label="Use my family defaults" variant="ghost" onPress={reset} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.borderLight, borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
});
