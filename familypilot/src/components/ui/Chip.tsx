import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function Chip({ label, active = false, onPress }: ChipProps) {
  const handlePress = () => {
    void Haptics.selectionAsync();
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={handlePress}
      style={[styles.chip, active && styles.active]}
    >
      <Text
        variant="bodySmall"
        color={active ? colors.text.inverse : colors.text.secondary}
        style={[styles.label, active && styles.activeLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  active: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[600],
  },
  label: {
    fontFamily: 'Inter_500Medium',
  },
  activeLabel: {
    fontFamily: 'Inter_600SemiBold',
  },
});
