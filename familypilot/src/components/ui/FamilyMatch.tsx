import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';
import { EnrichmentStatus } from '@/src/types';
import { describeFamilyMatch } from '@/src/utils/family-match-scale';
import { FamilyMatchResult, matchBadgeText, matchEarnsStar, VERDICT_BADGE } from '@/src/services/matching/family-match';

import { Text } from './Text';
import { StarGlyph } from './icons';
import { minTarget } from './touch';

/**
 * `default` is the Venue Detail / Saved badge; `compact` drops the word beside a venue name; `explore` is
 * the Explore result card's pill (approved frame 294:133: 29.5 tall, 13.2 Medium, 13 star); `deck` is the
 * Home recommendation card's pill (approved frame 229:133: 31 tall, 13.6 SemiBold, 10 star).
 */
export type FamilyMatchSize = 'default' | 'compact' | 'explore' | 'deck';

interface FamilyMatchProps {
  score: number;
  enrichmentStatus?: EnrichmentStatus;
  /** onLight sits on a white card or sheet; onImage sits over photography. */
  tone?: 'onLight' | 'onImage';
  /** Opens an explanation. The badge grows an info glyph so the affordance is visible. */
  onPress?: () => void;
  /**
   * `default` is the Home card pill with the word (node 8:13). `compact` is frame 02's "★ 4.3"
   * beside a venue name (node 49:5): star and number only, 30 tall, white with a hairline, because
   * the "Why this score" link on that row carries the word.
   */
  size?: FamilyMatchSize;
  /**
   * What FamilyPilot works out for THIS family (family-match.ts). When given it decides the words, the star and
   * the colour, and the number is not shown: a good match says who it is good for, a possible one says possible.
   */
  match?: Pick<FamilyMatchResult, 'verdict' | 'forNames'> & { gapNames?: string[] };
  style?: ViewStyle;
}

/**
 * The one Family Fit badge, from the approved Home frame's "★ 4.3 Family Fit" chip (node 8:13), read as
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
  size = 'default',
  match: verdictMatch,
  style,
}: FamilyMatchProps) {
  const legacy = describeFamilyMatch(score, enrichmentStatus);
  // The verdict, when there is one, replaces the number: `unreviewed` keeps its own status wording and look.
  const match = verdictMatch
    ? {
        ...legacy,
        unreviewed: !matchEarnsStar(verdictMatch.verdict),
        number: matchEarnsStar(verdictMatch.verdict) ? '★' : null,
        badgeLabel: matchBadgeText(verdictMatch, size === 'compact' ? 12 : 18),
        spoken: `${matchBadgeText(verdictMatch, 40)}. ${VERDICT_BADGE[verdictMatch.verdict]}`,
      }
    : legacy;
  // Unknown is unknown: a badge with no number and no status would be a verdict in disguise.
  if (!match.unreviewed && match.number === null) return null;

  const onImage = tone === 'onImage';
  // Compact only ever drops the word next to a number; an unreviewed status keeps its words.
  const compact = size === 'compact' && match.number !== null && !verdictMatch;
  const verdict = verdictMatch?.verdict;
  const frameSize = size === 'explore' || size === 'deck' ? size : null;
  // On a light surface the pill is mint with green star and text; on photography it is the
  // deep green with white. An unreviewed pill is the quiet neutral fill with secondary text.
  const ink = onImage
    ? colors.text.inverse
    : verdict === 'possible'
      ? colors.warning[600]
      : verdict === 'poor'
        ? colors.error[600]
        : match.unreviewed
          ? colors.text.secondary
          : colors.action;
  const content = (
    <View
      style={[
        styles.badge,
        onImage
          ? verdict === 'possible'
            ? styles.onImagePossible
            : verdict === 'poor'
              ? styles.onImagePoor
              : styles.onImage
          : verdict === 'possible'
            ? styles.onLightPossible
            : verdict === 'poor'
              ? styles.onLightPoor
              : match.unreviewed
                ? styles.onLightUnreviewed
                : styles.onLight,
        compact && styles.compact,
        frameSize === 'explore' && styles.explore,
        frameSize === 'deck' && styles.deck,
        style,
      ]}
      accessibilityRole={onPress ? undefined : 'text'}
      accessibilityLabel={match.spoken}
    >
      {match.number !== null ? (
        <StarGlyph size={frameSize === 'explore' ? 13 : frameSize === 'deck' ? 10 : 13} color={ink} />
      ) : null}
      <Text
        variant="caption"
        color={ink}
        style={[
          styles.label,
          compact && styles.compactLabel,
          frameSize === 'explore' && styles.exploreLabel,
          frameSize === 'deck' && styles.deckLabel,
        ]}
        numberOfLines={1}
      >
        {compact ? match.number : match.badgeLabel}
      </Text>
      {/* Compact sits beside a "Why this score" link (node 49:13), which is the affordance there. */}
      {onPress && !compact ? (
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
      style={minTarget(compact ? 30 : frameSize === 'explore' ? 29.5 : frameSize === 'deck' ? 31 : 28)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    // The approved Home and Explore references draw the pill 27 tall (frame node 8:13 had 32):
    // 28 here, 11 in on the left, 13 on the right, 6 between star and label.
    gap: 6,
    paddingLeft: 11,
    paddingRight: 13,
    height: 28,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  onLight: {
    backgroundColor: colors.actionSoft,
  },
  onLightUnreviewed: {
    backgroundColor: colors.fill,
  },
  onImage: {
    backgroundColor: colors.glass.action,
  },
  // A possible match is quieter than a good one, and a poor one is plainly different, but neither is alarming.
  onImagePossible: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  onImagePoor: {
    backgroundColor: 'rgba(166, 52, 40, 0.78)',
  },
  onLightPossible: {
    backgroundColor: colors.warning[50],
  },
  onLightPoor: {
    backgroundColor: colors.error[50],
  },
  // Frame node 49:5: 30 tall, 14 in on the left, 16 on the right, SemiBold number.
  compact: {
    height: 30,
    paddingLeft: 14,
    paddingRight: spacing.lg,
  },
  // Explore result card, frame 294:133: 64px / 2.17 = 29.5 tall, label 28.7px = 13.2.
  explore: {
    height: 29.5,
    gap: 6,
    paddingLeft: 14,
    paddingRight: 15.5,
  },
  exploreLabel: {
    fontSize: 13.2,
    lineHeight: 16,
  },
  // Home deck card, frame 229:133: 67px / 2.168 = 31 tall, label 29.4px = 13.6 SemiBold.
  deck: {
    height: 31,
    gap: 9,
    paddingLeft: 14,
    paddingRight: 14,
  },
  deckLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.6,
    lineHeight: 17,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 17,
  },
  compactLabel: {
    fontFamily: 'Inter_600SemiBold',
  },
});
