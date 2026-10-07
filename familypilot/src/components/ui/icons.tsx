import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { NavVariant } from '@/src/utils/floating-tab-bar-layout';

/**
 * The glyphs the approved Welcome, Home and Explore frames draw as their own vectors (frames 166:128,
 * 229:133 and 294:133), as lightweight local SVG. They replace the stock icon-font glyphs where those
 * read differently from the frame: the frames' icons are thin, round-capped outlines with their own
 * proportions (a pointed star, a flat-topped house, a compass with a needle), and a stock glyph is
 * visibly a different family beside them.
 *
 * Path data is the frame's own, in the frame's pixels; each component sets its viewBox to the frame
 * box it was measured in, so a glyph scales as a whole. Every glyph is decoration: the control that
 * holds it carries the accessible name, so the glyph is hidden from assistive technology.
 */

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
  'aria-hidden': true,
  pointerEvents: 'none',
} as const;

interface GlyphProps {
  /** Width of the glyph's box in points (its height follows the box's own aspect). */
  size: number;
  color: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function frame({ x, y, w, h }: Box, size: number) {
  return { width: size, height: (size * h) / w, viewBox: `${x} ${y} ${w} ${h}` };
}

/* ------------------------------------------------------------------ search, filter, heart */

/** Home "Search icon ring" + "handle" (231:134/135): a ring and a short round-capped handle. */
const SEARCH_BOX: Box = { x: 76, y: 56, w: 50, h: 50 };
export function SearchGlyph({ size, color }: GlyphProps) {
  return (
    <Svg {...frame(SEARCH_BOX, size)} fill="none" {...HIDDEN}>
      <Circle cx={98} cy={80} r={15.5} stroke={color} strokeWidth={5} />
      <Path d="M112.54 94L120.31 101.78" stroke={color} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Home "FilterButton" (231:136): two flat bars with a ringed knob each, drawn inside the frame's 99px
 * disc. `size` is the disc's diameter; the knobs are filled with the disc so the bar does not show
 * through them.
 */
const DISC_BOX: Box = { x: 0, y: 0, w: 99, h: 99 };
export function SlidersGlyph({ size, color, disc }: GlyphProps & { disc: string }) {
  return (
    <Svg {...frame(DISC_BOX, size)} fill="none" {...HIDDEN}>
      <Rect x={29} y={36.3} width={42} height={5} fill={color} />
      <Rect x={29} y={55} width={42} height={5} fill={color} />
      <Circle cx={42.9} cy={38.8} r={5.5} fill={disc} stroke={color} strokeWidth={4.6} />
      <Circle cx={57.4} cy={57.5} r={5.5} fill={disc} stroke={color} strokeWidth={4.6} />
    </Svg>
  );
}

/** Home "Heart icon" (267:157): an outlined heart; saved fills it. */
const HEART = 'M17.9 31.4C8.4 23.9 1.7 18.5 1.7 11.2C1.7 5.8 5.7 1.7 10.7 1.7C13.9 1.7 16.4 3.3 17.9 5.8C19.4 3.3 21.9 1.7 25.1 1.7C30.1 1.7 34.1 5.8 34.1 11.2C34.1 18.5 27.4 23.9 17.9 31.4Z';
const HEART_BOX: Box = { x: 0, y: 0, w: 35.8, h: 33.1 };
export function HeartGlyph({ size, color, filled }: GlyphProps & { filled?: boolean }) {
  return (
    <Svg {...frame(HEART_BOX, size)} fill="none" {...HIDDEN}>
      <Path
        d={HEART}
        stroke={color}
        strokeWidth={3.4}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

/* ------------------------------------------------------------------ arrow, chevron, star */

/**
 * The CTA arrow (Home 267:155, Explore 297:162/163, Welcome 172:241): a shaft and an open head with
 * round caps. `size` is the glyph's width.
 */
const ARROW_BOX: Box = { x: 0, y: 0, w: 33.5, h: 29.8 };
export function ArrowGlyph({ size, color }: GlyphProps) {
  return (
    <Svg {...frame(ARROW_BOX, size)} fill="none" {...HIDDEN}>
      <Path
        d="M2 14.9H31.4M18.4 2L31.4 14.9L18.4 27.8"
        stroke={color}
        strokeWidth={3.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Welcome benefit card "chevron" (172:238): a thin open chevron. `size` is its width. */
const CHEVRON_BOX: Box = { x: 0, y: 0, w: 12.6, h: 22.6 };
export function ChevronGlyph({ size, color }: GlyphProps) {
  return (
    <Svg {...frame(CHEVRON_BOX, size)} fill="none" {...HIDDEN}>
      <Path
        d="M1.8 1.8L10.8 11.3L1.8 20.8"
        stroke={color}
        strokeWidth={3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The Family Fit star (Home 267:149, Explore 297:154): a sharp five-point star. `size` is its width. */
const STAR_BOX: Box = { x: 0, y: 0, w: 28.54, h: 27.14 };
export function StarGlyph({ size, color }: GlyphProps) {
  return (
    <Svg {...frame(STAR_BOX, size)} {...HIDDEN}>
      <Path
        d="M14.27 0L18.03 9.82L28.54 10.36L20.36 16.98L23.09 27.14L14.27 21.4L5.45 27.14L8.18 16.98L0 10.36L10.51 9.82L14.27 0Z"
        fill={color}
      />
    </Svg>
  );
}

/* ------------------------------------------------------------------ navigation */

export type NavTab = 'index' | 'explore' | 'halfway' | 'trips' | 'saved' | 'profile';

/**
 * The navigation draws its icons differently in its two approved frames (see floating-tab-bar-layout):
 * Home's (node 267:165) are 4px strokes, Explore's (298:135) 4.5px with its own proportions. Each tab's
 * glyph is drawn in the frame's pixels around the tab's own centre, in a box 120px square, so the pill
 * only has to say which tab and which variant.
 *
 * `cx` is the tab's centre in the frame; every tab in a frame is one pitch from the next.
 */
const FRAME_SCALE: Record<NavVariant, number> = { home: 2.168, explore: 2.1705 };
const NAV_BOX_PX = 120;
const NAV_CENTRE: Record<NavVariant, { cx: Record<NavTab, number>; cy: number }> = {
  // A glyph is drawn around its own centre, wherever its tab sits in the pill, so the order of tabs can change without
  // touching a single vector. Halfway is drawn in the same stroke language, around a centre of its own.
  home: { cx: { index: 95, explore: 214, halfway: 690, trips: 333, saved: 452, profile: 571 }, cy: 77 },
  explore: { cx: { index: 101.7, explore: 233, halfway: 758.2, trips: 364.3, saved: 495.6, profile: 626.9 }, cy: 80 },
};

/** The box a nav glyph is drawn in, in points (the frame's 120px at its scale). */
export const NAV_GLYPH_BOX: Record<NavVariant, number> = {
  home: NAV_BOX_PX / FRAME_SCALE.home,
  explore: NAV_BOX_PX / FRAME_SCALE.explore,
};

interface NavGlyphProps {
  tab: NavTab;
  variant: NavVariant;
  color: string;
  /** The active tab. In Home's frame the active house is filled; in Explore's the compass needle is. */
  focused: boolean;
  /** What a filled shape is filled with (the colour of the disc behind the active tab). */
  fill: string;
}

export function NavGlyph({ tab, variant, color, focused, fill }: NavGlyphProps) {
  const { cx, cy } = NAV_CENTRE[variant];
  const centre = cx[tab];
  const common = { stroke: color, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const sw = variant === 'home' ? 4 : 4.5;

  // In a View so it stacks by DOM order with the active disc behind it: a bare <svg> is not positioned
  // on web, and the disc (absolutely positioned) would paint over it.
  return (
    <View pointerEvents="none">
      <Svg
        width={NAV_GLYPH_BOX[variant]}
        height={NAV_GLYPH_BOX[variant]}
        viewBox={`${centre - NAV_BOX_PX / 2} ${cy - NAV_BOX_PX / 2} ${NAV_BOX_PX} ${NAV_BOX_PX}`}
        fill="none"
        {...HIDDEN}
      >
        <G>{variant === 'home' ? homeGlyph(tab, common, sw, color, focused, fill) : exploreGlyph(tab, common, sw, color, focused)}</G>
      </Svg>
    </View>
  );
}

type Stroke = { stroke: string; strokeLinecap: 'round'; strokeLinejoin: 'round' };

function homeGlyph(tab: NavTab, c: Stroke, sw: number, color: string, focused: boolean, fill: string) {
  switch (tab) {
    case 'index':
      return (
        <Path
          d="M75 74L93 57L111 74V90C111 92 110 93 108 93H78C76 93 75 92 75 90V74Z"
          fill={focused ? fill : 'none'}
          strokeWidth={sw}
          {...c}
        />
      );
    case 'explore':
      return (
        <>
          <Circle cx={214} cy={77} r={18} stroke={color} strokeWidth={sw} />
          <Path d="M210 75L207 83L216 79L220 70L210 75Z" strokeWidth={3.4} {...c} />
        </>
      );
    case 'trips':
      return (
        <>
          <Rect x={317} y={64} width={35} height={30} rx={6} stroke={color} strokeWidth={sw} />
          <Path d="M320.5 55V63M343.5 55V63M312.5 69H351.5" strokeWidth={sw} {...c} />
        </>
      );
    case 'halfway':
      // Two families' areas either side, the meeting place between them: a pin over a dashed line that joins two dots.
      return (
        <>
          <Path d="M690 81C690 81 680 71.5 680 64.5C680 59 684.5 54.5 690 54.5C695.5 54.5 700 59 700 64.5C700 71.5 690 81 690 81Z" fill={focused ? fill : 'none'} strokeWidth={sw} {...c} />
          <Circle cx={690} cy={64.5} r={3} fill={color} />
          <Circle cx={671} cy={95} r={3.4} fill={color} />
          <Circle cx={709} cy={95} r={3.4} fill={color} />
          <Path d="M678 95H702" strokeWidth={3.2} strokeDasharray="1 6.5" {...c} />
        </>
      );
    case 'saved':
      return (
        <Path
          d="M432.5 69.5C432.5 77.5 439.5 83.5 451.5 92.5C463.5 83.5 470.5 77.5 470.5 69.5C470.5 63.5 466 58.5 460 58.5C456.5 58.5 453.3 60.3 451.5 63.5C449.7 60.3 446.5 58.5 443 58.5C437 58.5 432.5 63.5 432.5 69.5Z"
          strokeWidth={sw}
          {...c}
        />
      );
    case 'profile':
      return (
        <>
          <Circle cx={571.5} cy={68} r={7} stroke={color} strokeWidth={sw} />
          <Path d="M554.5 95C554.5 87 561.5 83 569.5 83C577.5 83 584.5 87 584.5 95" strokeWidth={sw} {...c} />
        </>
      );
  }
}

function exploreGlyph(tab: NavTab, c: Stroke, sw: number, color: string, focused: boolean) {
  switch (tab) {
    case 'index':
      return (
        <>
          <Path d="M76 81L101.5 58L127 81" strokeWidth={sw} {...c} />
          <Path d="M85 75V101H118V75" strokeWidth={sw} {...c} />
          <Path d="M96 101V86H107V101" strokeWidth={sw} {...c} />
        </>
      );
    case 'explore':
      return (
        <>
          <Circle cx={233} cy={80} r={24.75} stroke={color} strokeWidth={sw} />
          <Path
            d="M247 67L239 86L221 93L229 74L247 67Z"
            fill={focused ? color : 'none'}
            strokeWidth={focused ? 0 : 3.4}
            {...c}
          />
        </>
      );
    case 'trips':
      return (
        <>
          <Rect x={343.25} y={65.25} width={41.5} height={35.5} rx={5.75} stroke={color} strokeWidth={sw} />
          <Path d="M352 56V69M376 56V69M342 76H386" strokeWidth={sw} {...c} />
          {[84.6, 91.1, 97.6].flatMap((y) =>
            [351.6, 361.1, 370.6, 380.1].map((x) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill={color} />),
          )}
        </>
      );
    case 'halfway':
      return (
        <>
          <Path d="M758.2 85C758.2 85 746 73.5 746 65C746 58.3 751.5 53 758.2 53C764.9 53 770.4 58.3 770.4 65C770.4 73.5 758.2 85 758.2 85Z" fill={focused ? color : 'none'} strokeWidth={sw} {...c} />
          {focused ? null : <Circle cx={758.2} cy={65} r={3.6} fill={color} />}
          <Circle cx={735.2} cy={101} r={4} fill={color} />
          <Circle cx={781.2} cy={101} r={4} fill={color} />
          <Path d="M744 101H772.4" strokeWidth={3.6} strokeDasharray="1 7.5" {...c} />
        </>
      );
    case 'saved':
      return (
        <Path
          d="M495.5 100C478 87 472 79 472 71C472 63 478 58 484 58C489 58 493 61 495.5 66C498 61 502 58 507 58C513 58 519 63 519 71C519 79 513 87 495.5 100Z"
          strokeWidth={sw}
          {...c}
        />
      );
    case 'profile':
      return (
        <>
          <Circle cx={626.5} cy={68.5} r={9.25} stroke={color} strokeWidth={sw} />
          <Path d="M606 102C606 91 615 85 626.5 85C638 85 647 91 647 102H606Z" strokeWidth={sw} {...c} />
        </>
      );
  }
}
