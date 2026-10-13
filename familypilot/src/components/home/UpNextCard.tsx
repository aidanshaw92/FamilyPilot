import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { UpNext } from '@/src/services/planning/up-next';

/**
 * Home's first line when a day is already in motion: an invitation waiting for an answer, otherwise the next plan.
 * One quiet row, not a banner; the recommendations stay underneath it. It is not drawn at all with neither. On a short screen
 * (where Home has already given up its optional lines) it is a single line, so it costs the recommendation as little as it can.
 */
export function UpNextCard({ item, onPress, slim = false }: { item: UpNext; onPress: () => void; slim?: boolean }) {
  const invitation = item.kind === 'invitation';
  const eyebrow = invitation ? `${item.from} invited you` : `Up next · ${item.when}`;
  const detail = invitation ? `${item.when} · ${item.dateSummary.split(' · ').slice(1).join(' · ') || item.dateSummary}` : item.note ? item.note : item.dateSummary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${item.title}. ${detail}${invitation ? '. Review the invitation' : '. Open the plan'}`}
      style={({ pressed }) => [styles.card, slim && styles.cardSlim, invitation && styles.cardInvite, pressed && styles.pressed]}
      testID="home-up-next"
    >
      {slim ? (
        <Text variant="label" style={styles.text}>
          <Text variant="label" color={invitation ? colors.warning[600] : colors.action}>{invitation ? `${item.from} invited you · ` : `${item.when} · `}</Text>
          {item.title}
        </Text>
      ) : (
      <View style={styles.text}>
        <Text variant="caption" color={invitation ? colors.warning[600] : colors.action}>
          {eyebrow}
        </Text>
        <Text variant="heading3">
          {item.title}
        </Text>
        <Text variant="caption" color={colors.text.secondary}>
          {detail}
        </Text>
      </View>
      )}
      {invitation ? (
        <Text variant="label" color={colors.action}>
          Review
        </Text>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardSlim: { minHeight: 44, marginTop: spacing.sm, paddingVertical: spacing.xs },
  cardInvite: { borderColor: colors.warning[100], backgroundColor: colors.warning[50] },
  pressed: { opacity: 0.85 },
  text: { flex: 1, minWidth: 0, gap: 1 },
});
