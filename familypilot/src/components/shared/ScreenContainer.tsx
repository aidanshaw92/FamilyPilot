import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
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
      <View>
        <Text variant="bodySmall" color={colors.text.secondary}>
          {timeGreeting}
        </Text>
        <Text variant="heading1" style={styles.greetingName}>
          {name}
        </Text>
      </View>
      {weather ? (
        <View style={styles.weather}>
          <Ionicons name={weatherIcon} size={24} color={colors.accent[500]} />
          <Text variant="heading3">{weather.temperature}°</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ScreenContainer({ children }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
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
    paddingBottom: spacing.md,
  },
  greetingName: {
    marginTop: spacing.xs,
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
});
