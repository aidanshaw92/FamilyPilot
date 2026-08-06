import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { timing } from '@/src/design-system/animations/presets';
import { FamilyScore, FamilyScoreFactors } from '@/src/types';

import { ScoreFactorBar } from './ScoreFactorBar';
import { Text } from './Text';

const FACTOR_LABELS: { key: keyof FamilyScoreFactors; label: string }[] = [
  { key: 'ageSuitability', label: 'Age fit' },
  { key: 'facilitiesMatch', label: 'Facilities' },
  { key: 'accessibility', label: 'Access' },
  { key: 'distance', label: 'Distance' },
  { key: 'budgetFit', label: 'Budget' },
  { key: 'weatherFit', label: 'Weather' },
];

interface FamilyMatchPanelProps {
  familyScore: FamilyScore;
  compact?: boolean;
}

export function FamilyMatchPanel({ familyScore, compact = false }: FamilyMatchPanelProps) {
  const matchPercent = familyScore.score;
  const ringProgress = useSharedValue(0);

  useEffect(() => {
    ringProgress.value = withDelay(200, withTiming(matchPercent, timing.slow));
  }, [matchPercent, ringProgress]);

  const ringStyle = useAnimatedStyle(() => ({
    width: `${ringProgress.value}%`,
  }));

  return (
    <View style={[styles.panel, compact && styles.compact]}>
      <View style={styles.header}>
        <View style={styles.matchBadge}>
          <Text variant="heading1" color={colors.secondary[600]}>
            {matchPercent}%
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text variant="label" color={colors.secondary[600]}>
            FAMILY MATCH™
          </Text>
          <Text variant="heading3">How well this suits your family</Text>
        </View>
      </View>

      <View style={styles.ringTrack}>
        <Animated.View style={[styles.ringFill, ringStyle]} />
      </View>

      {!compact ? (
        <View style={styles.factors}>
          {FACTOR_LABELS.map((factor, index) => (
            <ScoreFactorBar
              key={factor.key}
              label={factor.label}
              value={familyScore.factors[factor.key]}
              delay={100 + index * 60}
            />
          ))}
        </View>
      ) : null}

      {familyScore.explanation.length > 0 ? (
        <View style={styles.reasons}>
          <Text variant="bodySmall" style={styles.reasonsTitle}>
            Perfect for your family because:
          </Text>
          {familyScore.explanation.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Text variant="bodySmall" color={colors.secondary[600]}>
                •
              </Text>
              <Text variant="bodySmall" style={styles.reasonText}>
                {reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.secondary[100],
  },
  compact: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  matchBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.secondary[50],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.secondary[500],
  },
  headerText: {
    flex: 1,
  },
  ringTrack: {
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  ringFill: {
    height: '100%',
    backgroundColor: colors.secondary[500],
    borderRadius: radius.full,
  },
  factors: {
    marginBottom: spacing.md,
  },
  reasons: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  reasonsTitle: {
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.sm,
    color: colors.text.primary,
  },
  reasonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reasonText: {
    flex: 1,
    color: colors.text.secondary,
  },
});
