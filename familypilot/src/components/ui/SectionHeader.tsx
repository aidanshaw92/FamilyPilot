import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text variant="heading2">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={8}
        >
          <Text variant="bodySmall" color={colors.primary[500]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
});
