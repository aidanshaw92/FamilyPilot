import { ReactNode, useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spring, timing } from '@/src/design-system/animations/presets';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

import { CircleButton } from './CircleButton';
import { Text } from './Text';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** A fixed action pinned to the bottom of the sheet, above the safe area. */
  footer?: ReactNode;
  /** Fraction of the screen the sheet is allowed to fill. */
  maxHeight?: `${number}%`;
}

/** iOS-style sheet: grabber, generous top radius, dimmed page behind, spring entrance. */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  maxHeight = '88%',
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = visible ? 1 : 0;
      return;
    }
    progress.value = visible ? withSpring(1, spring.gentle) : withTiming(0, timing.fast);
  }, [visible, progress, reducedMotion]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 40 }],
    opacity: progress.value,
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { maxHeight }, sheetStyle]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.header}>
              <Text variant="heading1" style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <CircleButton
                icon="close"
                accessibilityLabel="Close"
                tone="glass"
                size={36}
                iconSize={18}
                onPress={onClose}
              />
            </View>
          ) : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: footer ? spacing.lg : insets.bottom + spacing.xl },
            ]}
          >
            {children}
          </ScrollView>

          {footer ? (
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>{footer}</View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: spacing.md,
    ...shadows.bottomSheet,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.lg,
  },
  title: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
  },
  footer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
});
