import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityActionEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PlaceShowcaseCard, PlaceShowcaseCardRear } from '@/src/components/shared/PlaceShowcaseCard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import {
  BACK_OFFSET_Y,
  BACK_OPACITY,
  BACK_REVEAL,
  BACK_SCALE,
  deckMetrics,
  NEXT_OFFSET_Y,
  NEXT_OPACITY,
  NEXT_REVEAL,
  NEXT_SCALE,
  rearLayerOffsetX,
} from '@/src/utils/home-deck-geometry';
import { Venue } from '@/src/types';

/** Past this fraction of the card width, releasing commits the swipe. */
const COMMIT_RATIO = 0.25;
const COMMIT_VELOCITY = 500;

/**
 * A pointer that has travelled this far is swiping the deck, not tapping the card. The card and
 * its save control are ordinary pressables, and neither knows a drag is in progress — without
 * this, releasing a short drag lands as a tap and opens the venue.
 */
const PRESS_SLOP = 6;

interface RecommendationDeckProps {
  venues: Venue[];
  viewportWidth: number;
  onPressVenue: (venue: Venue) => void;
}

/**
 * The approved Home deck: one full-size card centred on the screen with the next two stacked
 * behind it, each scaled down and inset so a strip of photography shows past the left and
 * right edges. Swiping left advances, swiping right reverses, and the deck is finite — it
 * does not wrap. There are no pagination dots; the protruding rear cards are the affordance.
 *
 * This is not a carousel. The layers overlap and are absolutely positioned, so a scrolling
 * rail cannot express it.
 */
export function RecommendationDeck({
  venues,
  viewportWidth,
  onPressVenue,
}: RecommendationDeckProps) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const drag = useSharedValue(0);

  // Mirrored on both threads: the shared value keeps the worklet from crossing over on every
  // frame, the ref is what the press handlers can read synchronously.
  const dragged = useSharedValue(false);
  const draggedRef = useRef(false);
  const setDragged = useCallback((value: boolean) => {
    draggedRef.current = value;
  }, []);
  const isSwiping = useCallback(() => draggedRef.current, []);

  const { scale, activeWidth, activeHeight, deckHeight } = deckMetrics(viewportWidth);

  const rearOffsetX = (rearWidth: number, reveal: number) =>
    rearLayerOffsetX(activeWidth, rearWidth, reveal, scale);

  const nextWidth = activeWidth * NEXT_SCALE;
  const backWidth = activeWidth * BACK_SCALE;

  // A shorter list must not leave the deck pointing at a card that no longer exists.
  useEffect(() => {
    if (index > Math.max(0, venues.length - 1)) setIndex(0);
  }, [venues.length, index]);

  const canAdvance = index < venues.length - 1;
  const canReverse = index > 0;

  const commit = useCallback(
    (direction: 1 | -1) => {
      setIndex((current) => {
        const target = current + direction;
        if (target < 0 || target > venues.length - 1) return current;
        return target;
      });
    },
    [venues.length],
  );

  const settle = useCallback(() => {
    'worklet';
    drag.value = reducedMotion
      ? withTiming(0, { duration: 0 })
      : withSpring(0, { damping: 20, stiffness: 180 });
  }, [drag, reducedMotion]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      dragged.value = false;
      runOnJS(setDragged)(false);
    })
    .onUpdate((event) => {
      drag.value = event.translationX;
      if (!dragged.value && Math.abs(event.translationX) > PRESS_SLOP) {
        dragged.value = true;
        runOnJS(setDragged)(true);
      }
    })
    .onEnd((event) => {
      const threshold = activeWidth * COMMIT_RATIO;
      const fast = Math.abs(event.velocityX) > COMMIT_VELOCITY;
      const past = Math.abs(event.translationX) > threshold;

      if (past || fast) {
        // Swipe left (negative translation) moves forward through the deck.
        const direction = event.translationX < 0 ? 1 : -1;
        const allowed = direction === 1 ? canAdvance : canReverse;
        if (allowed) runOnJS(commit)(direction as 1 | -1);
      }
      settle();
    });

  const activeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'next' && canAdvance) commit(1);
    if (event.nativeEvent.actionName === 'previous' && canReverse) commit(-1);
  };

  const active = venues[index];
  if (!active) return null;

  const next = venues[index + 1];
  const back = venues[index + 2];

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
      >
        {/* Back layer: furthest behind, protrudes to the right. */}
        {back ? (
          <View
            style={[
              styles.layer,
              {
                opacity: BACK_OPACITY,
                transform: [
                  { translateX: rearOffsetX(backWidth, BACK_REVEAL) },
                  { translateY: BACK_OFFSET_Y * scale },
                ],
              },
            ]}
          >
            <PlaceShowcaseCardRear
              venue={back}
              width={backWidth}
              height={activeHeight * BACK_SCALE}
            />
          </View>
        ) : null}

        {/* Next layer: protrudes to the left, so the deck frames the active card on both sides. */}
        {next ? (
          <View
            style={[
              styles.layer,
              {
                opacity: NEXT_OPACITY,
                transform: [
                  { translateX: -rearOffsetX(nextWidth, NEXT_REVEAL) },
                  { translateY: NEXT_OFFSET_Y * scale },
                ],
              },
            ]}
          >
            <PlaceShowcaseCardRear
              venue={next}
              width={nextWidth}
              height={activeHeight * NEXT_SCALE}
            />
          </View>
        ) : null}

        <Animated.View style={[styles.layer, activeStyle]}>
          <PlaceShowcaseCard
            venue={active}
            width={activeWidth}
            height={activeHeight}
            onPress={() => onPressVenue(active)}
            isSwiping={isSwiping}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

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
