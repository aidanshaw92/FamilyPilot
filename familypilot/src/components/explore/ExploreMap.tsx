import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/src/components/ui';
import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';
import { BASEMAP_SOURCE } from '@/src/data/london-basemap';
import { exploreMapModel, MAX_MAP_PINS } from '@/src/services/explore/explore-map';

const LAND = '#F4F1EA';
const BOUNDARY = '#DDD6C8';
const WATER = '#B9D3E4';
const MOTORWAY = '#E8C98A';
const ROAD = '#E4DCCB';

/**
 * The places on a map of London drawn on the device, numbered as the list is (see explore-map.ts for the privacy and no-route
 * rules). Where you are looking from is an approximate area, never a point; tapping a pin selects that place. Nothing is fetched.
 * The pins are plain pressables laid over the drawing, as on the Meet halfway map, because a pressable inside an SVG is not valid
 * markup on the web build.
 */
export function ExploreMap({
  anchor,
  radiusMiles,
  places,
  selectedId,
  onSelect,
  height = 300,
}: {
  anchor: { latitude: number; longitude: number };
  radiusMiles: number | null;
  places: { id: string; name: string; latitude: number; longitude: number }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const model = useMemo(
    () => (width > 0 ? exploreMapModel({ anchor, radiusMiles, pins: places, selectedId }, { width, height }) : null),
    [width, height, anchor, radiusMiles, places, selectedId],
  );
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View style={styles.wrap} testID="explore-map">
      <View style={[styles.frame, { height }]} onLayout={onLayout}>
        {model ? (
          <>
            <View accessible accessibilityRole="image" accessibilityLabel={model.summary}>
              <Svg width={model.width} height={model.height}>
                <Rect x={0} y={0} width={model.width} height={model.height} fill={LAND} />
                <G>
                  {model.basemap.areas.map((d, i) => <Path key={`a${i}`} d={d} fill="none" stroke={BOUNDARY} strokeWidth={1} />)}
                  {model.basemap.roads.map((d, i) => <Path key={`r${i}`} d={d} fill="none" stroke={ROAD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
                  {model.basemap.motorways.map((d, i) => <Path key={`m${i}`} d={d} fill="none" stroke={MOTORWAY} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />)}
                  {model.basemap.river.map((d, i) => <Path key={`w${i}`} d={d} fill="none" stroke={WATER} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />)}
                </G>
                {model.ring ? (
                  <G testID="explore-map-ring">
                    <Circle cx={model.area.x} cy={model.area.y} r={model.ring.r} fill={colors.action} fillOpacity={0.05} stroke={colors.action} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="6 5" />
                  </G>
                ) : null}
                <G testID="explore-map-area">
                  <Circle cx={model.area.x} cy={model.area.y} r={model.area.r} fill={colors.action} fillOpacity={0.16} stroke={colors.action} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 3" />
                  <SvgText x={model.area.x} y={model.area.y - model.area.r - 5} fill={colors.action} fontSize={12} fontFamily={fontFamily.semiBold} textAnchor="middle">Your area</SvgText>
                </G>
                {model.pins.filter((pin) => pin.nudged).map((pin) => (
                  <G key={`at-${pin.id}`}>
                    <Path d={`M${pin.at.x} ${pin.at.y}L${pin.x} ${pin.y}`} stroke={colors.action} strokeOpacity={0.45} strokeWidth={1} />
                    <Circle cx={pin.at.x} cy={pin.at.y} r={3} fill={colors.action} stroke={colors.surface} strokeWidth={1} />
                  </G>
                ))}
                {model.pins.map((pin) => {
                  const r = pin.selected ? 17 : 13;
                  return (
                    <G key={pin.id}>
                      <Circle cx={pin.x} cy={pin.y} r={r} fill={pin.selected ? colors.action : colors.surface} stroke={pin.selected ? colors.surface : colors.action} strokeWidth={2} />
                      <SvgText x={pin.x} y={pin.y + (pin.selected ? 6 : 4.5)} fill={pin.selected ? colors.text.inverse : colors.action} fontSize={pin.selected ? 16 : 12} fontFamily={fontFamily.bold} textAnchor="middle">{String(pin.number)}</SvgText>
                    </G>
                  );
                })}
                <G>
                  <Rect x={10} y={model.height - 16} width={model.scale.px} height={3} fill={colors.text.secondary} rx={1.5} />
                  <SvgText x={10} y={model.height - 22} fill={colors.text.secondary} fontSize={10} fontFamily={fontFamily.medium}>{`${model.scale.km} km`}</SvgText>
                  {model.ring ? <SvgText x={model.width - 10} y={model.height - 22} fill={colors.text.secondary} fontSize={10} fontFamily={fontFamily.medium} textAnchor="end">{`Dashed ring: ${model.ring.label}`}</SvgText> : null}
                </G>
              </Svg>
            </View>
            {model.pins.map((pin) => (
              <Pressable
                key={pin.id}
                accessibilityRole="button"
                accessibilityLabel={`${pin.number}. ${pin.label}${pin.selected ? ', selected' : ''}`}
                accessibilityState={{ selected: pin.selected }}
                onPress={() => onSelect(pin.id)}
                style={[styles.hit, { left: pin.x - pin.hit / 2, top: pin.y - pin.hit / 2, width: pin.hit, height: pin.hit, borderRadius: pin.hit / 2 }]}
                testID={`explore-map-pin-${pin.number}`}
              />
            ))}
          </>
        ) : (
          <View style={{ height }} />
        )}
      </View>
      <Text variant="caption" color={colors.text.tertiary}>
        Your area is drawn as a circle about 1.5 km across, never an address. No routes are drawn: journey times are estimated from distance, not
        measured.{model && model.omitted > 0 ? ` The map numbers the first ${MAX_MAP_PINS} places; the list has the other ${model.omitted}.` : ''} Map: {BASEMAP_SOURCE}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  frame: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, backgroundColor: LAND },
  hit: { position: 'absolute' },
});
