import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { CommunityTip } from '@/src/types';

interface CommunitySectionProps {
  tips?: CommunityTip[];
}

export function CommunitySection({ tips }: CommunitySectionProps) {
  if (!tips || tips.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text variant="heading3" style={styles.title}>
        From other families
      </Text>
      {tips.map((tip) => (
        <View key={tip.id} style={styles.tipCard}>
          <Text variant="bodySmall" style={styles.tipMessage}>
            {tip.message}
          </Text>
          <Text variant="caption" color={colors.text.tertiary}>
            {tip.author} · {tip.timeAgo}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing['2xl'],
  },
  title: {
    marginBottom: spacing.lg,
  },
  tipCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tipMessage: {
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
});
