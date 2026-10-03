import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { DataTrustBadge } from '@/src/components/ui/DataTrustBadge';
import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getEnrichmentDetailTrustCopy, getEnrichmentTrustCopy, getMatchClassification } from '@/src/utils/family-match-classification';
import { formatArrivalTime } from '@/src/utils/clock-format';

import { describeFamilyMatch } from '@/src/utils/family-match-scale';
import { TrustBadgeInput, trustBadgesFor } from '@/src/utils/trust-badges';
import { travelTimeWithMode } from '@/src/utils/travel-time';

export type RecommendationVariant = 'hero' | 'carousel' | 'list' | 'detail';

interface RecommendationPatternProps {
  venue: Venue;
  variant?: RecommendationVariant;
  /** When set, uses qualitative focused fit — no percentage score. */
  focusedFitLabel?: string;
  focusedReasons?: string[];
  focusedUnknowns?: string[];
  showVenueName?: boolean;
  /** Hide the "Excellent match" style headline — set false when the caller already shows it
   * elsewhere (e.g. venue detail's score band) so it isn't stated twice on one screen. */
  showClassification?: boolean;
  showTrust?: boolean;
  showCta?: boolean;
  ctaLabel?: string;
  onCta?: () => void;
  style?: ViewStyle;
}

const REASON_LIMIT: Record<RecommendationVariant, number> = {
  hero: 3,
  carousel: 2,
  list: 2,
  detail: 3,
};

const CAUTION_LIMIT: Record<RecommendationVariant, number> = {
  hero: 1,
  carousel: 1,
  list: 1,
  detail: 3,
};

