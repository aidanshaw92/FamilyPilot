import { Ionicons } from '@expo/vector-icons';
// React Navigation is not a direct dependency here; expo-router vendors the tabs navigator and
// re-exports its types, so this is the supported path to the tab-bar prop shape.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows } from '@/src/design-system/tokens';
import {
  ACTIVE_INDICATOR,
  floatingTabBarLayout,
  ICON_SIZE,
  PILL_PADDING_X,
  PILL_PADDING_Y,
  TAB_GAP,
  TAB_HEIGHT,
  TAB_SIZE,
} from '@/src/utils/floating-tab-bar-layout';

/**
 * The approved bottom navigation: a dark pill floating clear of the screen edge, holding one
 * icon per tab with a white disc behind the active one.
 *
 * This replaces React Navigation's own bar rather than restyling it. The default bar derives its
 * height from the label, the icon and the safe-area inset together, and overriding only some of
 * those left the labels rendering into a 4px line box below the pill. Owning the layout means the
 * pill is exactly as tall as the frame says and nothing can be pushed outside it.
 *
 * The frame carries no text labels, so neither does this. Each tab still exposes its title as an
 * accessibility label, so the destination is announced even though it is drawn as an icon.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // A tab hidden behind a pilot flag is declared with href: null, which takes it out of the
  // navigator entirely — so state.routes is already the set that should be drawn, and the pill
  // sizes itself to what is really on screen rather than to the full TAB_CONFIG.
  const routes = state.routes;
  const layout = floatingTabBarLayout(routes.length, insets.bottom);

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: layout.bottom }]}>
      <View
        accessibilityRole="tablist"
        style={[styles.pill, { width: layout.width, height: layout.height }]}
      >
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.routes[state.index]?.key === route.key;
          const label = typeof options.title === 'string' ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (focused || event.defaultPrevented) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate(route.name as never);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              style={styles.tab}
            >
              {focused ? <View style={styles.indicator} /> : null}
              {options.tabBarIcon?.({
                focused,
                color: focused ? colors.text.primary : INACTIVE_ICON,
                size: ICON_SIZE,
              })}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Legible on the near-black pill without competing with the active tab. */
const INACTIVE_ICON = 'rgba(255, 255, 255, 0.72)';

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: TAB_GAP,
    paddingHorizontal: PILL_PADDING_X,
    paddingVertical: PILL_PADDING_Y,
    borderRadius: radius.full,
    backgroundColor: colors.text.primary,
    ...shadows.card,
  },
  tab: {
    width: TAB_SIZE,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    width: ACTIVE_INDICATOR,
    height: ACTIVE_INDICATOR,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
});
