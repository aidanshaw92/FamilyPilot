import Svg, { G, Path, Rect } from 'react-native-svg';

/**
 * The three icon wells on Welcome's benefit cards, drawn from the approved frame 166:128's own vectors
 * (the sprout, the people and the sparkles; nodes 172:225-229, 179:143-148 and 172:236-237) on the
 * frame's 102px well. Decorative: the card's text names the benefit.
 */
export type BenefitIconKind = 'sprout' | 'people' | 'sparkles';

interface IconDef {
  well: string;
  paths: { d: string; x: number; y: number; fill?: string; stroke?: string; sw?: number }[];
}

const SPROUT: IconDef = {
  well: '#E9F3ED',
  paths: [
    { d: 'M29.05 26.06C11.05 27.06 -0.94 17.06 0.05 0.06C18.05 -0.93 30.05 9.06 29.05 26.06Z', x: 21.94, y: 30.43, fill: '#2F7D68' },
    { d: 'M0 25C5 9 15 0 29 0C31 17 20 27 0 25Z', x: 52, y: 30.5, fill: '#2A7561' },
    { d: 'M0.07 25C-0.42 15 1.57 8 8.57 0', x: 51.43, y: 52.5, stroke: '#2F7D68', sw: 5.5 },
    { d: 'M0 0C5 3 11 7 15 13', x: 33, y: 40.5, stroke: '#1F5A49', sw: 2.5 },
    { d: 'M17 0C10 4 4 9 0 15', x: 56, y: 38.5, stroke: '#1F5A49', sw: 2.5 },
  ],
};

const PEOPLE_STROKE = '#F4502E';
const PEOPLE: IconDef = {
  well: '#FEE9E4',
  paths: [
    { d: 'M8 0C12.4 0 16 3.59 16 8C16 12.4 12.4 16 8 16C3.59 16 0 12.4 0 8C0 3.59 3.59 0 8 0Z', x: 42.5, y: 27.3, stroke: PEOPLE_STROKE, sw: 6.2 },
    { d: 'M10.3 1.1C6.8 -1.59 0 0.9 0 5.9C0 10.9 6.8 13.4 10.3 10.7', x: 24.2, y: 34.6, stroke: PEOPLE_STROKE, sw: 6.1 },
    { d: 'M0 1.1C3.5 -1.59 10.3 0.9 10.3 5.9C10.3 10.9 3.5 13.4 0 10.7', x: 66.5, y: 34.6, stroke: PEOPLE_STROKE, sw: 6.1 },
    { d: 'M0 20.29L0 8.5C0 2.5 5.69 0 14.19 0C22.69 0 28.7 2.5 28.7 8.5L28.7 20.29L0 20.29Z', x: 36.3, y: 53, stroke: PEOPLE_STROKE, sw: 6.2 },
    { d: 'M9.8 0C2.3 0.5 0 6.5 0 10.5L0 17', x: 22.7, y: 56, stroke: PEOPLE_STROKE, sw: 6.1 },
    { d: 'M0 0C7.5 0.5 9.8 6.5 9.8 10.5L9.8 17', x: 68.5, y: 56, stroke: PEOPLE_STROKE, sw: 6.1 },
  ],
};

const SPARKLE = '#5A1FE0';
const SPARKLES: IconDef = {
  well: '#F3EBFE',
  paths: [
    { d: 'M20.25 0C23.87 16.17 25.89 18.85 40.5 22.5C25.89 26.14 23.87 28.82 20.25 45C16.62 28.82 14.6 26.14 0 22.5C14.6 18.85 16.62 16.17 20.25 0Z', x: 18.5, y: 20.7, fill: SPARKLE, stroke: SPARKLE, sw: 5 },
    { d: 'M15.75 0C18.58 12.91 20.15 15.14 31.5 18C20.15 20.85 18.58 23.08 15.75 36C12.91 23.08 11.34 20.85 0 18C11.34 15.14 12.91 12.91 15.75 0Z', x: 50, y: 47.5, fill: SPARKLE, stroke: SPARKLE, sw: 5 },
  ],
};

const ICONS: Record<BenefitIconKind, IconDef> = { sprout: SPROUT, people: PEOPLE, sparkles: SPARKLES };

export function BenefitIcon({ kind, size }: { kind: BenefitIconKind; size: number }) {
  const icon = ICONS[kind];
  return (
    <Svg width={size} height={size} viewBox="0 0 102 102" aria-hidden>
      <Rect width={102} height={102} rx={28} fill={icon.well} />
      {icon.paths.map((p, i) => (
        <G key={i} transform={`translate(${p.x} ${p.y})`}>
          <Path
            d={p.d}
            fill={p.fill ?? 'none'}
            stroke={p.stroke ?? 'none'}
            strokeWidth={p.sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ))}
    </Svg>
  );
}
