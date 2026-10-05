import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spring, timing } from '@/src/design-system/animations/presets';
import { colors, radius } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

import { Text } from './Text';
import { MIN_TARGET } from './touch';


/**
 * From the approved frame "01 — Home" (node "Category pills"): 44pt chips, 20 of padding either
 * side, 10 between, and an 18pt line box. The selected chip goes near-black; the idle one is plain
 * white or one of the identity's tints. This is the one selection pill in the app — the Home rail,
 * Explore's categories, Saved's filters, the plan sheet's choices and the onboarding options all
 * render it. The selected chip is the action green.
 */
export const CHIP_HEIGHT = 44;
export const CHIP_PADDING_X = 20;
export const CHIP_GAP = 10;
const CHIP_FONT_SIZE = 14.5;
const CHIP_LINE_HEIGHT = 18;

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /**
   * `plain` is the frame's rail pill: white with no outline, for the app background where white
   * already separates it. `outlined` keeps a hairline when idle, for chips that sit on a white
   * sheet or card and would otherwise vanish.
   */
  appearance?: 'plain' | 'outlined';
  /**
   * `default` is Home's 44pt rail pill. `small` is the approved Create a plan sheet's option chip
   * (frame 04, node 76:31): 40 tall, 16 either side, 13.5 text, a quiet grey fill when idle and the
   * same near-black when chosen. Both are the same component so a chosen chip reads the same way
   * everywhere; only the size differs.
   */
  size?: 'default' | 'small' | 'home' | 'explore';
  /**
   * An idle chip in a rail may carry one of the identity's three tints (the references give the
   * Home and Explore rails mint, blush and lilac after the selected chip). The tint is assigned by
   * POSITION (see `railTint`), never by what the chip means, so it carries no information. A
   * tinted chip has no hairline; the fill separates it. Selected is always the action green.
   */
  tint?: ChipTint;
  style?: ViewStyle;
}

export type ChipTint = 'none' | 'mint' | 'blush' | 'lilac';

const RAIL_TINTS: ChipTint[] = ['mint', 'blush', 'lilac'];

/** The tint for the n-th idle chip in a rail (0-based, counting every chip), rotating mint, blush, lilac. */
export function railTint(index: number): ChipTint {
  return RAIL_TINTS[((index % RAIL_TINTS.length) + RAIL_TINTS.length) % RAIL_TINTS.length];
}

const TINT_FILL: Record<ChipTint, string | null> = {
  none: null,
  mint: colors.tint.mint,
  blush: colors.tint.blush,
  lilac: colors.tint.lilac,
};

export const SMALL_CHIP_HEIGHT = 40;
export const SMALL_CHIP_GAP = 8;

/**
 * The two approved rails. Home (frame 229:133): 94px / 2.168 = 43.4 tall (44 keeps the touch target),
 * label Medium 30.4px = 14, 16 of padding so all four fit a 393 phone as the frame shows them.
 * Explore (frame 294:133): 90px / 2.17 = 41.5 tall, label 29px = 13.4, 22 of padding, 6 between.
 * Both are the same chip; only the rail's size differs.
 */
export const HOME_CHIP = { height: 44, paddingX: 16, fontSize: 14, lineHeight: 17, gap: 10 } as const;
export const EXPLORE_CHIP = { height: 42, paddingX: 22, fontSize: 13.4, lineHeight: 16, gap: 6 } as const;

export function Chip({ label, active = false, onPress, appearance = 'outlined', size = 'default', tint = 'none', style }: ChipProps) {
  const reducedMotion = useReducedMotion();
  const activeProgress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(1);
  const small = size === 'small';
  const rail = size === 'home' ? HOME_CHIP : size === 'explore' ? EXPLORE_CHIP : null;
  const tintFill = TINT_FILL[tint];
  const idleFill = tintFill ?? (small ? colors.fill : colors.surface);
  const idleBorder = appearance === 'outlined' && !small && !tintFill ? colors.border : idleFill;

  useEffect(() => {
    activeProgress.value = reducedMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, timing.fast);
  }, [active, activeProgress, reducedMotion]);

  const handlePress = () => {
    void Haptics.selectionAsync();
    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(activeProgress.value, [0, 1], [idleFill, colors.action]),
    borderColor: interpolateColor(activeProgress.value, [0, 1], [idleBorder, colors.action]),
    transform: [{ scale: pressed.value }],
  }));

  // A rail chip can be drawn under 44pt (Explore's frame draws it at 42). The pressable is the 44pt
  // target and the pill is drawn inside it, so the frame's size and a real target both hold on the web,
  // where hitSlop is ignored.
  const drawnHeight = rail ? rail.height : small ? SMALL_CHIP_HEIGHT : CHIP_HEIGHT;
  const targetHeight = Math.max(MIN_TARGET, drawnHeight);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      // react-native-web does not turn accessibilityState into ARIA, so without this the selected chip is
      // told by colour alone on the web. Native reads accessibilityState above.
      {...({ 'aria-pressed': active } as object)}
      accessibilityLabel={label}
      onPress={handlePress}
      onPressIn={() => {
        pressed.value = withSpring(0.95, spring.snappy);
      }}
      onPressOut={() => {
        pressed.value = withSpring(1, spring.gentle);
      }}
      // The extra height is taken back out of the layout, so a 40 or 42pt chip occupies 40 or 42pt.
      style={[styles.target, { height: targetHeight, marginVertical: -(targetHeight - drawnHeight) / 2 }, style]}
    >
      <Animated.View
        style={[
          styles.chip,
          (appearance === 'plain' || small || tintFill) && styles.plain,
          small && styles.small,
          rail && { height: rail.height, paddingHorizontal: rail.paddingX },
          animatedStyle,
        ]}
      >
        <Text
          variant="bodySmall"
          color={active ? colors.text.inverse : colors.ink}
          style={[
            styles.label,
            small && styles.smallLabel,
            small && active && styles.smallLabelActive,
            rail && { fontSize: rail.fontSize, lineHeight: rail.lineHeight },
            rail && active && styles.smallLabelActive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    justifyContent: 'center',
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: CHIP_PADDING_X,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // No hairline at all, not a white one: a border is inside the 44pt box, so even an invisible one
  // moves the label a pixel and widens the frame's pills by two.
  plain: {
    borderWidth: 0,
  },
  // Node 76:31: 40 tall, 16 either side, no hairline (the grey fill separates it from the sheet).
  small: {
    height: SMALL_CHIP_HEIGHT,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: CHIP_FONT_SIZE,
    lineHeight: CHIP_LINE_HEIGHT,
  },
  smallLabel: {
    fontSize: 13.5,
    lineHeight: 16,
  },
  // The frame sets the chosen small chip in SemiBold (node 76:34).
  smallLabelActive: {
    fontFamily: 'Inter_600SemiBold',
  },
});
