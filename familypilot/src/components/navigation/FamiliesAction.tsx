import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors } from '@/src/design-system/tokens';

/**
 * The way into Families from the screens a parent starts on (Home and Explore).
 *
 * A labelled pill, not a bare icon: "Families" is said in words so nobody has to guess what a people glyph does. It is not
 * a sixth tab (the bottom navigation keeps its five); it opens the Families screen, which holds the connections, the
 * invitations and the ways to plan with another family. The visible word is the start of the accessible name, so a screen
 * reader and a voice-control user both say "Families". Forty-four points tall, the app's minimum drawn target (the pill is
 * drawn at that size, not enlarged by hit slop, because the accessibility audit and some assistive tech measure the drawn box).
 */
export const FAMILIES_ROUTE = '/families';

export function FamiliesAction({ style, testID = 'families-action' }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const router = useRouter();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Families, the families you plan days out with"
      hitSlop={4}
      onPress={() => router.push(FAMILIES_ROUTE as never)}
      style={({ pressed }) => [styles.pill, pressed ? styles.pressed : null, style]}
    >
      <Ionicons name="people-outline" size={18} color={colors.ink} />
      <Text variant="bodySmall" style={styles.label} numberOfLines={1}>
        Families
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  label: { fontFamily: 'Inter_600SemiBold', color: colors.ink },
});
