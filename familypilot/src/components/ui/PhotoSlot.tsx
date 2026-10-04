import { Ionicons } from '@expo/vector-icons';
import type { ImageSource } from 'expo-image';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Stop } from 'react-native-svg';

import type { CutoutShape } from '@/src/assets/art/figma-art';
import { colors } from '@/src/design-system/tokens';

/**
 * A place in the layout for an editorial photograph (Figma "Photo slot"; the approved Welcome
 * frame 166:128). The Welcome collage is composed of these as organic cut-outs: each slot clips its
 * photograph to the outline the approved frame's own mask vector draws (`WELCOME_CUTOUTS`).
 *
 * Until a licensed photograph is supplied for a slot it renders the category-gradient treatment a
 * venue without a photo gets, inside the same cut-out, with a quiet glyph. That is a placeholder, not
 * the finished Welcome: no stock image and no generated image stands in for the photograph.
 *
 * A slot is decoration. It is hidden from assistive technology and ignores the pointer.
 */
export type PhotoSlotCategory = keyof typeof colors.categoryGradients;

interface PhotoSlotProps {
  /** Which gradient to show until the photograph arrives. */
  category: PhotoSlotCategory;
  /** The licensed photograph, when the product has one for this slot (a static `require`). */
  source?: ImageSource;
  /** The outline, in its own coordinates; the slot stretches it to `width` x `height`. */
  cutout: Pick<CutoutShape, 'd' | 'width' | 'height'>;
  icon?: keyof typeof Ionicons.glyphMap;
  width: number;
  height: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The approved cut-out masks outline the whole sticker, white margin included (the frame's review crops
 * are of the reference, which has that margin). So the slot paints the outline white first and keeps
 * the photograph inside a white band this wide, in frame pixels, all round.
 */
const STICKER_EDGE_PX = 11;

let clipCounter = 0;

export function PhotoSlot({ category, source, cutout, icon, width, height, style, testID }: PhotoSlotProps) {
  const [start, end] = colors.categoryGradients[category];
  // Unique per instance so two slots never share a clip definition on web.
  const id = `photo-slot-${(clipCounter += 1)}`;
  const transform = `scale(${width / cutout.width} ${height / cutout.height})`;
  const href = typeof source === 'string' ? { uri: source } : (source as never);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={testID}
      style={[styles.slot, { width, height }, style]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <ClipPath id={`${id}-clip`}>
            <Path d={cutout.d} transform={transform} />
          </ClipPath>
          <LinearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={start} />
            <Stop offset="1" stopColor={end} />
          </LinearGradient>
        </Defs>
        <Path d={cutout.d} transform={transform} fill={colors.surface} />
        <G clipPath={`url(#${id}-clip)`}>
          <Path d={cutout.d} transform={transform} fill={`url(#${id}-fill)`} />
          {source ? (
            <SvgImage href={href} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
          ) : null}
          <Path
            d={cutout.d}
            transform={transform}
            fill="none"
            stroke={colors.surface}
            strokeWidth={STICKER_EDGE_PX * 2}
            strokeLinejoin="round"
          />
        </G>
      </Svg>
      {!source && icon ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.glyph}>
            <Ionicons name={icon} size={Math.round(Math.min(width, height) * 0.2)} color="rgba(255,255,255,0.8)" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
  },
  glyph: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
