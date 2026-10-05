import { ReactNode, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

/**
 * FamilyPilot's own illustration for a place that has no photograph.
 *
 * It exists for one situation: a REAL venue for which no provider photograph is available. It is a flat, layered
 * illustration of the venue's CATEGORY (a park, a farm, a museum), drawn in the product's palette, so the card
 * still feels designed. It can never be mistaken for a photograph of the named place: it is obviously artwork, it
 * depicts a kind of place and not that place, and the card that carries it says so to assistive technology.
 *
 * Nothing here is generated at request time and nothing is fetched: it is a few dozen vector shapes, so it costs
 * no bytes over the wire and no provider call, and it can sit behind any card at any size.
 *
 * The scene is drawn on a 300 x 400 board and scaled to FILL its box (`slice`), so the same artwork serves a tall
 * deck card, a thin Explore thumbnail and a wide venue hero. Everything that matters sits in the central band
 * (x 80 to 220, y 110 to 235), which survives all three crops and stays clear of the text a card lays over its lower
 * part.
 */
type Palette = {
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  near: string;
};

const PALETTES: Record<string, Palette> = {
  park: { skyTop: '#A9DDC4', skyBottom: '#E7F6EC', far: '#8FD3A6', mid: '#58B282', near: '#2D8B60' },
  farm: { skyTop: '#F6D79A', skyBottom: '#FFF1D6', far: '#E5C07A', mid: '#CF9E48', near: '#A4722B' },
  zoo: { skyTop: '#F3D08C', skyBottom: '#FFF0D0', far: '#DDB566', mid: '#C48F3C', near: '#8E6322' },
  museum: { skyTop: '#C9C2F6', skyBottom: '#EFEDFF', far: '#B3A9F0', mid: '#8A7DE2', near: '#5A4CC6' },
  attraction: { skyTop: '#F4BDDC', skyBottom: '#FFE9F3', far: '#EF9CC9', mid: '#D96AAA', near: '#A3116A' },
  activity: { skyTop: '#BFDDF6', skyBottom: '#EAF4FF', far: '#98C8F0', mid: '#66A4E4', near: '#3A78C2' },
  soft_play: { skyTop: '#F7C6DE', skyBottom: '#FFEEF6', far: '#F2A5CA', mid: '#E378B0', near: '#B6337E' },
  beach: { skyTop: '#B5E5F3', skyBottom: '#E8F8FC', far: '#7CD0E8', mid: '#F0D59A', near: '#E3BE72' },
  cafe: { skyTop: '#F5C9B6', skyBottom: '#FFEDE4', far: '#EEA98D', mid: '#DE8362', near: '#B24E37' },
  restaurant: { skyTop: '#F5C9B6', skyBottom: '#FFEDE4', far: '#EEA98D', mid: '#DE8362', near: '#B24E37' },
  fallback: { skyTop: '#A9DDC4', skyBottom: '#E7F6EC', far: '#8FD3A6', mid: '#58B282', near: '#2D8B60' },
};

const CREAM = '#FFF8E8';
const SUN = '#FFE9A8';

function Sparkle({ x, y, s = 1, fill = '#FFD965' }: { x: number; y: number; s?: number; fill?: string }) {
  const r = 7 * s;
  return (
    <Path
      d={`M${x} ${y - r} Q${x + 1.4 * s} ${y - 1.4 * s} ${x + r} ${y} Q${x + 1.4 * s} ${y + 1.4 * s} ${x} ${y + r} Q${x - 1.4 * s} ${y + 1.4 * s} ${x - r} ${y} Q${x - 1.4 * s} ${y - 1.4 * s} ${x} ${y - r}Z`}
      fill={fill}
    />
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G opacity={0.6} transform={`translate(${x} ${y}) scale(${s})`}>
      <Ellipse cx={0} cy={0} rx={30} ry={9} fill={CREAM} />
      <Ellipse cx={-10} cy={-7} rx={14} ry={10} fill={CREAM} />
      <Ellipse cx={9} cy={-9} rx={16} ry={12} fill={CREAM} />
    </G>
  );
}

/** The motif for each category, standing on a base line of y = 232 at the centre of the board. */
function motif(category: string, p: Palette): ReactNode {
  switch (category) {
    case 'park':
      return (
        <G>
          <Rect x={84} y={202} width={5} height={30} fill="#7A4B2A" />
          <Circle cx={86.5} cy={190} r={19} fill="#2A9468" />
          <Rect x={212} y={198} width={5} height={34} fill="#7A4B2A" />
          <Circle cx={214.5} cy={184} r={21} fill="#1F7A55" />
          <Rect x={146} y={178} width={9} height={54} rx={2} fill="#7A4B2A" />
          <Circle cx={150} cy={148} r={40} fill="#1F7A55" />
          <Circle cx={126} cy={165} r={26} fill="#2A9468" />
          <Circle cx={175} cy={163} r={28} fill="#2A9468" />
          <Circle cx={160} cy={136} r={14} fill="#37A878" opacity={0.7} />
          <Rect x={112} y={218} width={34} height={5} rx={2} fill="#C9884A" />
          <Rect x={116} y={223} width={4} height={9} fill="#7A4B2A" />
          <Rect x={138} y={223} width={4} height={9} fill="#7A4B2A" />
          <Circle cx={190} cy={228} r={3} fill="#FFD965" />
          <Circle cx={198} cy={232} r={3} fill="#FF8A7A" />
          <Circle cx={104} cy={231} r={3} fill="#FFD965" />
        </G>
      );
    case 'farm':
      return (
        <G>
          <Rect x={104} y={178} width={92} height={54} fill="#C94B3C" />
          <Path d="M96 182 L150 138 L204 182 Z" fill="#8E2F27" />
          <Rect x={140} y={160} width={20} height={14} rx={2} fill="#F6E3B4" />
          <Rect x={134} y={196} width={32} height={36} rx={2} fill="#F6E3B4" />
          <Path d="M134 196 L166 232 M166 196 L134 232" stroke="#C94B3C" strokeWidth={3} />
          <Rect x={212} y={206} width={4} height={26} fill="#F3E4C0" />
          <Rect x={232} y={206} width={4} height={26} fill="#F3E4C0" />
          <Rect x={252} y={206} width={4} height={26} fill="#F3E4C0" />
          <Rect x={208} y={212} width={52} height={3.5} fill="#F3E4C0" />
          <Rect x={208} y={223} width={52} height={3.5} fill="#F3E4C0" />
          <Circle cx={80} cy={218} r={15} fill="#E7B84F" />
          <Path d="M68 218 A12 12 0 0 1 92 218" stroke="#C99530" strokeWidth={2.5} fill="none" />
          <Ellipse cx={232} cy={196} rx={12} ry={8} fill={CREAM} />
          <Circle cx={244} cy={193} r={4.5} fill="#3A2E2A" />
        </G>
      );
    case 'museum':
      return (
        <G>
          <Rect x={149} y={112} width={2} height={26} fill={CREAM} />
          <Path d="M151 112 L172 119 L151 126 Z" fill="#FF8A7A" />
          <Path d="M94 172 L150 138 L206 172 Z" fill="#F1EEFF" />
          <Circle cx={150} cy={160} r={6} fill="#C9C3F0" />
          <Rect x={94} y={172} width={112} height={8} fill="#D9D3F7" />
          <Rect x={104} y={180} width={12} height={42} fill="#F8F6FF" />
          <Rect x={127} y={180} width={12} height={42} fill="#F8F6FF" />
          <Rect x={161} y={180} width={12} height={42} fill="#F8F6FF" />
          <Rect x={184} y={180} width={12} height={42} fill="#F8F6FF" />
          <Rect x={92} y={222} width={116} height={6} fill="#D9D3F7" />
          <Rect x={86} y={228} width={128} height={6} fill="#C3BBF0" />
        </G>
      );
    case 'zoo':
      return (
        <G>
          <Rect x={72} y={176} width={5} height={56} fill="#7A4B2A" />
          <Ellipse cx={75} cy={172} rx={30} ry={11} fill="#6E9A4B" />
          <Path d="M172 196 L186 192 L194 128 L180 128 Z" fill="#E9A93A" />
          <Rect x={108} y={186} width={78} height={34} rx={17} fill="#E9A93A" />
          <Rect x={118} y={212} width={7} height={22} rx={2} fill="#E9A93A" />
          <Rect x={132} y={212} width={7} height={22} rx={2} fill="#D79A2E" />
          <Rect x={158} y={212} width={7} height={22} rx={2} fill="#E9A93A" />
          <Rect x={172} y={212} width={7} height={22} rx={2} fill="#D79A2E" />
          <Path d="M108 196 Q96 200 98 216" stroke="#E9A93A" strokeWidth={4} fill="none" strokeLinecap="round" />
          <Ellipse cx={192} cy={124} rx={16} ry={8.5} transform="rotate(-12 192 124)" fill="#E9A93A" />
          <Rect x={184} y={110} width={2.5} height={10} fill="#8F5A18" />
          <Circle cx={185.2} cy={109} r={2.6} fill="#8F5A18" />
          <Rect x={194} y={110} width={2.5} height={10} fill="#8F5A18" />
          <Circle cx={195.2} cy={109} r={2.6} fill="#8F5A18" />
          <Circle cx={197} cy={124} r={1.8} fill="#3A2E2A" />
          <Circle cx={130} cy={198} r={5} fill="#B9741C" />
          <Circle cx={152} cy={204} r={6} fill="#B9741C" />
          <Circle cx={172} cy={196} r={4.5} fill="#B9741C" />
          <Circle cx={186} cy={158} r={3.6} fill="#B9741C" />
          <Circle cx={184} cy={176} r={3.2} fill="#B9741C" />
        </G>
      );
    case 'soft_play':
      return (
        <G>
          <Rect x={96} y={196} width={60} height={36} rx={11} fill="#F0626B" />
          <Rect x={150} y={176} width={52} height={56} rx={11} fill="#F6C945" />
          <Rect x={116} y={158} width={50} height={40} rx={11} fill="#2FB8A0" />
          <Path d="M196 168 Q232 176 240 226" stroke="#9B7BF0" strokeWidth={13} strokeLinecap="round" fill="none" />
          <Rect x={190} y={160} width={12} height={72} rx={5} fill="#7B5CF0" />
          <Circle cx={214} cy={226} r={9} fill="#F0626B" />
          <Circle cx={230} cy={228} r={8} fill="#F6C945" />
          <Circle cx={246} cy={229} r={7} fill="#2FB8A0" />
          <Circle cx={128} cy={146} r={7} fill="#FFFFFF" opacity={0.75} />
          <Sparkle x={104} y={176} s={0.7} fill={CREAM} />
        </G>
      );
    case 'activity':
      return (
        <G>
          <Rect x={92} y={229} width={5} height={14} fill="#41318F" />
          <Rect x={203} y={229} width={5} height={14} fill="#41318F" />
          <Ellipse cx={150} cy={226} rx={64} ry={13} fill="#41318F" />
          <Ellipse cx={150} cy={224} rx={56} ry={10} fill="#7B5CF0" />
          <Ellipse cx={150} cy={223} rx={44} ry={7} fill="#9B82F5" />
          <Circle cx={150} cy={170} r={23} fill="#F6C945" />
          <Path d="M135 160 Q150 172 165 160 M132 175 Q150 187 168 175" stroke="#E0A91F" strokeWidth={3} fill="none" />
          <Circle cx={108} cy={140} r={10} fill="#FF8A7A" />
          <Circle cx={196} cy={150} r={12} fill="#2FB8A0" />
          <Path d="M150 202 L150 214 M142 204 L142 212 M158 204 L158 212" stroke={CREAM} strokeWidth={2.5} strokeLinecap="round" />
        </G>
      );
    case 'attraction': {
      const gondolas = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return {
          x: 150 + 52 * Math.cos(a),
          y: 160 + 52 * Math.sin(a),
          fill: ['#FF8A7A', '#FFD965', '#2FB8A0', '#9B7BF0'][i % 4],
        };
      });
      return (
        <G>
          <Path d="M150 160 L116 234 M150 160 L184 234" stroke={CREAM} strokeWidth={6} strokeLinecap="round" />
          <Circle cx={150} cy={160} r={52} stroke={CREAM} strokeWidth={5} fill="none" />
          <Circle cx={150} cy={160} r={38} stroke={CREAM} strokeWidth={2} fill="none" opacity={0.7} />
          <Path
            d="M150 108 L150 212 M98 160 L202 160 M113 123 L187 197 M187 123 L113 197"
            stroke={CREAM}
            strokeWidth={2}
            opacity={0.8}
          />
          {gondolas.map((g, i) => (
            <Rect key={i} x={g.x - 7} y={g.y - 5} width={14} height={13} rx={4} fill={g.fill} />
          ))}
          <Circle cx={150} cy={160} r={7} fill="#FFD965" />
          <Rect x={104} y={232} width={92} height={6} rx={3} fill={CREAM} opacity={0.9} />
        </G>
      );
    }
    case 'beach':
      return (
        <G>
          <Path d="M96 188 A54 54 0 0 1 204 188 Z" fill="#FF8A7A" />
          <Path d="M132 188 A22 54 0 0 1 150 134 L150 188 Z M168 188 A22 54 0 0 0 150 134 L150 188 Z" fill={CREAM} opacity={0.9} />
          <Rect x={148} y={134} width={4} height={98} fill="#7A4B2A" />
          <Path d="M70 236 Q85 226 100 236 T130 236 T160 236 T190 236 T220 236 T250 236" stroke={CREAM} strokeWidth={4} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'cafe':
      return (
        <G>
          <Path d="M130 150 Q122 138 132 126 M150 154 Q142 138 152 122 M170 150 Q162 138 172 126" stroke={CREAM} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.7} />
          <Rect x={116} y={166} width={72} height={56} rx={16} fill={CREAM} />
          <Path d="M188 178 Q214 178 212 198 Q210 214 188 212" stroke={CREAM} strokeWidth={9} fill="none" />
          <Ellipse cx={152} cy={226} rx={58} ry={9} fill="#F3D9C8" />
          <Rect x={116} y={176} width={72} height={8} fill="#E9B8A0" opacity={0.7} />
        </G>
      );
    case 'restaurant':
      return (
        <G>
          <Circle cx={150} cy={190} r={46} fill={CREAM} />
          <Circle cx={150} cy={190} r={32} fill="#F3D9C8" />
          <Circle cx={150} cy={190} r={26} fill={CREAM} />
          <Rect x={88} y={150} width={4} height={62} rx={2} fill={CREAM} />
          <Rect x={80} y={150} width={4} height={24} rx={2} fill={CREAM} />
          <Rect x={96} y={150} width={4} height={24} rx={2} fill={CREAM} />
          <Path d="M208 150 Q222 160 214 188 L214 212 L208 212 Z" fill={CREAM} />
        </G>
      );
    default:
      return (
        <G>
          <Path d="M150 130 A34 34 0 0 1 184 164 C184 188 150 218 150 218 C150 218 116 188 116 164 A34 34 0 0 1 150 130 Z" fill={CREAM} />
          <Circle cx={150} cy={164} r={13} fill={p.near} />
        </G>
      );
  }
}

