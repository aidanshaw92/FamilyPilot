import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';

/**
 * Frame 04's "Family intelligence / Profile receipt" (node 76:61): a quiet grey pill with a tick,
 * one line saying which of the parent's own details the plan will use, and an "Edit" link. It is a
 * receipt, not a promise: the text comes from `profileReceipt`, which says only what the profile holds.
 */
export function ProfileReceipt({ text, onEdit, style }: { text: string; onEdit?: () => void; style?: object }) {
  return (
    <View style={[styles.pill, style]} testID="profile-receipt">
      <Ionicons name="checkmark" size={14} color={colors.ink} style={styles.icon} />
      <Text style={styles.text}>
        {text}
        {onEdit ? (
          <>
            {' · '}
            <Text onPress={onEdit} accessibilityRole="button" style={styles.edit}>
              Edit
            </Text>
          </>
        ) : null}
      </Text>
      {/* A second, invisible target so the link meets 44pt even though it is inline text. */}
      {onEdit ? <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit family details" style={styles.editHit} hitSlop={8} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.fill,
    borderRadius: 18,
    paddingVertical: 10,
    paddingLeft: 15,
    paddingRight: spacing.lg,
    minHeight: 58,
  },
  icon: { marginTop: 3 },
  // Node 76:64: Medium 13 on a 19 line, secondary ink; "Edit" SemiBold ink underlined.
  text: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, color: colors.text.secondary },
  edit: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19, color: colors.action, textDecorationLine: 'underline' },
  editHit: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 56 },
});
