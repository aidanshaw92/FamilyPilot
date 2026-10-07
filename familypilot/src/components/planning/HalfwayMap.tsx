import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/src/components/ui';
import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';
import { BASEMAP_SOURCE } from '@/src/data/london-basemap';
import { HalfwayMapInput, halfwayMapModel } from '@/src/services/planning/halfway-map';

const HEIGHT = 220;
const LAND = '#F4F1EA';
const BOUNDARY = '#DDD6C8';
const WATER = '#B9D3E4';
const MOTORWAY = '#E8C98A';
const ROAD = '#E4DCCB';
const OTHER = '#B0507E';

/**
 * Where the two families and the place are, on a map of London drawn on the device (see halfway-map.ts for the
 * privacy and no-route rules). Families are approximate AREAS; the venue is a pin. Nothing is fetched to draw it.
 */
export function HalfwayMap(props: HalfwayMapInput) {
  const [width, setWidth] = useState(0);
  const model = width > 0 ? halfwayMapModel(props, { width, height: HEIGHT }) : null;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  // Without usable positions there is nothing honest to draw: the journeys below still say how far each family is.
  if (width > 0 && !model) return null;

  return (
    <View style={styles.wrap} testID="halfway-map">
      <View
        style={styles.frame}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={model?.summary ?? 'Map of where you would meet'}
      >
        {model ? (
          <Svg width={model.width} height={model.height}>
            <Rect x={0} y={0} width={model.width} height={model.height} fill={LAND} />
            <G>
              {model.basemap.areas.map((d, i) => (
                <Path key={`a${i}`} d={d} fill="none" stroke={BOUNDARY} strokeWidth={1} />
              ))}
              {model.basemap.roads.map((d, i) => (
                <Path key={`r${i}`} d={d} fill="none" stroke={ROAD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {model.basemap.motorways.map((d, i) => (
                <Path key={`m${i}`} d={d} fill="none" stroke={MOTORWAY} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {model.basemap.river.map((d, i) => (
                <Path key={`w${i}`} d={d} fill="none" stroke={WATER} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </G>
            {/* Approximate areas: soft circles with a dashed edge, never a dot that could be read as a house. */}
            {model.areas.map((area) => {
              const tone = area.role === 'mine' ? colors.action : OTHER;
              return (
                <G key={area.role} testID={`halfway-map-area-${area.role}`}>
                  <Circle cx={area.x} cy={area.y} r={area.r} fill={tone} fillOpacity={0.16} stroke={tone} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 3" />
                  <SvgText x={area.labelX} y={area.labelY} fill={tone} fontSize={12} fontFamily={fontFamily.semiBold} textAnchor={area.labelAnchor}>
                    {area.label}
                  </SvgText>
                </G>
              );
            })}
            {/* The venue: a real public place, shown where it is. */}
            <G testID="halfway-map-venue">
              <Path
                d={`M${model.venue.x} ${model.venue.y}c0 0-11-11.5-11-19a11 11 0 0 1 22 0c0 7.5-11 19-11 19z`}
                fill={colors.action}
                stroke={colors.surface}
                strokeWidth={2}
              />
              <Circle cx={model.venue.x} cy={model.venue.y - 19} r={4} fill={colors.surface} />
            </G>
            {/* Scale bar, bottom left. */}
            <G>
              <Rect x={10} y={model.height - 16} width={model.scale.px} height={3} fill={colors.text.secondary} rx={1.5} />
              <SvgText x={10} y={model.height - 22} fill={colors.text.secondary} fontSize={10} fontFamily={fontFamily.medium}>
                {`${model.scale.km} km`}
              </SvgText>
            </G>
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <Text variant="caption" color={colors.text.secondary}>
        Shaded circles are rough areas, never a home address. No routes are drawn: journey times are estimates. Map:{' '}
        {BASEMAP_SOURCE}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  frame: {
    height: HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: LAND,
  },
});
