import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Button } from './Button';
import { Text } from './Text';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.error[500]} />
      </View>
      <Text variant="heading3" style={styles.title}>
        Couldn&apos;t load
      </Text>
      <Text variant="bodySmall" style={styles.message}>
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" variant="outline" size="sm" onPress={onRetry} style={styles.button} />
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.error[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
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
