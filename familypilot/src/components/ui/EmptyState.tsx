import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Button } from './Button';
import { Text } from './Text';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'compass-outline',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={colors.primary[200]} />
      </View>
      <Text variant="heading3" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} style={styles.button} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing['2xl'],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    textAlign: 'center',
    color: colors.text.secondary,
    maxWidth: 280,
  },
  button: {
    marginTop: spacing['2xl'],
  },
});
