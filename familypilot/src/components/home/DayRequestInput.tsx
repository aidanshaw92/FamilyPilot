import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface DayRequestInputProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export function DayRequestInput({ value, onChange, onSubmit, loading }: DayRequestInputProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="heading3" style={styles.title}>
        What does your family need today?
      </Text>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
        Describe your ideal outing — we match against trusted venue facts, not guesses.
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Somewhere indoors for two hours. Pushchair-friendly with easy parking."
        placeholderTextColor={colors.text.tertiary}
        multiline
        style={styles.input}
        accessibilityLabel="Describe what your family needs today"
      />
      <Button
        label={loading ? 'Finding matches…' : 'Find recommendations'}
        onPress={onSubmit}
        disabled={loading || !value.trim()}
        size="lg"
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    color: colors.primary[600],
  },
  subtitle: {
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: spacing.sm,
  },
});
