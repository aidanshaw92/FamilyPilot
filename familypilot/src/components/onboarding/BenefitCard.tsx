import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconWell, IconWellTint, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface BenefitCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  tint: IconWellTint;
  title: string;
  subtitle: string;
  /** The card carries a chevron, so it goes somewhere: the same place as "Get started". */
  onPress: () => void;
}

/**
 * One of Welcome's three benefit rows (Figma "Benefit card"): a tinted icon well, a title, a one-line
 * promise and a chevron, on a white card with a hairline. Each one states something the product does
 * today; nothing behind a pilot flag is promised here.
 */
export function BenefitCard({ icon, tint, title, subtitle, onPress }: BenefitCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <IconWell icon={icon} tint={tint} />
      <View style={styles.text}>
        <Text variant="heading3">{title}</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  pressed: {
    backgroundColor: colors.fill,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
