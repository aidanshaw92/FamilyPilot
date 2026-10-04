import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextStyle, View } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** A decorative mark drawn after the title (Explore's yellow strokes). Never a control. */
  adornment?: ReactNode;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction, adornment, titleStyle, subtitleStyle }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <View style={styles.titleRow}>
          <Text variant="heading2" style={titleStyle}>
            {title}
          </Text>
          {adornment}
        </View>
        {subtitle ? (
          <Text variant="bodySmall" style={[styles.subtitle, subtitleStyle]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={8}
        >
          <Text variant="link">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
});
