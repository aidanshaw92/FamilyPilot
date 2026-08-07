import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface StepIndicatorProps {
  current: number;
  total: number;
}

export function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <View style={styles.row} accessibilityLabel={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[styles.dot, index < current ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

interface OnboardingShellProps {
  title: string;
  subtitle?: string;
  step: number;
  totalSteps: number;
  children: React.ReactNode;
  onBack?: () => void;
}

export function OnboardingShell({
  title,
  subtitle,
  step,
  totalSteps,
  children,
  onBack,
}: OnboardingShellProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </Pressable>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <StepIndicator current={step} total={totalSteps} />
        <View style={styles.backPlaceholder} />
      </View>

      <View style={styles.header}>
        <Text variant="heading1">{title}</Text>
        {subtitle ? (
          <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['2xl'],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  backPlaceholder: {
    width: 44,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  dotActive: {
    backgroundColor: colors.primary[500],
    width: 24,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },
  header: {
    marginBottom: spacing['2xl'],
  },
  subtitle: {
    marginTop: spacing.md,
    lineHeight: 24,
  },
  content: {
    flex: 1,
  },
});
