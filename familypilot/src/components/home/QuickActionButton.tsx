import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/src/components/ui/PressableScale';
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

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => router.push(action.route as never)}
      style={styles.container}
    >
      <View style={[styles.iconContainer, { backgroundColor: action.color + '18' }]}>
        <Ionicons name={iconName} size={26} color={action.color} />
      </View>
      <Text variant="caption" style={styles.label} numberOfLines={2}>
        {action.label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 88,
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
