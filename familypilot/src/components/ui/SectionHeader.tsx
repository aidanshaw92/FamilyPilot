import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextStyle, View } from 'react-native';

import { colors, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Where the action sits against a two-line header: `end` lines it up with the subtitle. */
  actionAlign?: 'center' | 'end';
  /** A decorative mark drawn after the title (Explore's yellow strokes). Never a control. */
  adornment?: ReactNode;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction, actionAlign = 'center', adornment, titleStyle, subtitleStyle }: SectionHeaderProps) {
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
          style={[styles.actionTarget, actionAlign === 'end' && styles.actionEnd]}
          // The link is a line of text; the padding makes its target 44pt without moving the header.
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
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
  // A 44pt target for a line of text (hitSlop is ignored on the web), taken back out of the layout.
  actionTarget: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', marginVertical: -12 },
  actionEnd: { alignSelf: 'flex-end' },
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
