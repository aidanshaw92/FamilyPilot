import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spring, timing } from '@/src/design-system/animations/presets';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function Chip({ label, active = false, onPress }: ChipProps) {
  const reducedMotion = useReducedMotion();
  const activeProgress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(1);

  useEffect(() => {
    activeProgress.value = reducedMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, timing.fast);
  }, [active, activeProgress, reducedMotion]);

  const handlePress = () => {
    void Haptics.selectionAsync();
    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(activeProgress.value, [0, 1], [colors.surface, colors.primary[500]]),
    borderColor: interpolateColor(activeProgress.value, [0, 1], [colors.border, colors.primary[600]]),
    transform: [{ scale: pressed.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={handlePress}
      onPressIn={() => {
        pressed.value = withSpring(0.95, spring.snappy);
      }}
      onPressOut={() => {
        pressed.value = withSpring(1, spring.gentle);
      }}
      style={[styles.chip, animatedStyle]}
    >
      <Text
        variant="bodySmall"
        color={active ? colors.text.inverse : colors.text.secondary}
        style={[styles.label, active && styles.activeLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  label: {
    fontFamily: 'Inter_500Medium',
  },
  activeLabel: {
    fontFamily: 'Inter_600SemiBold',
  },
});
