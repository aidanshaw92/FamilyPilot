import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityActionEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PlaceShowcaseCard } from '@/src/components/shared/PlaceShowcaseCard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { deckMetrics, deckSlot } from '@/src/utils/home-deck-geometry';
import { Venue } from '@/src/types';

/** Past this fraction of the card width, releasing commits the swipe. */
const COMMIT_RATIO = 0.25;
const COMMIT_VELOCITY = 500;

/**
 * A pointer that has travelled this far is swiping the deck, not tapping the card. The card and
 * its save control are ordinary pressables, and neither knows a drag is in progress, so without
 * this a short drag lands as a tap and opens the venue.
 */
const PRESS_SLOP = 6;

/**
 * How many cards are mounted either side of the foreground one. One behind (the card a swipe right
 * brings back) and three ahead: two are the strips the frame draws, and the third is waiting out of
 * sight, so by the time a swipe promotes it to a strip its photograph has already loaded. That window is
 * what makes a swipe never show a blank where a photograph was. It is also the whole photograph budget
 * of Home: at most `BEHIND + 1 + AHEAD` photographs are ever requested, and `photo-request-budget.test`
 * pins it.
 */
export const DECK_BEHIND = 1;
export const DECK_AHEAD = 3;

/** Resistance past either end of the deck: the card follows the finger a little, then springs home. */
const END_RESISTANCE = 0.28;

interface RecommendationDeckProps {
  venues: Venue[];
  viewportWidth: number;
  /** The height the screen really has for the deck (between the header and the floating navigation). */
  maxHeight?: number;
  onPressVenue: (venue: Venue) => void;
}

/**
 * The approved Home deck: one full-size card centred on the screen with the next two stacked behind
 * it, each scaled down and inset so a strip of photography shows past the left and right edges.
 * Swiping left advances, swiping right brings the previous card back, and the deck is finite: it does
 * not wrap. There are no pagination dots; the protruding rear cards are the affordance.
 *
 * Every card is the same component, placed by one continuous function of its distance from the front
 * (`deckSlot`). The photograph, the scrim and the text of a card therefore travel as one piece; a card
 * changing role (strip to foreground) moves there rather than being swapped for another; and the cards
 * stay mounted (keyed by venue) across a swipe, so a photograph that has loaded is never loaded again.
 */
