import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

import { ChildAvatar } from './ChildAvatar';

/**
 * One child's questions, headed by the child: their avatar, their name and their exact age. From the
 * first screen after the name is known, everything a parent is asked sits under the person it is about.
 */
export function ChildSection({
  name,
  ageLabel,
  children,
}: {
  name: string;
  ageLabel?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ChildAvatar name={name} size={44} />
        <View style={styles.headerText}>
          <Text variant="heading3" numberOfLines={1}>
            {name.trim() || 'Your child'}
          </Text>
          {ageLabel ? (
            <Text variant="caption" color={colors.text.secondary}>
              {ageLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1 },
  body: { marginTop: spacing.lg, gap: spacing.lg },
});
