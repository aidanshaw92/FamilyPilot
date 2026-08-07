import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { EatNearbyOption } from '@/src/types';

interface EatNearbySectionProps {
  options: EatNearbyOption[];
}

export function EatNearbySection({ options }: EatNearbySectionProps) {
  const router = useRouter();

  if (options.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text variant="heading3" style={styles.title}>
        Eat nearby
      </Text>
      {options.map((option) => (
        <Pressable
          key={option.venueId}
          style={styles.card}
          onPress={() => router.push(`/venue/${option.venueId}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`View ${option.name}`}
        >
          <View style={styles.cardHeader}>
            <Text variant="heading3">{option.name}</Text>
            <Text variant="caption" color={colors.text.secondary}>
              {option.driveMinutes} min · Est. {option.estimatedSpend ?? 'spend varies'}
            </Text>
          </View>
          <Text variant="bodySmall" color={colors.text.secondary}>
            {option.highlights.join(' · ')}
          </Text>
        </Pressable>
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
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardHeader: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
});
