import { TextInput, TextInputProps, View, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { CHIP_GAP } from './Chip';
import { Text } from './Text';

export const formStyles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, gap: spacing.md, marginBottom: spacing.lg },
  // Rows of chips use the chips' own gap so the Trips form matches every other chip row.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP, alignItems: 'center' },
  // The keyboard focus ring stays visible (never removed), drawn in the action green rather than the
  // browser's black so a focused field reads as the identity's control, not a foreign outline.
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.text.primary, minHeight: 48, outlineColor: colors.action },
});

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
  keyboardType,
  autoComplete,
  textContentType,
  onSubmit,
  testID,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  onSubmit?: () => void;
  testID?: string;
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
        autoCorrect={false}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        textContentType={textContentType}
        onSubmitEditing={onSubmit}
        returnKeyType={onSubmit ? 'go' : undefined}
        testID={testID}
        style={formStyles.input}
      />
    </View>
  );
}
