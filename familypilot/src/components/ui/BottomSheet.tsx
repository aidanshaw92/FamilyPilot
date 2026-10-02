import { ReactNode, useEffect } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

/**
 * A sheet that rises over the screen it belongs to, leaving that screen readable behind it.
 *
 * Deliberately not React Native's `Modal`. The approved Create a Plan design keeps the venue visible
 * and recognisable behind the scrim, which is the whole reason it is a sheet rather than a page, and
 * a `Modal` on web mounts into its own layer where the screen underneath stops being part of the
 * same scroll context. Rendering in place keeps the venue exactly where the parent left it.
 *
 * Geometry comes from the approved 393x852 reference: 640 tall, 42% scrim, 34 corner radius, grabber.
 * The height is expressed as a share of the viewport rather than a fixed 640, so the proportion the
 * design chose survives on a 360-wide phone and on a tall one -- with a cap, because a sheet that
 * grows without limit stops reading as a sheet.
 */

/** 640 / 852 from the approved reference. */
const SHEET_HEIGHT_RATIO = 640 / 852;
/** Below this, the sheet would have less room than its own content needs. */
const MIN_SHEET_HEIGHT = 420;
/** Past this it stops reading as a sheet over a screen. */
const MAX_SHEET_HEIGHT = 720;

export function bottomSheetHeight(viewportHeight: number): number {
  const ideal = viewportHeight * SHEET_HEIGHT_RATIO;
  // Never taller than the viewport itself, whatever the floor says: on a very short viewport the
  // minimum would otherwise push the sheet off-screen and take its actions with it.
  const capped = Math.min(MAX_SHEET_HEIGHT, Math.max(MIN_SHEET_HEIGHT, ideal));
  return Math.min(capped, viewportHeight);
}

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Announced to assistive technology as the sheet's purpose. */
  accessibilityLabel: string;
  /** Test hook for the sheet surface itself. */
  testID?: string;
}

export function BottomSheet({ visible, onClose, children, accessibilityLabel, testID }: BottomSheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Android's hardware back closes the sheet rather than leaving the venue, which is what a parent
  // expects from something that slid up over what they were reading.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  // Escape does the same on web, where there is no hardware back.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  // Unmounted rather than hidden when closed. A sheet left mounted at zero opacity keeps its
  // controls focusable and screen-readable, so a parent can tab into a form that is not on screen.
  if (!visible) return null;

  const sheetHeight = bottomSheetHeight(height);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(180)}
        exiting={reducedMotion ? undefined : FadeOut.duration(140)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        entering={reducedMotion ? undefined : SlideInDown.duration(260)}
        exiting={reducedMotion ? undefined : SlideOutDown.duration(200)}
        style={[styles.sheet, { height: sheetHeight, paddingBottom: insets.bottom + spacing.md }]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <View style={styles.grabberRow}>
          <View style={styles.grabber} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.sheetScrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
});
