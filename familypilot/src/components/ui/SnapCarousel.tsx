import { ReactNode, useCallback, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

interface SnapCarouselProps<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Card width. Leave the gutter smaller than the screen so the next card peeks. */
  itemWidth: number;
  gap?: number;
  /** Left inset, normally the screen gutter. */
  leadingInset?: number;
  showDots?: boolean;
  style?: ViewStyle;
}

/** Snapping horizontal rail. The next card is always partly visible, which is what makes
 * the reference read as swipeable without any affordance being spelled out. */
export function SnapCarousel<T>({
  data,
  keyExtractor,
  renderItem,
  itemWidth,
  gap = spacing.md,
  leadingInset = spacing.screenPadding,
  showDots = false,
  style,
}: SnapCarouselProps<T>) {
  const [active, setActive] = useState(0);
  const interval = itemWidth + gap;
  const lastIndex = useRef(0);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / interval);
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        setActive(index);
      }
    },
    [interval],
  );

  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={interval}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={showDots ? handleScroll : undefined}
        scrollEventThrottle={showDots ? 32 : undefined}
        contentContainerStyle={{
          paddingLeft: leadingInset,
          paddingRight: leadingInset,
          gap,
        }}
      >
        {data.map((item, index) => (
          <View key={keyExtractor(item, index)} style={{ width: itemWidth }}>
            {renderItem(item, index)}
          </View>
        ))}
      </ScrollView>

      {showDots && data.length > 1 ? (
        <View style={styles.dots}>
          {data.map((item, index) => (
            <View
              key={`dot-${keyExtractor(item, index)}`}
              style={[styles.dot, index === active && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primary[200],
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary[500],
  },
});
