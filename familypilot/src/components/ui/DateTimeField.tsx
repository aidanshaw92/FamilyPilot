import { createElement } from 'react';
import { View, Platform } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Text } from './Text';
import { Field } from './Field';

// The web build is this pilot's real surface (see .env.example), so give it a native date/time
// picker instead of a hand-typed "YYYY-MM-DD"/"HH:MM" string — far lower friction on a phone.
// Native (iOS/Android) keeps the plain text field until a real native picker is wired up there.
const webFieldStyle = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: spacing.md,
  fontSize: 16,
  color: colors.text.primary,
  minHeight: 48,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 6 }}>
        <Text variant="bodySmall">{label}</Text>
        {createElement('input', {
          type: 'date',
          value,
          'aria-label': label,
          style: webFieldStyle,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        })}
      </View>
    );
  }
  return <Field label={label} value={value} onChange={onChange} placeholder="YYYY-MM-DD" />;
}

export function TimeField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  optional?: boolean;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 6 }}>
        <Text variant="bodySmall">{label}</Text>
        {createElement('input', {
          type: 'time',
          value,
          'aria-label': label,
          style: webFieldStyle,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        })}
      </View>
    );
  }
  return <Field label={label} value={value} onChange={onChange} placeholder={optional ? undefined : 'HH:MM'} />;
}
