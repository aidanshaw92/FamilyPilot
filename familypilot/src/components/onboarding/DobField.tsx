import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface DobFieldProps {
  day: string;
  month: string;
  year: string;
  onChange: (next: { day: string; month: string; year: string }) => void;
  /** An error to show; takes the place of the age line. */
  message?: string | null;
  /** "8 months", shown once the date is a real one. */
  ageLabel?: string | null;
  childName?: string;
  /** Quiet guidance shown when there is nothing else to say, e.g. why a legacy child is being asked. */
  hint?: string;
}

const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/**
 * Date of birth as three boxes. A calendar is the wrong tool for a date that is usually a few months
 * or years back (a long scroll to 2017), a numeric keypad is the right one, and three boxes with
 * auto-advance is a handful of taps on every platform without a picker that behaves differently on
 * each. The age it works out is shown straight away, so the parent sees "8 months" and knows the date
 * landed.
 */
export function DobField({ day, month, year, onChange, message, ageLabel, childName, hint }: DobFieldProps) {
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const who = childName?.trim() ? `${childName.trim()}’s` : 'Child’s';

  return (
    <View>
      <Text variant="label" color={colors.text.secondary} style={styles.label}>
        Date of birth
      </Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={`${who} day of birth`}
          value={day}
          onChangeText={(value) => {
            const next = digits(value, 2);
            onChange({ day: next, month, year });
            if (next.length === 2) monthRef.current?.focus();
          }}
          placeholder="DD"
          placeholderTextColor={colors.text.tertiary}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          style={[styles.input, styles.short, message ? styles.error : undefined]}
        />
        <TextInput
          ref={monthRef}
          accessibilityLabel={`${who} month of birth`}
          value={month}
          onChangeText={(value) => {
            const next = digits(value, 2);
            onChange({ day, month: next, year });
            if (next.length === 2) yearRef.current?.focus();
          }}
          placeholder="MM"
          placeholderTextColor={colors.text.tertiary}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          style={[styles.input, styles.short, message ? styles.error : undefined]}
        />
        <TextInput
          ref={yearRef}
          accessibilityLabel={`${who} year of birth`}
          value={year}
          onChangeText={(value) => onChange({ day, month, year: digits(value, 4) })}
          placeholder="YYYY"
          placeholderTextColor={colors.text.tertiary}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          style={[styles.input, styles.long, message ? styles.error : undefined]}
        />
      </View>
      {message ? (
        <Text variant="caption" color={colors.error[500]} style={styles.note} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : ageLabel ? (
        <Text variant="caption" color={colors.text.secondary} style={styles.note} accessibilityLiveRegion="polite">
          {childName?.trim() ? `${childName.trim()} is ${ageLabel}` : ageLabel}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.text.secondary} style={styles.note}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
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
    textAlign: 'center',
  },
  // flexBasis 0 and minWidth 0: a web <input> otherwise holds its default width (about 20 characters) and the
  // three boxes overflow the card instead of sharing it.
  short: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  long: { flexGrow: 1.6, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  error: { borderColor: colors.error[500] },
  note: { marginTop: spacing.xs },
});
