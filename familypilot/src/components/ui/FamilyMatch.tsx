import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';

import { FAMILY_MATCH_LABEL } from './family-match-label';
import { Text } from './Text';

interface FamilyMatchProps {
  score: number;
  variant?: 'compact' | 'card' | 'detail';
  style?: ViewStyle;
}

/**
 * Unified Family Match presentation.
 * Use "Family Score" (FamilyMatchPanel) only for detailed breakdowns.
 */
export function FamilyMatch({ score, variant = 'compact', style }: FamilyMatchProps) {
  const label = FAMILY_MATCH_LABEL;

  if (variant === 'compact') {
    return (
      <View
        style={[styles.compact, style]}
        accessibilityRole="text"
        accessibilityLabel={`${label} ${score} percent`}
      >
        <Text variant="caption" color={colors.text.inverse} style={styles.compactScore}>
          {score}%
        </Text>
        <Text variant="caption" color={colors.text.inverse} style={styles.compactLabel}>
          Match
        </Text>
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View
        style={[styles.card, style]}
        accessibilityRole="text"
        accessibilityLabel={`${label} ${score} percent`}
      >
        <Text variant="caption" color={colors.text.inverse} style={styles.cardText}>
          {score}% {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.detail, style]}
      accessibilityRole="text"
      accessibilityLabel={`${label} ${score} percent`}
    >
      <Text variant="heading1" color={colors.secondary[600]}>
        {score}%
      </Text>
      <Text variant="caption" color={colors.secondary[600]} style={styles.detailLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    backgroundColor: colors.secondary[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  compactScore: {
    fontFamily: 'Inter_700Bold',
    lineHeight: 16,
  },
  compactLabel: {
    fontSize: 10,
    lineHeight: 12,
  },
  card: {
    backgroundColor: colors.secondary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  cardText: {
    fontFamily: 'Inter_700Bold',
  },
  detail: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.secondary[50],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.secondary[500],
    ...shadows.card,
  },
  detailLabel: {
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
});
