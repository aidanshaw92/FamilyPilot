import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { EnrichmentStatus } from '@/src/types';

import { Text } from './Text';

interface FamilyFitBadgeProps {
  score: number;
  enrichmentStatus?: EnrichmentStatus;
  /** onLight sits in a white sheet; onImage sits over photography. */
  tone?: 'onLight' | 'onImage';
  onPress?: () => void;
  style?: ViewStyle;
}

/** Score out of 5, the way a rating reads, because that is what parents recognise.
 * Kept honest: an unreviewed place shows no number at all. */
export function formatFamilyFit(score: number): string {
  return (Math.round((score / 20) * 10) / 10).toFixed(1);
}

/** The reference's "★ 5.0" chip, reframed as how well a place fits THIS family. */
export function FamilyFitBadge({
  score,
  enrichmentStatus,
  tone = 'onLight',
  onPress,
  style,
}: FamilyFitBadgeProps) {
  const unreviewed = enrichmentStatus === 'provider_only';
  const onImage = tone === 'onImage';
  const label = unreviewed ? 'Not yet reviewed' : `${formatFamilyFit(score)} Family Fit`;
  const content = (
    <View
      style={[
        styles.badge,
        onImage ? styles.onImage : styles.onLight,
        style,
      ]}
      accessibilityRole={onPress ? undefined : 'text'}
      accessibilityLabel={unreviewed ? 'Family suitability not yet reviewed' : `${formatFamilyFit(score)} out of 5 Family Fit`}
    >
      {!unreviewed ? (
        <Ionicons
          name="star"
          size={14}
          color={onImage ? colors.text.inverse : colors.text.primary}
        />
      ) : null}
      <Text
        variant="caption"
        color={onImage ? colors.text.inverse : colors.text.primary}
        style={styles.label}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onPress ? (
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={onImage ? colors.text.inverse : colors.text.tertiary}
        />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Explain this score`}
      hitSlop={6}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    // Frame node 8:13: 32 tall, 12 in on the left, 14 on the right, 6 between star and label.
    gap: 6,
    paddingLeft: spacing.md,
    paddingRight: 14,
    height: 32,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  onLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  onImage: {
    backgroundColor: 'rgba(13, 13, 15, 0.45)',
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 17,
  },
});
