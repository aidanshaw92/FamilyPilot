import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, shadows, spacing } from '@/src/design-system/tokens';

/** Structural shape of what expo-router hands a custom `tabBar`, typed here so the bar
 * does not depend on @react-navigation's types being resolvable. */
interface TabRoute {
  key: string;
  name: string;
}

export interface FloatingTabBarProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { title?: string; href?: string | null } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: never) => void;
  };
}

/** Icons are declared per route so the bar never has to guess from a title. The order here
 * is the order in the bar, and a route absent from this map never appears in it - Families
 * is a real screen reached from Plans and Profile rather than a sixth permanent slot. */
const ROUTE_ICONS: Record<string, { idle: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = {
  index: { idle: 'home-outline', active: 'home' },
  explore: { idle: 'compass-outline', active: 'compass' },
  trips: { idle: 'calendar-outline', active: 'calendar' },
  saved: { idle: 'heart-outline', active: 'heart' },
  profile: { idle: 'person-outline', active: 'person' },
};

/**
 * A floating charcoal capsule with icon-only controls; the active one lifts into a white
 * circle. Replaces the platform tab bar entirely so it reads as a designed object rather
 * than OS chrome.
 */
export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.lg);

  // A route earns a slot only by being in ROUTE_ICONS and not hidden behind a pilot flag.
  const routes = state.routes.filter(
    (route) => ROUTE_ICONS[route.name] && descriptors[route.key]?.options.href !== null,
  );

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const label = (options.title ?? route.name) as string;
          const focused = state.routes[state.index].key === route.key;
          const icon = ROUTE_ICONS[route.name];

          const onPress = () => {
            void Haptics.selectionAsync();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              style={styles.item}
            >
              <View style={[styles.iconSlot, focused && styles.iconSlotActive]}>
                <Ionicons
                  name={focused ? icon.active : icon.idle}
                  size={21}
                  color={focused ? colors.text.primary : 'rgba(255,255,255,0.72)'}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.navHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    ...shadows.floating,
  },
  item: {
    paddingHorizontal: spacing.xs,
  },
  iconSlot: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotActive: {
    backgroundColor: colors.surface,
  },
});
