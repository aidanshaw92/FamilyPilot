import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';

interface ScreenContainerProps {
  children: React.ReactNode;
}

export function ScreenHeader({
  timeGreeting,
  name,
  weather,
}: {
  timeGreeting: string;
  name: string;
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
        <Text variant="bodySmall" color={colors.text.secondary}>
          {timeGreeting}
        </Text>
        <Text variant="display" style={styles.greetingName}>
          {name}
        </Text>
        {weather ? (
          <Text variant="bodySmall" color={colors.text.tertiary} style={styles.weatherDesc}>
            {weather.description}
          </Text>
        ) : null}
      </View>
      {weather ? (
        <View style={styles.weather} accessibilityLabel={`${weather.temperature} degrees, ${weather.description}`}>
          <Ionicons name={weatherIcon} size={22} color={colors.accent[500]} />
          <Text variant="heading2">{weather.temperature}°</Text>
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
  greetingName: {
    marginTop: spacing.xs,
    fontSize: 28,
    lineHeight: 34,
  },
  weatherDesc: {
    marginTop: spacing.sm,
    maxWidth: 220,
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    ...shadows.card,
    minWidth: 80,
    justifyContent: 'center',
  },
});
