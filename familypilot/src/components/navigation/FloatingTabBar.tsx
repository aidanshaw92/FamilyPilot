// React Navigation is not a direct dependency here; expo-router vendors the tabs navigator and
// re-exports its types, so this is the supported path to the tab-bar prop shape.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '@/src/design-system/tokens';
import { NavGlyph, type NavTab } from '@/src/components/ui/icons';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { LABELLED_METRICS, floatingTabBarLayout, navVariantForRoute } from '@/src/utils/floating-tab-bar-layout';
import { feedbackDue } from '@/src/services/planning/feedback';
import { useChromeStore } from '@/src/stores/chrome-store';
import { usePlanningStore } from '@/src/stores/planning-store';

/**
 * The approved bottom navigation: a deep-green pill floating clear of the screen edge, holding one
 * icon per tab with a mint disc behind the active one (the icon on the disc is green).
 *
 * This replaces React Navigation's own bar rather than restyling it. The default bar derives its
 * height from the label, the icon and the safe-area inset together, and overriding only some of
 * those left the labels rendering into a 4px line box below the pill. Owning the layout means the
 * pill is exactly as tall as the frame says and nothing can be pushed outside it.
 *
 * The frames carry icons alone; with six tabs a short word under each (its title) keeps them understandable to a parent seeing
 * them for the first time (see LABELLED in floating-tab-bar-layout). Each tab also exposes its title as its accessibility label.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  // A focused modal (Meet halfway's edit sheet) takes the whole screen: the bar is not drawn while it is open and returns,
  // unchanged, when it closes. The hooks below still run so the bar's state is intact when it comes back.
  const hidden = useChromeStore((s) => s.tabBarHidden);

  // A tab hidden behind a pilot flag is declared with href: null, which takes it out of the
  // navigator entirely — so state.routes is already the set that should be drawn, and the pill
  // sizes itself to what is really on screen rather than to the full TAB_CONFIG.
  const routes = state.routes;
  // Home and Explore are drawn differently in their approved frames (see floating-tab-bar-layout),
  // so the pill takes the focused tab's variant and eases between them.
  const variant = navVariantForRoute(routes[state.index]?.name);
  const layout = floatingTabBarLayout(routes.length, insets.bottom, variant, true);

  const width = useSharedValue(layout.width);
  const height = useSharedValue(layout.height);
  const bottom = useSharedValue(layout.bottom);
  const tabWidth = useSharedValue(layout.tabWidth);
  const padX = useSharedValue(layout.padX);
  const indicator = useSharedValue(layout.indicator);

  useEffect(() => {
    const move = (value: { value: number }, target: number) => {
      value.value = reducedMotion ? target : withTiming(target, { duration: 180 });
    };
    move(width, layout.width);
    move(height, layout.height);
    move(bottom, layout.bottom);
    move(tabWidth, layout.tabWidth);
    move(padX, layout.padX);
    move(indicator, layout.indicator);
  }, [layout.width, layout.height, layout.bottom, layout.tabWidth, layout.padX, layout.indicator, reducedMotion, width, height, bottom, tabWidth, padX, indicator]);

  const dockStyle = useAnimatedStyle(() => ({ bottom: bottom.value }));
  const pillStyle = useAnimatedStyle(() => ({ width: width.value, height: height.value, paddingHorizontal: padX.value }));
  const tabStyle = useAnimatedStyle(() => ({ width: tabWidth.value }));
  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicator.value,
    height: indicator.value,
    borderRadius: indicator.value / 2,
  }));
  const indicatorBox = useAnimatedStyle(() => ({ width: indicator.value, height: indicator.value }));

  // A quiet dot on Plans when a visit is waiting to be checked ("Did you go to...?"). Nothing is added to Home itself.
  const visitCheckWaiting = usePlanningStore(
    (s) => s.hydrated && s.saved.some((plan) => feedbackDue(plan)),
  );

  if (hidden) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.dock, dockStyle]}>
      <Animated.View accessibilityRole="tablist" style={[styles.pill, pillStyle]}>
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.routes[state.index]?.key === route.key;
          const baseLabel = typeof options.title === 'string' ? options.title : route.name;
          const waiting = route.name === 'trips' && visitCheckWaiting;
          const label = waiting ? `${baseLabel}, a visit check is waiting` : baseLabel;

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
              aria-selected={focused}
              {...({ 'aria-current': focused ? 'page' : undefined } as object)}
              accessibilityLabel={label}
              onPress={onPress}
              style={styles.tabPressable}
            >
              <Animated.View style={[styles.tab, tabStyle]}>
                {/* The icon is drawn in a box as big as the mint disc, so nothing it draws reaches past the tab or the capsule. */}
                <Animated.View style={[styles.iconBox, indicatorBox]}>
                  {focused ? <Animated.View style={[styles.indicator, indicatorStyle]} /> : null}
                  <NavGlyph
                    tab={route.name as NavTab}
                    variant={variant}
                    color={focused ? colors.action : INACTIVE_ICON}
                    focused={focused}
                    fill={colors.surface}
                    size={layout.indicator}
                  />
                </Animated.View>
                {/* Said by the tab's accessibility label already, so not announced a second time. */}
                <Text
                  numberOfLines={1}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.label, focused && styles.labelFocused]}
                  testID={`tab-label-${route.name}`}
                >
                  {baseLabel}
                </Text>
                {waiting ? <View style={styles.waitingDot} testID="visit-check-dot" /> : null}
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

/** Legible on the deep-green pill without competing with the active tab. */
const INACTIVE_ICON = 'rgba(255, 255, 255, 0.82)';

const styles = StyleSheet.create({
  waitingDot: {
    position: 'absolute',
    top: 8,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.warning[100],
    borderWidth: 1.5,
    borderColor: colors.nav.pill,
  },
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
    borderRadius: radius.full,
    // The identity's deep-green pill (references: Home, Explore), with its own lift.
    backgroundColor: colors.nav.pill,
    shadowColor: colors.action,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 12,
  },
  // The whole tab cell is the touch target (at least 55 x 59), not just the icon.
  tabPressable: {
    height: '100%',
  },
  tab: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: LABELLED_METRICS.labelSize,
    lineHeight: 12,
    letterSpacing: 0.1,
    color: INACTIVE_ICON,
    textAlign: 'center',
  },
  labelFocused: { fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  indicator: {
    position: 'absolute',
    backgroundColor: colors.nav.active,
  },
});
