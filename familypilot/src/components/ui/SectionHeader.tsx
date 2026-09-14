import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

/** Heading on the left, a quiet underlined link on the right, exactly as the reference
 * sets up "Upcoming tours / See all". */
export function SectionHeader({ title, subtitle, actionLabel, onAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.titleBlock}>
        <Text variant="heading1" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text variant="bodySmall" color={colors.text.primary} style={styles.actionLabel}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  titleBlock: {
    flex: 1,
  },
  subtitle: {
    marginTop: 3,
  },
  action: {
    paddingVertical: spacing.xs,
  },
  actionLabel: {
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.6,
  },
});
