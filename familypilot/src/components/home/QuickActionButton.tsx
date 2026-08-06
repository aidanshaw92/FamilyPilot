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
  'calendar-outline': 'calendar-outline',
  'heart-outline': 'heart-outline',
};

interface QuickActionButtonProps {
  action: QuickAction;
  compact?: boolean;
}

export function QuickActionButton({ action, compact = false }: QuickActionButtonProps) {
  const router = useRouter();
  const iconName = ICON_MAP[action.icon] ?? 'ellipse-outline';

  if (compact) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => router.push(action.route as never)}
        style={styles.compactContainer}
      >
        <View style={[styles.compactIcon, { backgroundColor: action.color + '18' }]}>
          <Ionicons name={iconName} size={18} color={action.color} />
        </View>
        <Text variant="caption" style={styles.compactLabel} numberOfLines={1}>
          {action.label}
        </Text>
      </PressableScale>
    );
  }

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
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#F0EEEB',
  },
  compactIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLabel: {
    fontFamily: 'Inter_500Medium',
  },
});
