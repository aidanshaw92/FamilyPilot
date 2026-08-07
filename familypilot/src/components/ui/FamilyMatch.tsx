import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { getMatchClassification } from '@/src/utils/family-match-classification';

import { formatFamilyMatchSecondary } from './family-match-label';
import { Text } from './Text';

interface FamilyMatchProps {
  score: number;
  variant?: 'compact' | 'card' | 'detail';
  style?: ViewStyle;
}

/**
 * Human-readable Family Match — classification leads, numeric score is secondary.
 */
export function FamilyMatch({ score, variant = 'compact', style }: FamilyMatchProps) {
  const classification = getMatchClassification(score);
  const secondary = formatFamilyMatchSecondary(score);

  if (variant === 'compact') {
    return (
      <View
        style={[styles.compact, style]}
        accessibilityRole="text"
        accessibilityLabel={`${classification}, ${secondary}`}
      >
        <Text variant="caption" color={colors.secondary[600]} style={styles.compactPrimary}>
          {classification.replace(' match', '')}
        </Text>
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View
        style={[styles.card, style]}
        accessibilityRole="text"
        accessibilityLabel={classification}
      >
        <Text variant="caption" color={colors.text.inverse} style={styles.cardPrimary}>
          {classification.replace(' match', '')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.detail, style]}
      accessibilityRole="text"
      accessibilityLabel={`${classification}, ${secondary}`}
    >
      <Text variant="bodySmall" color={colors.secondary[600]} style={styles.detailPrimary}>
        {classification}
      </Text>
      <Text variant="caption" color={colors.text.tertiary} style={styles.detailSecondary}>
        {secondary}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    backgroundColor: colors.secondary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.secondary[100],
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactPrimary: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  card: {
    backgroundColor: colors.secondary[600],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    maxWidth: 160,
  },
  cardPrimary: {
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 16,
  },
  detail: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.secondary[100],
    ...shadows.card,
    minWidth: 120,
  },
  detailPrimary: {
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  detailSecondary: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 11,
  },
});
