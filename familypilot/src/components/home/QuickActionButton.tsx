import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { radius, spacing } from '@/src/design-system/tokens';
import { QuickAction } from '@/src/types';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  'sun-outline': 'sunny-outline',
  'home-outline': 'home-outline',
  'airplane-outline': 'airplane-outline',
  'cart-outline': 'cart-outline',
  'restaurant-outline': 'restaurant-outline',
  'bag-outline': 'bag-outline',
  'map-outline': 'map-outline',
  'car-outline': 'car-outline',
};

interface QuickActionButtonProps {
  action: QuickAction;
}

export function QuickActionButton({ action }: QuickActionButtonProps) {
  const router = useRouter();
  const iconName = ICON_MAP[action.icon] ?? 'ellipse-outline';

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(action.route as never);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={[styles.iconContainer, { backgroundColor: action.color + '18' }]}>
        <Ionicons name={iconName} size={26} color={action.color} />
      </View>
      <Text variant="caption" style={styles.label} numberOfLines={2}>
        {action.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 88,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
});
