import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FamilyMatchResult, MatchLine } from '@/src/services/matching/family-match';

/**
 * Family Fit (the engine is called Family Match), the first thing under a venue's name: what FamilyPilot tells THIS family, and why.
 *
 * The headline names the children a confirmed fact is about ("Good for Sloane today"). Under it, three kinds of line,
 * drawn differently because they mean different things: what is confirmed to work (a tick), what counts against it
 * (an amber alert) and what nobody has confirmed yet (a quiet question mark). Nothing here is a template: every line
 * comes from `evaluateFamilyMatch`, which reads the household, the venue's evidence and today's date and time.
 */
const MAX_REASONS = 5;
const MAX_CAUTIONS = 3;
const MAX_TO_CHECK = 3;

export function FamilyMatchCard({ match }: { match: FamilyMatchResult }) {
  const reasons = match.reasons.slice(0, MAX_REASONS);
  const cautions = match.cautions.slice(0, MAX_CAUTIONS);
  const toCheck = match.toCheck.slice(0, MAX_TO_CHECK);

  return (
    <View style={styles.card} testID="family-match-card">
      <Text variant="eyebrow">FAMILY FIT</Text>
      <Text variant="heading2" style={styles.headline} accessibilityRole="header">
        {match.headline}
      </Text>

      {reasons.length > 0 ? (
        <View style={styles.group}>
          {reasons.map((line) => (
            <Row key={line.key} icon="checkmark-circle" tint={colors.secondary[500]} line={line} />
          ))}
        </View>
      ) : null}

      {cautions.length > 0 ? (
        <View style={styles.group}>
          {cautions.map((line) => (
            <Row key={line.key} icon="alert-circle" tint={colors.warning[600]} line={line} />
          ))}
        </View>
      ) : null}

      {toCheck.length > 0 ? (
        <View style={styles.group}>
          {toCheck.map((line) => (
            <Row key={line.key} icon="help-circle-outline" tint={colors.text.tertiary} line={line} quiet />
          ))}
        </View>
      ) : null}

      <Text variant="caption" color={colors.text.tertiary} style={styles.footnote}>
        Worked out from what is confirmed about this place and what you have told us. Anything not yet confirmed is
        never counted as a fit.
      </Text>
    </View>
  );
}

function Row({
  icon,
  tint,
  line,
  quiet = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  line: MatchLine;
  quiet?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={tint} style={styles.icon} />
      <Text variant="body" color={quiet ? colors.text.secondary : colors.ink} style={styles.rowText}>
        {line.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  headline: {
    color: colors.ink,
  },
  group: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  icon: {
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  footnote: {
    marginTop: spacing.xs,
  },
});
