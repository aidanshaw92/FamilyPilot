import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { TriState } from '@/src/types/enrichment';

interface TriStateToggleProps {
  label: string;
  value?: TriState;
  onChange: (value: TriState) => void;
}

const OPTIONS: TriState[] = ['yes', 'no', 'unknown'];

export function TriStateToggle({ label, value, onChange }: TriStateToggleProps) {
  return (
    <View style={styles.row}>
      <Text variant="bodySmall" style={styles.label}>{label}</Text>
      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.chip, value === opt && styles.chipActive]}
            onPress={() => onChange(opt)}
          >
            <Text variant="caption">{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  label: { marginBottom: spacing.xs, fontFamily: 'Inter_500Medium' },
  options: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 64,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
});
