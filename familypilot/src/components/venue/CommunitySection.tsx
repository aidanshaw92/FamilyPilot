import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { CommunityTip } from '@/src/types';

interface CommunitySectionProps {
  tips?: CommunityTip[];
}

export function CommunitySection({ tips }: CommunitySectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={20} color={colors.primary[500]} />
        <Text variant="heading3">From parents nearby</Text>
      </View>

      {tips && tips.length > 0 ? (
        tips.map((tip) => (
          <Card key={tip.id} style={styles.tipCard} padding="md">
            <Text variant="bodySmall" style={styles.tipMessage}>
              &ldquo;{tip.message}&rdquo;
            </Text>
            <Text variant="caption" color={colors.text.tertiary}>
              {tip.author} · {tip.timeAgo}
            </Text>
          </Card>
        ))
      ) : (
        <Card style={styles.placeholder} padding="lg">
          <View style={styles.placeholderIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary[200]} />
          </View>
          <Text variant="bodySmall" style={styles.placeholderTitle}>
            Community tips coming soon
          </Text>
          <Text variant="caption" style={styles.placeholderText}>
            Parent updates, photos, and facility changes will appear here.
          </Text>
        </Card>
      )}

      <View style={styles.futureSlots}>
        <FutureSlot icon="camera-outline" label="Photos" />
        <FutureSlot icon="alert-circle-outline" label="Closures" />
        <FutureSlot icon="construct-outline" label="Updates" />
      </View>
    </View>
  );
}

function FutureSlot({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.slot}>
      <Ionicons name={icon} size={18} color={colors.text.tertiary} />
      <Text variant="caption" color={colors.text.tertiary}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tipCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  tipMessage: {
    marginBottom: spacing.sm,
    color: colors.text.primary,
    fontStyle: 'italic',
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  placeholderTitle: {
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.xs,
  },
  placeholderText: {
    textAlign: 'center',
    color: colors.text.tertiary,
  },
  futureSlots: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  slot: {
    alignItems: 'center',
    gap: spacing.xs,
    opacity: 0.5,
  },
});
