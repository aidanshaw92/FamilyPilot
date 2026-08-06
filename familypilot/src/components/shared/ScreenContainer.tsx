import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';

interface ScreenContainerProps {
  children: React.ReactNode;
}

export function ScreenHeader({
  greeting,
  location,
  weather,
}: {
  greeting: string;
  location?: string;
  weather?: { temperature: number; description: string; condition: string };
}) {
  const weatherIcon =
    weather?.condition === 'sunny'
      ? 'sunny-outline'
      : weather?.condition === 'rainy'
        ? 'rainy-outline'
        : 'partly-sunny-outline';

  return (
    <View style={styles.header}>
      <View style={styles.greetingBlock}>
        <Text variant="heading2" style={styles.greetingLine}>
          {greeting}
        </Text>
        {location || weather ? (
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.contextLine}>
            {[location, weather?.description].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {weather ? (
        <View
          style={styles.weather}
          accessibilityLabel={`${weather.temperature} degrees, ${weather.description}`}
        >
          <Ionicons name={weatherIcon} size={20} color={colors.accent[500]} />
          <Text variant="heading3">{weather.temperature}°</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ScreenContainer({ children }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  greetingBlock: {
    flex: 1,
    marginRight: spacing.lg,
  },
  greetingLine: {
    fontSize: 24,
    lineHeight: 30,
  },
  contextLine: {
    marginTop: spacing.sm,
    maxWidth: 260,
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    ...shadows.card,
    minWidth: 72,
    minHeight: 44,
    justifyContent: 'center',
  },
});
