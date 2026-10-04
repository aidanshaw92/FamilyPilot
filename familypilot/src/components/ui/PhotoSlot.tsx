import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius } from '@/src/design-system/tokens';

/**
 * A place in the layout for an editorial photograph that the product does not yet own (Figma "Photo
 * slot"). The Welcome collage is composed of these. Until a real, licensed photograph is supplied
 * for a slot it renders the same category-gradient treatment a venue without a photo gets, with a
 * quiet glyph, so the composition is real and nothing is faked: no stock image, no generated image.
 *
 * A slot is decoration. It is hidden from assistive technology and ignores the pointer.
 */
export type PhotoSlotCategory = keyof typeof colors.categoryGradients;

interface PhotoSlotProps {
  /** Which gradient to show until the photograph arrives. */
  category: PhotoSlotCategory;
  /** The licensed photograph, when the product has one for this slot. */
  source?: ImageSource;
  shape?: 'rounded' | 'circle';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  testID?: string;
}

export function PhotoSlot({ category, source, shape = 'rounded', icon, style, testID }: PhotoSlotProps) {
  const [start, end] = colors.categoryGradients[category];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={testID}
      style={[styles.slot, shape === 'circle' ? styles.circle : styles.rounded, style]}
    >
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient colors={[start, end]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
          {icon ? <Ionicons name={icon} size={26} color="rgba(255,255,255,0.8)" /> : null}
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: colors.borderLight,
  },
  rounded: {
    borderRadius: radius['3xl'],
  },
  circle: {
    borderRadius: radius.full,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
