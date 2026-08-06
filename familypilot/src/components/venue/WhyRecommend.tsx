import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';

interface WhyRecommendProps {
  reasons: string[];
}

export function WhyRecommend({ reasons }: WhyRecommendProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={20} color={colors.primary[500]} />
        <Text variant="heading3" style={styles.title}>
          Perfect for your family
        </Text>
      </View>
      {reasons.map((reason) => (
        <View key={reason} style={styles.reasonRow}>
          <View style={styles.dot} />
          <Text variant="bodySmall" style={styles.reasonText}>
            {reason}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary[500],
    marginTop: 7,
    marginRight: spacing.md,
  },
  reasonText: {
    flex: 1,
    color: colors.text.primary,
  },
});
