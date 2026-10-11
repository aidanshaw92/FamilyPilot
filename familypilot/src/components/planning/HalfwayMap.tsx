import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/src/components/ui';
import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';
import { BASEMAP_SOURCE } from '@/src/data/london-basemap';
import { HalfwayMapInput, halfwayMapModel } from '@/src/services/planning/halfway-map';

const DEFAULT_HEIGHT = 220;
const LAND = '#F4F1EA';
const BOUNDARY = '#DDD6C8';
const WATER = '#B9D3E4';
const MOTORWAY = '#E8C98A';
const ROAD = '#E4DCCB';
const OTHER = '#B0507E';
/** The tappable area over a pin: the app's minimum target, centred on the pin. */
const HIT = 44;

/**
 * Where the two families and the places are, on a map of London drawn on the device (see halfway-map.ts for the
 * privacy and no-route rules). Families are approximate AREAS; the places are numbered pins, each number matching its
 * recommendation card, and the selected one is named. Tapping a pin selects that place. Nothing is fetched to draw it.
 *
 * The pins are tapped through plain pressables laid over the drawing rather than through the SVG itself: a pressable
 * element inside an SVG is not valid markup on the web build, where it rendered as nothing at all.
 */
export function HalfwayMap({
  onSelectPin,
  height = DEFAULT_HEIGHT,
  legend = true,
  ...props
}: HalfwayMapInput & {
  onSelectPin?: (id: string) => void;
  height?: number;
  /** The legend and the source line under the frame; off when the screen says these once elsewhere. */
  legend?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const model = width > 0 ? halfwayMapModel(props, { width, height }) : null;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  // Without usable positions there is nothing honest to draw: the journeys below still say how far each family is.
  if (width > 0 && !model) return null;

  const name = (label: string) => (label.length > 28 ? `${label.slice(0, 27)}…` : label);

  return (
    <View style={styles.wrap} testID="halfway-map">
      <View style={[styles.frame, { height }]} onLayout={onLayout}>
        {model ? (
          <>
            <View accessible accessibilityRole="image" accessibilityLabel={model.summary}>
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
                {/* The places: numbered as the cards are, the selected one larger, filled and named; the others outlined.
                    The selected pin is drawn last so it sits on top where pins crowd. */}
                {model.pins.length > 0 ? (
                  model.pins.map((pin) => {
                    const r = pin.selected ? 14 : 11;
                    return (
                      <G key={pin.id}>
                        <Circle cx={pin.x} cy={pin.y} r={r} fill={pin.selected ? colors.action : colors.surface} stroke={pin.selected ? colors.surface : colors.action} strokeWidth={2} />
                        <SvgText x={pin.x} y={pin.y + (pin.selected ? 5 : 4)} fill={pin.selected ? colors.text.inverse : colors.action} fontSize={pin.selected ? 13 : 11} fontFamily={fontFamily.bold} textAnchor="middle">
                          {String(pin.number)}
                        </SvgText>
                      </G>
                    );
                  })
                ) : (
                  // One place only (no list to number): a pin, where it is.
                  <G>
                    <Path
                      d={`M${model.venue.x} ${model.venue.y}c0 0-11-11.5-11-19a11 11 0 0 1 22 0c0 7.5-11 19-11 19z`}
                      fill={colors.action}
                      stroke={colors.surface}
                      strokeWidth={2}
                    />
                    <Circle cx={model.venue.x} cy={model.venue.y - 19} r={4} fill={colors.surface} />
                  </G>
                )}
                {/* The selected place's name, with a halo of the land colour under the ink so it reads over roads and water. */}
                {[LAND, colors.ink].map((fill, index) => (
                  <SvgText
                    key={fill}
                    x={model.venueLabel.x}
                    y={model.venueLabel.y + (model.pins.length > 0 ? 6 : 0)}
                    fill={fill}
                    stroke={index === 0 ? LAND : undefined}
                    strokeWidth={index === 0 ? 3 : undefined}
                    fontSize={12}
                    fontFamily={fontFamily.semiBold}
                    textAnchor={model.venueLabel.anchor}
                  >
                    {name(model.venue.label)}
                  </SvgText>
                ))}
                {/* Scale bar, bottom left. */}
                <G>
                  <Rect x={10} y={model.height - 16} width={model.scale.px} height={3} fill={colors.text.secondary} rx={1.5} />
                  <SvgText x={10} y={model.height - 22} fill={colors.text.secondary} fontSize={10} fontFamily={fontFamily.medium}>
                    {`${model.scale.km} km`}
                  </SvgText>
                </G>
              </Svg>
            </View>
            {/* The pins' tap targets, over the drawing, one per numbered place. */}
            {model.pins.map((pin) => (
              <Pressable
                key={pin.id}
                accessibilityRole="button"
                accessibilityLabel={`${pin.number}. ${pin.label}${pin.selected ? ', selected' : ''}`}
                accessibilityState={{ selected: pin.selected }}
                onPress={onSelectPin ? () => onSelectPin(pin.id) : undefined}
                style={[styles.hit, { left: pin.x - HIT / 2, top: pin.y - HIT / 2 }]}
                testID={pin.selected ? 'halfway-map-venue' : `halfway-map-pin-${pin.number}`}
              />
            ))}
          </>
        ) : (
          <View style={{ height }} />
        )}
      </View>
      {legend ? (
        <>
          {/* What the map shows, in plain words: two rough areas and the numbered places. Nothing on it is a route or an address. */}
          <View style={styles.legend} testID="halfway-map-legend">
            <View style={styles.legendItem}>
              <View style={[styles.legendArea, { borderColor: colors.action, backgroundColor: `${colors.action}29` }]} />
              <Text variant="caption" color={colors.text.secondary}>
                Roughly where you set off from
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendArea, { borderColor: OTHER, backgroundColor: `${OTHER}29` }]} />
              <Text variant="caption" color={colors.text.secondary}>
                Roughly where {props.other.label} sets off from
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendPin}>
                <Text style={styles.legendPinText}>1</Text>
              </View>
              <Text variant="caption" color={colors.text.secondary}>
                {props.venues && props.venues.length > 1 ? 'The places below, numbered in the same order; the filled one is selected' : `${props.venue.name}, where it is`}
              </Text>
            </View>
          </View>
          <Text variant="caption" color={colors.text.tertiary}>
            Each shaded circle is about 1.5 km across, never a home address. No routes are drawn, because journey times are
            estimated from distance rather than measured. Map: {BASEMAP_SOURCE}.
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  legend: { gap: 2, paddingTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendArea: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed' },
  legendPin: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  legendPinText: { color: colors.text.inverse, fontFamily: 'Inter_700Bold', fontSize: 9, lineHeight: 11 },
  hit: { position: 'absolute', width: HIT, height: HIT, borderRadius: HIT / 2 },
  frame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: LAND,
  },
});
