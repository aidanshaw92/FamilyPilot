import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { WeatherAlternative } from '@/src/types';
import { travelTimeLabel } from '@/src/utils/travel-time';

interface WeatherAlternativeSectionProps {
  alternative: WeatherAlternative;
}

export function WeatherAlternativeSection({ alternative }: WeatherAlternativeSectionProps) {
  return (
    <View style={styles.section}>
      <Text variant="heading2" style={styles.title}>
        If the weather changes
      </Text>
      <View style={styles.card}>
        <Ionicons name="rainy-outline" size={20} color={colors.accent[600]} />
        <View style={styles.textBlock}>
          <Text variant="body">
            {alternative.name} · {travelTimeLabel(alternative.driveMinutes, 'estimated')}
          </Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            {alternative.description}
          </Text>
        </View>
      </View>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.accent[50],
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent[100],
  },
  textBlock: {
    flex: 1,
    gap: spacing.xs,
  },
});
