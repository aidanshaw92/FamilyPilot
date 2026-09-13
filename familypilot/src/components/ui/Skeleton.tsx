import { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const PULSE_MIN = 0.45;
const PULSE_MAX = 1;

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
}: SkeletonProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(PULSE_MAX);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = PULSE_MIN;
      return;
    }
    opacity.value = withRepeat(
      withTiming(PULSE_MIN, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[styles.base, { width, height, borderRadius }, animatedStyle, style]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton height={140} borderRadius={0} />
      <View style={styles.cardBody}>
        <Skeleton height={18} width="70%" />
        <Skeleton height={14} width="40%" style={styles.gap} />
        <Skeleton height={12} width="90%" style={styles.gap} />
      </View>
    </View>
  );
}

export function SkeletonDecisionCard() {
  return (
    <View style={[styles.card, styles.decision]}>
      <Skeleton height={160} borderRadius={radius.lg} />
      <View style={styles.cardBody}>
        <Skeleton height={20} width="60%" />
        <Skeleton height={14} width="30%" style={styles.gap} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={12} width={`${90 - i * 10}%`} style={styles.gap} />
        ))}
        <Skeleton height={48} width="100%" borderRadius={radius.md} style={styles.gapLg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.borderLight,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  decision: {
    width: 300,
    marginRight: 16,
  },
  cardBody: {
    padding: 16,
  },
  gap: {
    marginTop: 8,
  },
  gapLg: {
    marginTop: 16,
  },
});