export function RecommendationPattern({
  venue,
  variant = 'list',
  focusedFitLabel,
  focusedReasons,
  focusedUnknowns,
  showVenueName = false,
  showClassification = true,
  showTrust = false,
  showCta = false,
  ctaLabel = 'View details',
  onCta,
  style,
}: RecommendationPatternProps) {
  const isFocused = Boolean(focusedFitLabel);
  const classification = isFocused
    ? focusedFitLabel!
    : getMatchClassification(venue.familyScore.score, venue.enrichmentStatus);
  const reasons = isFocused
    ? (focusedReasons ?? []).slice(0, REASON_LIMIT[variant])
    : venue.familyScore.explanation.slice(0, REASON_LIMIT[variant]);
  const unknownLines = isFocused ? (focusedUnknowns ?? []).slice(0, CAUTION_LIMIT[variant]) : [];
  // Two different things, drawn differently: what counts against this family (amber, "Worth
  // checking") and what the venue wants you to know (neutral, "Good to know").
  const cautions = isFocused
    ? unknownLines
    : (venue.familyScore.cautions ?? []).slice(0, CAUTION_LIMIT[variant]);
  const notes = isFocused ? [] : (venue.goodToKnow ?? []).slice(0, CAUTION_LIMIT[variant]);
  // Only badges with data behind them; see trust-badges.ts for what used to be printed here.
  const trustBadges = showTrust ? trustBadgesFor(venue as TrustBadgeInput) : [];
  const isDetail = variant === 'detail';
  const isHero = variant === 'hero';
  const showSectionLabels = isHero || isDetail;

  // heading3 everywhere: inside a card the word is a card title, never a page heading.
  const classificationVariant = 'heading3';

  return (
    <View style={style}>
      {showVenueName ? (
        <Text variant={isHero ? 'heading2' : 'heading3'} numberOfLines={1} style={styles.venueName}>
          {venue.name}
        </Text>
      ) : null}

      {showClassification ? (
        <Text variant={classificationVariant} style={styles.classification}>
          {classification}
        </Text>
      ) : null}

      {reasons.length > 0 ? (
        <View style={styles.reasonsBlock}>
          {showSectionLabels ? (
            <Text variant="bodySmall" style={styles.sectionLabel}>
              Why it suits your family
            </Text>
          ) : null}
          {reasons.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Ionicons
                name="checkmark-circle"
                size={isDetail ? 16 : 14}
                color={colors.secondary[500]}
              />
              <Text
                variant={isDetail ? 'body' : 'bodySmall'}
                style={styles.reasonText}
                numberOfLines={isDetail ? undefined : 2}
              >
                {reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {cautions.length > 0 ? (
        <View style={styles.cautionBlock}>
          {showSectionLabels ? (
            <Text variant="bodySmall" style={styles.sectionLabel}>
              {isFocused ? 'Not yet confirmed' : 'Worth checking'}
            </Text>
          ) : null}
          {cautions.map((item) => (
            <View key={item} style={styles.cautionRow}>
              <Ionicons
                name="alert-circle-outline"
                size={isDetail ? 16 : 14}
                color={colors.warning[600]}
              />
              <Text
                variant={isDetail ? 'bodySmall' : 'caption'}
                style={styles.cautionText}
                numberOfLines={isDetail ? undefined : 2}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {notes.length > 0 ? (
        <View style={styles.cautionBlock}>
          {showSectionLabels ? (
            <Text variant="bodySmall" style={styles.sectionLabel}>
              Good to know
            </Text>
          ) : null}
          {notes.map((item) => (
            <View key={item} style={styles.cautionRow}>
              <Ionicons
                name="information-circle-outline"
                size={isDetail ? 16 : 14}
                color={colors.text.secondary}
              />
              <Text
                variant={isDetail ? 'bodySmall' : 'caption'}
                color={colors.text.secondary}
                style={styles.noteText}
                numberOfLines={isDetail ? undefined : 2}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text variant="bodySmall" color={colors.text.secondary} style={styles.metaLine}>
        {/* "Arrive BY 14:32" is a promise, and the number behind it is a straight line divided by an
            assumed average speed. "around" is what that evidence supports. */}
        {travelTimeWithMode(venue.driveMinutes, 'estimated', 'drive')} · Arrive around{' '}
        {formatArrivalTime(venue.driveMinutes)} if you leave now
        {venue.estimatedSpend ? ` · Estimated ${venue.estimatedSpend}` : ''}
      </Text>

      {!isFocused ? (
        <Text variant="caption" color={colors.text.tertiary} style={styles.scoreSecondary}>
          {describeFamilyMatch(venue.familyScore.score, venue.enrichmentStatus).secondary}
        </Text>
      ) : null}

      {venue.enrichmentStatus ? (
        <Text variant="caption" color={colors.text.secondary} style={styles.providerOnlyNote}>
          {isDetail ? getEnrichmentDetailTrustCopy(venue.enrichmentStatus) : getEnrichmentTrustCopy(venue.enrichmentStatus)}
        </Text>
      ) : null}

      {showTrust && trustBadges.length > 0 ? (
        <View style={styles.trustRow}>
          <Text variant="caption" color={colors.text.secondary} style={styles.trustHeading}>
            Information confidence
          </Text>
          <View style={styles.trustBadges}>
            {trustBadges.map((label) => (
              <DataTrustBadge key={label} variant="venue_info" label={label} />
            ))}
          </View>
        </View>
      ) : null}

      {showCta && onCta ? (
        <Button
          label={ctaLabel}
          onPress={onCta}
          size={isHero ? 'lg' : 'md'}
          style={styles.cta}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  venueName: {
    marginBottom: spacing.sm,
  },
  classification: {
    marginBottom: spacing.md,
  },
  reasonsBlock: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reasonText: {
    flex: 1,
    color: colors.text.primary,
    lineHeight: 22,
  },
  cautionBlock: {
    marginBottom: spacing.md,
  },
  cautionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cautionText: {
    flex: 1,
    color: colors.warning[600],
    lineHeight: 20,
  },
  noteText: {
    flex: 1,
    lineHeight: 20,
  },
  metaLine: {
    marginTop: spacing.sm,
  },
  scoreSecondary: {
    marginTop: spacing.xs,
    fontFamily: 'Inter_400Regular',
  },
  providerOnlyNote: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  trustRow: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
  },
  trustHeading: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  trustBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
    marginTop: spacing.lg,
  },
});
