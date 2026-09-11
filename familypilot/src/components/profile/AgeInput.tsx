import { StyleSheet, TextInput, View } from 'react-native';

import { Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

export type AgeUnit = 'years' | 'months';

interface AgeInputProps {
  value: string;
  unit: AgeUnit;
  onChangeValue: (value: string) => void;
  onChangeUnit: (unit: AgeUnit) => void;
  error?: string;
}

/** Age entry with a Years/Months toggle, so a baby under 1 can be given a precise age
 * ("8 months") instead of the only other option being the much cruder "0 years old". */
export function AgeInput({ value, unit, onChangeValue, onChangeUnit, error }: AgeInputProps) {
  const max = unit === 'months' ? 11 : 17;

  return (
    <View style={styles.wrapper}>
      <Text variant="label" color={colors.text.secondary} style={styles.label}>
        Age
      </Text>
      <View style={styles.unitRow}>
        <Chip
          label="Years"
          active={unit === 'years'}
          onPress={() => {
            onChangeUnit('years');
            onChangeValue('');
          }}
        />
        <Chip
          label="Months (under 1)"
          active={unit === 'months'}
          onPress={() => {
            onChangeUnit('months');
            onChangeValue('');
          }}
        />
      </View>
      <TextInput
        value={value}
        onChangeText={(text) => {
          const digits = text.replace(/[^0-9]/g, '');
          if (digits === '') {
            onChangeValue('');
            return;
          }
          // Clamp while typing rather than only on submit - faster to correct, and the field
          // never needs a "years should be 0-17" style error for an out-of-range value.
          onChangeValue(String(Math.min(Number(digits), max)));
        }}
        placeholder={unit === 'months' ? 'e.g. 8' : 'e.g. 4'}
        placeholderTextColor={colors.text.tertiary}
        keyboardType="number-pad"
        style={[styles.input, error ? styles.inputError : undefined]}
      />
      {error ? (
        <Text variant="caption" color={colors.error[500]} style={styles.hint}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
  },
  unitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text.primary,
    minHeight: 48,
  },
  inputError: {
    borderColor: colors.error[500],
  },
  hint: {
    marginTop: spacing.xs,
  },
});
