import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '@/src/design-system/tokens';

const SKIN = '#F0C29A';
const HAIR_DARK = '#3B2A20';
const HAIR_WARM = '#7A4B32';
const TROUSERS = '#33334D';
const TRUNK = '#9C7148';

/** A simple, original flat-style illustration of a family walking together — deliberately
 * drawn from basic shapes in the app's own palette rather than any external reference art. */
export function FamilyHeroIllustration() {
  return (
    <Svg viewBox="0 0 320 200" width="100%" height="100%">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.primary[50]} />
          <Stop offset="1" stopColor={colors.accent[50]} />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={320} height={200} rx={24} fill="url(#sky)" />
      <Circle cx={34} cy={28} r={14} fill={colors.warning[100]} opacity={0.7} />

      {/* Soft skyline */}
      <Rect x={130} y={58} width={22} height={90} rx={4} fill={colors.slateBlue} opacity={0.14} />
      <Rect x={156} y={44} width={26} height={104} rx={4} fill={colors.steelBlue} opacity={0.12} />

      {/* Ground */}
      <Path d="M0,168 Q160,142 320,168 L320,200 L0,200 Z" fill={colors.secondary[50]} />

      {/* Trees */}
      <Rect x={26} y={130} width={5} height={42} fill={TRUNK} opacity={0.7} />
      <Circle cx={28} cy={118} r={15} fill={colors.secondary[100]} />
      <Rect x={295} y={126} width={5} height={42} fill={TRUNK} opacity={0.7} />
      <Circle cx={297} cy={114} r={16} fill={colors.secondary[100]} />

      {/* Child */}
      <Rect x={57} y={162} width={6} height={20} rx={3} fill={TROUSERS} />
      <Rect x={69} y={162} width={6} height={20} rx={3} fill={TROUSERS} />
      <Rect x={52} y={124} width={20} height={40} rx={10} fill={colors.accent[500]} />
      <Circle cx={62} cy={108} r={12} fill={SKIN} />
      <Path d="M50,108 A12,12 0 0 1 74,108 L74,103 A12,9 0 0 0 50,103 Z" fill={HAIR_DARK} />

      {/* Dad */}
      <Rect x={112} y={152} width={9} height={30} rx={4} fill={TROUSERS} />
      <Rect x={132} y={152} width={9} height={30} rx={4} fill={TROUSERS} />
      <Rect x={104} y={96} width={46} height={58} rx={16} fill={colors.coral} />
      <Rect x={90} y={118} width={16} height={9} rx={4.5} fill={colors.coral} />
      <Circle cx={127} cy={80} r={17} fill={SKIN} />
      <Path d="M110,80 A17,17 0 0 1 144,80 L144,73 A17,14 0 0 0 110,73 Z" fill={HAIR_DARK} />

      {/* Mum */}
      <Path
        d="M168,100 Q158,100 156,110 L149,165 Q149,172 157,172 L201,172 Q209,172 209,165 L202,110 Q200,100 190,100 Z"
        fill={colors.secondary[500]}
      />
      <Rect x={169} y={168} width={8} height={16} rx={3} fill={TROUSERS} />
      <Rect x={185} y={168} width={8} height={16} rx={3} fill={TROUSERS} />
      <Circle cx={179} cy={84} r={15} fill={SKIN} />
      <Path
        d="M164,84 A15,15 0 0 1 194,84 A15,19 0 0 1 188,102 L170,102 A15,19 0 0 1 164,84 Z"
        fill={HAIR_WARM}
      />
      <Circle cx={179} cy={67} r={7} fill={HAIR_WARM} />

      {/* Pushchair */}
      <Path d="M222,145 Q205,132 196,150" fill="none" stroke={colors.primary[600]} strokeWidth={5} strokeLinecap="round" />
      <Path d="M218,120 Q249,90 280,120" fill="none" stroke={colors.primary[500]} strokeWidth={10} strokeLinecap="round" />
      <Rect x={222} y={120} width={52} height={38} rx={14} fill={colors.primary[600]} />
      <Circle cx={249} cy={112} r={9} fill={SKIN} />
      <Circle cx={236} cy={182} r={10} fill={colors.text.primary} opacity={0.16} />
      <Circle cx={262} cy={182} r={10} fill={colors.text.primary} opacity={0.16} />
    </Svg>
  );
}
