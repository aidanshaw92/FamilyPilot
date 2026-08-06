import * as Haptics from 'expo-haptics';
import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { spring } from '@/src/design-system/animations/presets';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

export function PressableScale({
  children,
  scale = 0.97,
  style,
  haptic = true,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: PressableScaleProps) {
  const pressed = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        pressed.value = withSpring(scale, spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(1, spring.gentle);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
