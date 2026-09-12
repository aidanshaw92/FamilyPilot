import { TextInput, View, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Text } from './Text';

export const formStyles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, gap: spacing.md, marginBottom: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.text.primary, minHeight: 48 },
});

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="bodySmall">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        secureTextEntry={secure}
        autoCapitalize="none"
        style={formStyles.input}
      />
    </View>
  );
}
