import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/src/components/ui/PressableScale';
import { colors, radius, spacing } from '@/src/design-system/tokens';

interface PhotoGalleryProps {
  photos: string[];
  onPhotoPress?: (index: number) => void;
}

export function PhotoGallery({ photos, onPhotoPress }: PhotoGalleryProps) {
  if (photos.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.container}
    >
      {photos.map((uri, index) => (
        <PressableScale
          key={uri}
          onPress={() => onPhotoPress?.(index)}
          accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
          style={styles.thumbWrap}
        >
          <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={200} />
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  scroll: {
    gap: spacing.sm,
  },
  thumbWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: 120,
    height: 80,
    borderRadius: radius.md,
  },
});
