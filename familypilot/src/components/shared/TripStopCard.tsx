import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { TripStop } from '@/src/types';

interface TripStopCardProps {
  stop: TripStop;
  isActive?: boolean;
  isLast?: boolean;
}

export function TripStopCard({ stop, isActive = false, isLast = false }: TripStopCardProps) {
  return (
    <View style={styles.row}>
      <View style={styles.timeline}>
        <View style={[styles.dot, isActive && styles.dotActive]} />
        {!isLast ? <View style={styles.line} /> : null}
      </View>
      <View style={styles.content}>
        <Text variant="caption" color={colors.primary[500]}>
          {stop.time}
        </Text>
        <View style={styles.detail}>
          <Image source={{ uri: stop.imageUrl }} style={styles.image} contentFit="cover" transition={200} />
          <View style={styles.text}>
            <Text variant="heading3">{stop.title}</Text>
            {stop.subtitle ? (
              <Text variant="bodySmall" color={colors.text.secondary}>
                {stop.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    minHeight: 88,
  },
  timeline: {
    width: 28,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
    marginTop: 4,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  dotActive: {
    backgroundColor: colors.primary[500],
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  line: {
    flex: 1,
    width: 3,
    backgroundColor: colors.primary[100],
    marginVertical: spacing.xs,
    borderRadius: radius.full,
  },
  content: {
    flex: 1,
    paddingBottom: spacing['2xl'],
  },
  detail: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  text: {
    flex: 1,
    justifyContent: 'center',
  },
});
