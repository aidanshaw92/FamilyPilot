import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';

/**
 * Family Fit while a parent report might still correct it.
 *
 * Parent reports can only ever LOWER confidence in a fact the venue states (a contradiction turns "baby changing: yes" into
 * "needs rechecking"). For a venue the server says has recent reports, showing the venue's own fact as confirmed and then
 * taking it back a moment later is the worse experience, so Family Fit shows this quiet, neutral state for the few
 * hundred milliseconds the reports take (three seconds at the very most, after which the venue's own facts are used),
 * the same height as the card it becomes and with no verdict, no tick and no number, so nothing is claimed that may be withdrawn.
 *
 * It appears ONLY when `hasRecentParentReports` is true; a venue with no recent reports (today, all of them) never shows it.
 */
export const FAMILY_FIT_CHECKING_LABEL = 'Checking recent parent reports';

export function FamilyFitCheckingBadge() {
  return (
    <View style={styles.badge} testID="family-fit-checking-badge" accessible accessibilityRole="text" accessibilityLabel={FAMILY_FIT_CHECKING_LABEL}>
      <Text variant="caption" color={colors.text.secondary} numberOfLines={1}>
        Checking
      </Text>
    </View>
  );
}

export function FamilyFitCheckingCard() {
  return (
    <View style={styles.card} testID="family-fit-checking" accessible accessibilityRole="text" accessibilityLabel={`Family Fit. ${FAMILY_FIT_CHECKING_LABEL}`}>
      <Text variant="eyebrow">FAMILY FIT</Text>
      <Text variant="heading2" color={colors.text.secondary} style={styles.headline}>
        {FAMILY_FIT_CHECKING_LABEL}…
      </Text>
      <Text variant="body" color={colors.text.tertiary}>
        Making sure nothing a parent has reported recently changes this.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.fill,
    alignSelf: 'flex-start',
  },
  // A card is about 200 points tall once its lines arrive; holding that room means the swap is a change of words, not a jump.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    minHeight: 200,
  },
  headline: {},
});
