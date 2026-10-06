import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { colors, radius } from '@/src/design-system/tokens';
import { deckMetrics, deckSlot } from '@/src/utils/home-deck-geometry';

/**
 * What Home shows while its first list loads: the deck's own shape, not a blank.
 *
 * The real-device test opened Home straight after onboarding and the recommendation area sat as one large plain grey
 * block for about ten seconds, which read as broken at the moment a parent has just invested in setting up. This is the
 * deck as it will be: the foreground card at the deck's exact size and position, the two rear strips beside it, and the
 * card's own furniture (category, name, Family Fit row, the button) as placeholders in the frame's positions, with one
 * line saying what is happening. Everything comes from `deckMetrics` / `deckSlot`, the functions the deck itself uses, so
 * when the real cards arrive nothing on the screen moves.
 *
 * Only shown when the device holds no list at all (a first run). A returning parent sees the last list at once while a
 * fresh one loads (useHomeVenues).
 */
export function RecommendationDeckSkeleton({
  viewportWidth,
  maxHeight,
  message,
}: {
  viewportWidth: number;
  maxHeight?: number;
  /** One line about what is being worked out, for this family. */
  message: string;
}) {
  const { activeWidth, activeHeight, deckHeight, scale } = deckMetrics(viewportWidth, maxHeight);
  const geometry = { width: activeWidth, height: activeHeight, scale, stride: viewportWidth };
  const rear = [2, 1].map((d) => ({ d, slot: deckSlot(d, geometry) }));
  // The frame's footer, card-local on the 312 x 428 card: inset 14, text at 20, CTA 58 tall.
  const inset = 14 * scale;
  const textInset = 20 * scale;

  return (
    <View
      style={[styles.deck, { height: deckHeight }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      testID="home-deck-skeleton"
    >
      {rear.map(({ d, slot }) => (
        <View
          key={d}
          style={[
            styles.card,
            styles.rear,
            {
              width: activeWidth,
              height: activeHeight,
              opacity: slot.opacity,
              zIndex: slot.zIndex,
              transform: [{ translateX: slot.x }, { translateY: slot.y }, { scale: slot.scale }],
            },
          ]}
        />
      ))}
      <View style={[styles.card, styles.front, { width: activeWidth, height: activeHeight }]} testID="home-deck-skeleton-card">
        <View style={[styles.messageWrap, { paddingHorizontal: textInset, top: activeHeight * 0.3 }]}>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>
        <View style={[styles.footer, { left: inset, right: inset, bottom: inset }]}>
          <View style={{ paddingHorizontal: textInset - inset, gap: 10 * scale }}>
            <Skeleton width="34%" height={12 * scale} borderRadius={radius.full} />
            <Skeleton width="78%" height={24 * scale} borderRadius={radius.sm} />
            <Skeleton width={96 * scale} height={30 * scale} borderRadius={radius.full} />
          </View>
          <Skeleton height={58 * scale} borderRadius={radius.full} style={{ marginTop: 18 * scale }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  card: {
    position: 'absolute',
    top: 0,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
  },
  rear: {
    backgroundColor: colors.border,
  },
  front: {
    zIndex: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
  },
});
