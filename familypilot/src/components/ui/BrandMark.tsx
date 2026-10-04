import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';

import { colors } from '@/src/design-system/tokens';

/**
 * The FamilyPilot mark (approved direction E3; Figma "Brand / Mark"): a leader on its point and two
 * followers of different sizes tucked behind it, with the cuts of light carrying the movement. One
 * mark at every size; no arrow, no yellow point, no other variants.
 *
 * Geometry is the Figma component's, on a 120 grid: leader a 54 soft square rotated 45° about
 * (73, 60) with three corners of radius 25 and the forward corner 11; followers r18 at (40, 38) and
 * r15 at (42, 84), cut by the leader grown by a kerf that never falls below ~1.3px on screen.
 * `scripts/brand/render-brand-assets.mjs` draws the same shape for the app icon and favicon.
 *
 * `tone`: `light` on the canvas or white (green leader, mid-green followers); `green` on the deep
 * green (white leader, mint followers); `mono` for one colour in ink; `inverse` white on ink.
 */
export type BrandMarkTone = 'light' | 'green' | 'mono' | 'inverse';

interface BrandMarkProps {
  size?: number;
  tone?: BrandMarkTone;
  style?: ViewStyle;
  testID?: string;
}

const TONES: Record<BrandMarkTone, { leader: string; follower: string }> = {
  light: { leader: colors.action, follower: colors.brand.green },
  green: { leader: colors.text.inverse, follower: colors.brand.mint },
  mono: { leader: colors.ink, follower: colors.ink },
  inverse: { leader: colors.text.inverse, follower: colors.text.inverse },
};

const GRID = 120;
const LEADER = { size: 54, big: 25, point: 11, cx: 73, cy: 60 };

function leaderPath(grow: number): string {
  const s = LEADER.size + grow * 2;
  const b = LEADER.big + grow;
  const p = LEADER.point + grow;
  return [
    `M ${b} 0`, `L ${s - b} 0`, `A ${b} ${b} 0 0 1 ${s} ${b}`,
    `L ${s} ${s - p}`, `A ${p} ${p} 0 0 1 ${s - p} ${s}`,
    `L ${b} ${s}`, `A ${b} ${b} 0 0 1 0 ${s - b}`,
    `L 0 ${b}`, `A ${b} ${b} 0 0 1 ${b} 0`, 'Z',
  ].join(' ');
}

function leaderTransform(grow: number): string {
  const s = LEADER.size + grow * 2;
  return `translate(${LEADER.cx} ${LEADER.cy}) rotate(45) translate(${-s / 2} ${-s / 2})`;
}

export function BrandMark({ size = 32, tone = 'light', style, testID }: BrandMarkProps) {
  const { leader, follower } = TONES[tone];
  // The kerf is 3 on the grid but never thinner than 1.3 points on screen, so a 16pt mark keeps
  // its two seams instead of melting into one shape.
  const kerf = Math.max(3, 1.3 * (GRID / size));
  const maskId = `fp-mark-cut-${size}-${tone}`;
  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityRole="image"
      accessibilityLabel="FamilyPilot"
      testID={testID}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
        <Defs>
          <Mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={GRID} height={GRID}>
            <Rect width={GRID} height={GRID} fill="#fff" />
            <Path d={leaderPath(kerf)} transform={leaderTransform(kerf)} fill="#000" />
          </Mask>
        </Defs>
        <G fill={follower} mask={`url(#${maskId})`}>
          <Circle cx={40} cy={38} r={18} />
          <Circle cx={42} cy={84} r={15} />
        </G>
        <Path d={leaderPath(0)} transform={leaderTransform(0)} fill={leader} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
