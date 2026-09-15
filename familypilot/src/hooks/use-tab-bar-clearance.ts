import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { floatingTabBarLayout } from '@/src/utils/floating-tab-bar-layout';

/**
 * How much room a tab screen must leave below its content so nothing ends up behind the floating
 * navigation. The bar is absolutely positioned and outside the scroll view, so no screen gets this
 * for free — each one has to ask.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  // The pill is at its tallest with the full tab set; sizing to that keeps the clearance right
  // whether or not a pilot-gated tab is showing.
  return floatingTabBarLayout(5, insets.bottom).contentClearance;
}
