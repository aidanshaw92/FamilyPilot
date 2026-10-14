import Ionicons from '@expo/vector-icons/Ionicons';
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

  // When the place is not a fit, what is wrong leads: nobody should read four ticks before the one line that matters.
  const problemsFirst = match.verdict === 'poor' || match.verdict === 'possible';
  // A checked fact gets a tick; an inference (what this kind of place usually offers a child of this age) gets its own mark,
  // so the two are never read as the same kind of claim. A note is a confirmed fact that is not a mark against this family.
  const inferred = reasons.some((line) => line.inferred);
  const reasonsBlock =
    reasons.length > 0 ? (
      <View style={styles.group}>
        {reasons.map((line) => (
          <Row key={line.key} icon={line.inferred ? 'bulb-outline' : 'checkmark-circle'} tint={line.inferred ? colors.action : colors.secondary[500]} line={line} testID={line.inferred ? 'family-match-inferred' : 'family-match-confirmed'} />
        ))}
      </View>
    ) : null;
  const cautionsBlock =
    cautions.length > 0 ? (
      <View style={styles.group}>
        {cautions.map((line) => (
          <Row key={line.key} icon={line.note ? 'information-circle-outline' : 'alert-circle'} tint={line.note ? colors.text.tertiary : colors.warning[600]} line={line} quiet={Boolean(line.note)} />
        ))}
      </View>
    ) : null;
  const completeness = match.evidenceCompleteness;

  return (
    <View style={styles.card} testID="family-match-card">
      <Text variant="eyebrow">FAMILY FIT</Text>
      <Text variant="heading2" style={styles.headline} accessibilityRole="header">
        {match.headline}
      </Text>

      {problemsFirst ? cautionsBlock : reasonsBlock}
      {problemsFirst ? reasonsBlock : cautionsBlock}

      {toCheck.length > 0 ? (
        <View style={styles.group}>
          {toCheck.map((line) => (
            <Row key={line.key} icon="help-circle-outline" tint={colors.text.tertiary} line={line} quiet />
          ))}
        </View>
      ) : null}

      {completeness && completeness.total > 0 ? (
        // How much has been checked, kept apart from how well it fits: the grade is about the family and the place, this is about us.
        <Text variant="caption" color={colors.text.tertiary} style={styles.footnote} testID="family-match-evidence">
          {`We’ve confirmed ${completeness.known} of ${completeness.total} details that matter for your family${completeness.missing.length ? ` · not yet: ${completeness.missing.join(', ')}` : ''}.`}
        </Text>
      ) : null}
      <Text variant="caption" color={colors.text.tertiary} style={styles.footnote}>
        {inferred
          ? 'A tick is a checked fact about this place. A bulb is what this kind of place, or a facility it is confirmed to have, usually means for a child of that age. Nothing unconfirmed is counted as a fit.'
          : 'Worked out from what is confirmed about this place and what you have told us. Anything not yet confirmed is never counted as a fit.'}
      </Text>
    </View>
  );
}

function Row({
  icon,
  tint,
  line,
  quiet = false,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  line: MatchLine;
  quiet?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
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
