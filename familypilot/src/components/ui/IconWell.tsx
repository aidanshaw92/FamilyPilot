import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius } from '@/src/design-system/tokens';

/**
 * A tinted square behind an icon (Figma "Icon well"): 48 with a 16 radius, one of the three accent
 * tints, and the icon in that tint's saturated partner. The yellow well keeps a green icon, because
 * yellow on yellow does not read. The tint is decorative and chosen by the caller for variety, not
 * to mean anything.
 */
export type IconWellTint = 'mint' | 'blush' | 'lilac' | 'yellow';

interface IconWellProps {
  icon: keyof typeof Ionicons.glyphMap;
  tint?: IconWellTint;
  size?: number;
  style?: ViewStyle;
}

const FILL: Record<IconWellTint, string> = {
  mint: colors.tint.mint,
  blush: colors.tint.blush,
  lilac: colors.tint.lilac,
  yellow: colors.tint.yellow,
};

const INK: Record<IconWellTint, string> = {
  mint: colors.brand.green,
  blush: colors.brand.coral,
  lilac: colors.brand.violet,
  yellow: colors.action,
};

export function IconWell({ icon, tint = 'mint', size = 48, style }: IconWellProps) {
  return (
    <View
      style={[
        styles.well,
        { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: FILL[tint] },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={INK[tint]} />
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
});