export function RecommendationDeck({
  venues,
  viewportWidth,
  maxHeight,
  onPressVenue,
}: RecommendationDeckProps) {
  const reducedMotion = useReducedMotion();
  const metrics = deckMetrics(viewportWidth, maxHeight);
  const { activeWidth, activeHeight, deckHeight, scale } = metrics;
  // A card is fully off the left edge when its centre has travelled this far.
  const stride = viewportWidth / 2 + activeWidth / 2 + 8;

  const last = Math.max(0, venues.length - 1);
  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);
  const [anchor, setAnchor] = useState(0);

  // Mirrored on both threads: the shared value keeps the worklet from crossing over on every frame, the ref
  // is what the press handlers can read synchronously.
  const dragged = useSharedValue(false);
  const draggedRef = useRef(false);
  const setDragged = useCallback((value: boolean) => {
    draggedRef.current = value;
  }, []);
  const isSwiping = useCallback(() => draggedRef.current, []);

  // A different list (another category, a refreshed result) starts again at its first card.
  const listKey = `${venues.length}:${venues[0]?.id ?? ''}`;
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    setAnchor(0);
  }, [listKey, progress]);

  useAnimatedReaction(
    () => Math.round(progress.value),
    (index, previous) => {
      if (index !== previous) runOnJS(setAnchor)(index);
    },
  );

  const animateTo = useCallback(
    (target: number, velocity = 0) => {
      const clamped = Math.min(last, Math.max(0, target));
      if (reducedMotion) {
        progress.value = withTiming(clamped, { duration: 0 });
      } else {
        progress.value = withSpring(clamped, {
          damping: 24,
          stiffness: 210,
          mass: 1,
          velocity,
          overshootClamping: true,
        });
      }
    },
    [last, progress, reducedMotion],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      cancelAnimation(progress);
      startProgress.value = progress.value;
      dragged.value = false;
      runOnJS(setDragged)(false);
    })
    .onUpdate((event) => {
      const raw = startProgress.value - event.translationX / stride;
      let next = raw;
      if (raw < 0) next = raw * END_RESISTANCE;
      else if (raw > last) next = last + (raw - last) * END_RESISTANCE;
      progress.value = next;
      if (!dragged.value && Math.abs(event.translationX) > PRESS_SLOP) {
        dragged.value = true;
        runOnJS(setDragged)(true);
      }
    })
    .onEnd((event) => {
      const base = Math.round(startProgress.value);
      const threshold = activeWidth * COMMIT_RATIO;
      const fast = Math.abs(event.velocityX) > COMMIT_VELOCITY;
      const past = Math.abs(event.translationX) > threshold;
      // Swipe left (negative translation) moves forward through the deck.
      const direction = event.translationX < 0 ? 1 : -1;
      const target = past || fast ? Math.min(last, Math.max(0, base + direction)) : base;
      runOnJS(animateTo)(target, -event.velocityX / stride);
    });

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'next') animateTo(anchor + 1);
    if (event.nativeEvent.actionName === 'previous') animateTo(anchor - 1);
  };

  if (venues.length === 0) return null;

  const from = Math.max(0, anchor - DECK_BEHIND);
  const to = Math.min(last, anchor + DECK_AHEAD);
  const windowIndices: number[] = [];
  for (let i = from; i <= to; i += 1) windowIndices.push(i);

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.deck, { height: deckHeight }]}
        accessible={false}
        accessibilityActions={[
          { name: 'next', label: 'Next suggestion' },
          { name: 'previous', label: 'Previous suggestion' },
        ]}
        onAccessibilityAction={handleAccessibilityAction}
        testID="recommendation-deck"
      >
        {windowIndices.map((i) => (
          <DeckCard
            key={venues[i].id}
            venue={venues[i]}
            index={i}
            progress={progress}
            width={activeWidth}
            height={activeHeight}
            scale={scale}
            stride={stride}
            interactive={i === anchor}
            isSwiping={isSwiping}
            onPress={onPressVenue}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

interface DeckCardProps {
  venue: Venue;
  index: number;
  progress: SharedValue<number>;
  width: number;
  height: number;
  scale: number;
  stride: number;
  interactive: boolean;
  isSwiping: () => boolean;
  onPress: (venue: Venue) => void;
}

const DeckCard = memo(function DeckCard({
  venue,
  index,
  progress,
  width,
  height,
  scale,
  stride,
  interactive,
  isSwiping,
  onPress,
}: DeckCardProps) {
  const layerStyle = useAnimatedStyle(() => {
    const slot = deckSlot(index - progress.value, { width, height, scale, stride });
    return {
      opacity: slot.opacity,
      zIndex: slot.zIndex,
      transform: [{ translateX: slot.x }, { translateY: slot.y }, { scale: slot.scale }],
    };
  });
  const footerStyle = useAnimatedStyle(() => ({
    opacity: deckSlot(index - progress.value, { width, height, scale, stride }).emphasis,
  }));
  // The frame runs the same ramp behind a rear card at about a third of the strength.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * deckSlot(index - progress.value, { width, height, scale, stride }).emphasis,
  }));

  return (
    <Animated.View style={[styles.layer, layerStyle]}>
      <PlaceShowcaseCard
        venue={venue}
        width={width}
        height={height}
        onPress={() => onPress(venue)}
        isSwiping={isSwiping}
        interactive={interactive}
        footerStyle={footerStyle}
        scrimStyle={scrimStyle}
        imageLoading="eager"
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  deck: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  layer: {
    position: 'absolute',
    top: 0,
  },
});
