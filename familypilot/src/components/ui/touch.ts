import type { ViewStyle } from 'react-native';

/** The smallest comfortable touch target, in points (WCAG 2.2 AAA and the platform guidelines). */
export const MIN_TARGET = 44;

/**
 * Style that gives a small control a 44pt target without moving anything around it.
 *
 * React Native's `hitSlop` is honoured on iOS and Android and ignored by react-native-web, so a
 * control that leans on it is 44pt on the phone and 20pt in a browser. This makes the target real
 * instead: the control grows to `MIN_TARGET` and a negative margin takes the extra height back out of
 * the layout, so the design (which draws it smaller) is untouched.
 */
export function minTarget(drawnHeight: number): ViewStyle {
  const extra = Math.max(0, MIN_TARGET - drawnHeight);
  return { minHeight: MIN_TARGET, minWidth: MIN_TARGET, justifyContent: 'center', alignItems: 'center', marginVertical: -extra / 2 };
}
