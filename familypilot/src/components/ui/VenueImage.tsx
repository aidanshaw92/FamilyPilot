import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius } from '@/src/design-system/tokens';
import { VenueCategory } from '@/src/types';

import { Skeleton } from './Skeleton';
import { Text } from './Text';

const CATEGORY_FALLBACKS: Record<VenueCategory, string> = {
  park: 'https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=800&q=80',
  farm: 'https://images.unsplash.com/photo-1500595046743-be5264b89a46?w=800&q=80',
  museum: 'https://images.unsplash.com/photo-1530986600824-0b6060a851a2?w=800&q=80',
  zoo: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ee7?w=800&q=80',
  attraction: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
  activity: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
  soft_play: 'https://images.unsplash.com/photo-1560439514-4e9645039924?w=800&q=80',
  cafe: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  restaurant: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  hotel: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
  shop: 'https://images.unsplash.com/photo-1604719312566-8912a92a1f03?w=800&q=80',
  beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
};

interface VenueImageProps {
  uri?: string;
  category?: VenueCategory;
  alt: string;
  style?: ViewStyle;
  borderRadius?: number;
}

export function VenueImage({
  uri,
  category = 'park',
  alt,
  style,
  borderRadius = radius.md,
}: VenueImageProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const source = failed || !uri ? CATEGORY_FALLBACKS[category] : uri;

  return (
    <View style={[styles.wrap, { borderRadius }, style]}>
      {loading ? (
        <View style={[StyleSheet.absoluteFill, { borderRadius }]}>
          <Skeleton height={120} borderRadius={borderRadius} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
      <Image
        source={{ uri: source }}
        style={[styles.image, { borderRadius }]}
        contentFit="cover"
        transition={200}
        accessibilityLabel={alt}
        onLoad={() => setLoading(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
      />
      {failed ? (
        <View style={[styles.fallbackLabel, { borderRadius }]}>
          <Text variant="caption" color={colors.text.inverse}>
            {category.replace('_', ' ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: colors.borderLight,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackLabel: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