export interface CategoryArtProps {
  category?: string;
}

export function CategoryArt({ category }: CategoryArtProps) {
  const key = category && category in PALETTES ? category : 'fallback';
  const p = PALETTES[key];
  // Two instances on a page share definitions that are identical per category, so a shared id is harmless; the
  // instance id keeps even that out of the picture.
  const gid = `ca-${key}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.skyTop} />
            <Stop offset="1" stopColor={p.skyBottom} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={300} height={400} fill={`url(#${gid})`} />
        <Circle cx={226} cy={96} r={54} fill={SUN} opacity={0.22} />
        <Circle cx={226} cy={96} r={34} fill={SUN} opacity={0.95} />
        <Cloud x={62} y={104} s={1} />
        <Cloud x={238} y={176} s={0.7} />
        <Sparkle x={52} y={156} s={0.9} />
        <Sparkle x={262} y={128} s={0.7} fill={CREAM} />
        <Path d="M0 238 C60 208 128 232 186 216 S270 208 300 226 V400 H0 Z" fill={p.far} />
        {motif(key, p)}
        <Path d="M0 262 C70 236 150 268 230 246 S288 244 300 252 V400 H0 Z" fill={p.mid} />
        <Path d="M0 318 C90 292 200 326 300 300 V400 H0 Z" fill={p.near} />
      </Svg>
    </View>
  );
}
