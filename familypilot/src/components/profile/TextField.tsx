import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, style, ...props }: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text variant="label" color={colors.text.secondary} style={styles.label}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.text.tertiary}
        style={[styles.input, error ? styles.inputError : undefined, style]}
        {...props}
      />
      {hint && !error ? (
        <Text variant="caption" color={colors.text.tertiary} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
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
