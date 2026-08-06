import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { colors, radius } from '@/src/design-system/tokens';
import { timing } from '@/src/design-system/animations/presets';

import { Text } from './Text';

interface ScoreFactorBarProps {
  label: string;
  value: number;
  delay?: number;
}

export function ScoreFactorBar({ label, value, delay = 0 }: ScoreFactorBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(value, timing.slow));
  }, [delay, value, width]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const barColor =
    value >= 85 ? colors.secondary[500] : value >= 70 ? colors.accent[500] : colors.warning[500];

  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value} percent`}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle, { backgroundColor: barColor }]} />
      </View>
      <Text variant="caption" style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    width: 88,
    color: colors.text.secondary,
  },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  value: {
    width: 24,
    textAlign: 'right',
    fontFamily: 'Inter_600SemiBold',
    color: colors.text.primary,
  },
});
