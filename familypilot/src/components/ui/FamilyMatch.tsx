import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { EnrichmentStatus } from '@/src/types';
import { describeFamilyMatch } from '@/src/utils/family-match-scale';

import { Text } from './Text';

interface FamilyMatchProps {
  score: number;
  enrichmentStatus?: EnrichmentStatus;
  /** onLight sits on a white card or sheet; onImage sits over photography. */
  tone?: 'onLight' | 'onImage';
  /** Opens an explanation. The badge grows an info glyph so the affordance is visible. */
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * The one Family Match badge, from the approved Home frame's "★ 4.0" chip (node 8:13), reframed as
 * how well a place fits THIS family. Home, Explore, Saved, Venue Detail and the plan all render this
 * same component so the number a parent sees on a card is the number they see one tap later.
 *
 * Kept honest: an unreviewed place shows a status and no number; an unknown score shows nothing.
 * The scale and every string live in `family-match-scale.ts`.
 */
export function FamilyMatch({
  score,
  enrichmentStatus,
  tone = 'onLight',
  onPress,
  style,
}: FamilyMatchProps) {
  const match = describeFamilyMatch(score, enrichmentStatus);
  // Unknown is unknown: a badge with no number and no status would be a verdict in disguise.
  if (!match.unreviewed && match.number === null) return null;

  const onImage = tone === 'onImage';
  const ink = onImage ? colors.text.inverse : colors.ink;
  const content = (
    <View
      style={[styles.badge, onImage ? styles.onImage : styles.onLight, style]}
      accessibilityRole={onPress ? undefined : 'text'}
      accessibilityLabel={match.spoken}
    >
      {match.number !== null ? <Ionicons name="star" size={14} color={ink} /> : null}
      <Text variant="caption" color={ink} style={styles.label} numberOfLines={1}>
        {match.badgeLabel}
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
      accessibilityLabel={`${match.spoken}. Explain this score`}
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
