import { Ionicons } from '@expo/vector-icons';
import { createElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { formatDateLabel, formatTimeLabel } from '@/src/utils/date-time-labels';

import { Field } from './Field';
import { Text } from './Text';

/**
 * Date and time fields that look like the rest of the form and read the same on every phone.
 *
 * The web build is the pilot's real surface, and a native `<input type="date">` is still the lowest
 * friction way to pick a day on a phone -- it opens the platform's own picker. But its visible text
 * is the browser's: a system serif, a US-ordered date, "09:00 AM" against a planner that says
 * "10:00–14:21". So the native input is kept for the interaction and hidden from view: it sits
 * transparent over a field we draw, and the field shows the value in the app's own words.
 * Native (iOS/Android) keeps the plain text field until a real native picker is wired up there.
 */
type Kind = 'date' | 'time';

const ICON: Record<Kind, keyof typeof Ionicons.glyphMap> = { date: 'calendar-outline', time: 'time-outline' };

function WebPickerField({
  kind,
  label,
  value,
  onChange,
  display,
  placeholder,
  a11yLabel,
}: {
  kind: Kind;
  label: string;
  value: string;
  onChange: (s: string) => void;
  display: string | null;
  placeholder: string;
  a11yLabel?: string;
}) {
  const accessibleLabel = label || a11yLabel || (kind === 'date' ? 'Date' : 'Time');
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="bodySmall" color={colors.text.secondary}>
          {label}
        </Text>
      ) : null}
      <View style={styles.field}>
        <Text
          variant="body"
          color={display ? colors.ink : colors.text.tertiary}
          numberOfLines={1}
          style={styles.value}
          importantForAccessibility="no"
        >
          {display ?? placeholder}
        </Text>
        <Ionicons name={ICON[kind]} size={20} color={colors.text.secondary} />
        {createElement('input', {
          type: kind,
          value,
          'aria-label': accessibleLabel,
          style: OVERLAY_INPUT,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          // Desktop browsers open the picker only from the small indicator; a tap anywhere on the
          // field should do it. `showPicker` needs a user gesture, which a click is.
          onClick: (e: { currentTarget: { showPicker?: () => void } }) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Not every browser allows it; the input still focuses and still takes typed input.
            }
          },
        })}
      </View>
    </View>
  );
}

/** Covers the drawn field completely and invisibly: the taps land on the real input. */
const OVERLAY_INPUT = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  fontSize: 16, // iOS Safari zooms the page on focus of anything smaller
  border: 'none',
  padding: 0,
  margin: 0,
} as const;

export function DateField({ label, value, onChange, a11yLabel }: { label: string; value: string; onChange: (s: string) => void; a11yLabel?: string }) {
  if (Platform.OS === 'web') {
    return (
      <WebPickerField
        kind="date"
        label={label}
        value={value}
        onChange={onChange}
        display={formatDateLabel(value)}
        placeholder="Choose a date"
        a11yLabel={a11yLabel}
      />
    );
  }
  return <Field label={label} value={value} onChange={onChange} placeholder="YYYY-MM-DD" />;
}

export function TimeField({
  label,
  value,
  onChange,
  optional = false,
  a11yLabel,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  optional?: boolean;
  /** What a screen reader calls the field when the visible label is drawn elsewhere ("Arrival time"). */
  a11yLabel?: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <WebPickerField
        kind="time"
        label={label}
        value={value}
        onChange={onChange}
        display={formatTimeLabel(value)}
        placeholder={optional ? 'Not set' : 'Choose a time'}
        a11yLabel={a11yLabel}
      />
    );
  }
  return <Field label={label} value={value} onChange={onChange} placeholder={optional ? undefined : 'HH:MM'} />;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  value: { flex: 1 },
});
