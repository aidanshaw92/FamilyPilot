import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors } from '@/src/design-system/tokens';
import { spring } from '@/src/design-system/animations/presets';
import { useSavedStore } from '@/src/stores/saved-store';

interface SaveButtonProps {
  venueId: string;
  size?: number;
  color?: string;
  filledColor?: string;
}

export function SaveButton({
  venueId,
  size = 24,
  color = colors.text.primary,
  filledColor = colors.error[500],
}: SaveButtonProps) {
  const { isSaved, toggleSaved } = useSavedStore();
  const saved = isSaved(venueId);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(saved ? 1.15 : 1, spring.snappy);
    const t = setTimeout(() => {
      scale.value = withSpring(1, spring.gentle);
    }, 150);
    return () => clearTimeout(t);
  }, [saved, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(
      saved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    toggleSaved(venueId);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save place'}
      accessibilityState={{ selected: saved }}
      hitSlop={12}
    >
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={saved ? 'heart' : 'heart-outline'}
          size={size}
          color={saved ? filledColor : color}
        />
      </Animated.View>
    </Pressable>
  );
}
