import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/src/design-system/tokens';

/**
 * The identity's decorative marks, from the Figma "Doodle" component set: a leaf, three short
 * strokes, and a soft blob. They are the only ornament the app draws, and they follow three rules
 * that the references set and the brief made explicit:
 *
 *   - They appear on Welcome, Home and Explore. Venue Detail, the plan screens, Profile and every
 *     form stay plain so the facts on them are the focus.
 *   - They sit on the canvas, never on a card, a photo, a button or inside a touch target, and
 *     never under text.
 *   - They are invisible to assistive technology and to the pointer: a doodle can be drawn under a
 *     control's margin without stealing its tap.
 *
 * Geometry is the component set's own (48 leaf, 40x32 strokes, 64x52 blob), scaled by `size`.
 */
export type DoodleKind = 'leaf' | 'strokes' | 'blob';
export type DoodleTint = 'mint' | 'yellow' | 'blush' | 'lilac' | 'green';

interface DoodleProps {
  kind: DoodleKind;
  tint?: DoodleTint;
  /** Width in points. Height follows the mark's own aspect ratio. */
  size?: number;
  /** Degrees, clockwise. */
  rotate?: number;
  style?: ViewStyle;
  testID?: string;
}

const TINT: Record<DoodleTint, string> = {
  mint: colors.brand.mint,
  yellow: colors.brand.yellow,
  blush: colors.tintStrong.blush,
  lilac: colors.tintStrong.lilac,
  green: colors.brand.leaf,
};

const BOX: Record<DoodleKind, { w: number; h: number }> = {
  leaf: { w: 48, h: 48 },
  strokes: { w: 40, h: 32 },
  blob: { w: 64, h: 52 },
};

export function Doodle({ kind, tint = 'yellow', size, rotate = 0, style, testID }: DoodleProps) {
  const box = BOX[kind];
  const width = size ?? box.w;
  const height = (width / box.w) * box.h;
  const color = TINT[tint];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={testID}
      style={[styles.wrap, { width, height, transform: [{ rotate: `${rotate}deg` }] }, style]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${box.w} ${box.h}`}>
        {kind === 'leaf' ? (
          <>
            <Path
              d="M8 42 C10 26 20 14 42 10 C40 28 30 40 12 44 C10 44 9 43 8 42 Z"
              fill={color}
            />
            <Path
              d="M12 42 C18 32 26 24 38 16"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : null}
        {kind === 'strokes' ? (
          <>
            <Path d="M6 26 L13 8" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
            <Path d="M19 28 L20.5 12" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
            <Path d="M30 28 L38 16" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
          </>
        ) : null}
        {kind === 'blob' ? (
          <Path
            d="M22 2 C36 -2 54 4 60 16 C66 28 56 42 42 48 C28 54 10 48 4 36 C-2 24 8 6 22 2 Z"
            fill={color}
          />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
});
