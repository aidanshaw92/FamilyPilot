
import { BenefitIcon, BenefitIconKind } from './BenefitIcon';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { ChevronGlyph } from '@/src/components/ui/icons';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface BenefitCardProps {
  icon: BenefitIconKind;
  title: string;
  subtitle: string;
  /** The card carries a chevron, so it goes somewhere: the same place as "Get started". */
  onPress: () => void;
}

/**
 * One of Welcome's three benefit rows, from the approved frame 166:128 (852px = 393pt): a 51-tall,
 * 349-wide white card with a 47 icon well 8 in from the left, the title Semi Bold 12.9 and the one-line
 * promise 11 starting 18.5 past the well, and a chevron at the right. Each one states
 * something the product does today; nothing behind a pilot flag is promised here.
 */
/** The frame's chevron (node 172:238): 12.6px wide at 2.168 = 5.8pt, a thin open chevron. */
const CHEVRON_WIDTH = 5.8;

export function BenefitCard({ icon, title, subtitle, onPress }: BenefitCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <BenefitIcon kind={icon} size={47} />
      <View style={styles.text}>
        {/* One line each at the reference's 390; a narrower phone wraps rather than ellipsises. */}
        <Text variant="heading3" style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.chevron}>
        <ChevronGlyph size={CHEVRON_WIDTH} color={colors.text.tertiary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingLeft: 8,
    paddingRight: spacing.md,
    minHeight: 51.2,
    backgroundColor: colors.surface,
    borderRadius: 13.8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  pressed: {
    backgroundColor: colors.fill,
  },
  text: {
    flex: 1,
    gap: 1,
    marginLeft: 18.5,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  title: {
    fontSize: 12.9,
    lineHeight: 16,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
});
