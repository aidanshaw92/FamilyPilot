import { ReactNode, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { timing } from '@/src/design-system/animations/presets';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

interface FadeInViewProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeInView({ children, delay = 0, style }: FadeInViewProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const translateY = useSharedValue(reducedMotion ? 0 : 12);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, timing.normal));
    translateY.value = withDelay(delay, withTiming(0, timing.normal));
  }, [delay, opacity, translateY, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
