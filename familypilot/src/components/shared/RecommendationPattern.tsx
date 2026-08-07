import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { DataTrustBadge } from '@/src/components/ui/DataTrustBadge';
import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getMatchClassification, getEnrichmentTrustCopy } from '@/src/utils/family-match-classification';

import { formatFamilyMatchSecondary } from '../ui/family-match-label';

export type RecommendationVariant = 'hero' | 'carousel' | 'list' | 'detail';

interface RecommendationPatternProps {
  venue: Venue;
  variant?: RecommendationVariant;
  showVenueName?: boolean;
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
  showVenueName = false,
  showTrust = false,
  showCta = false,
  ctaLabel = 'View details',
  onCta,
  style,
}: RecommendationPatternProps) {
  const classification = getMatchClassification(venue.familyScore.score, venue.enrichmentStatus);
  const reasons = venue.familyScore.explanation.slice(0, REASON_LIMIT[variant]);
  const cautions = (venue.goodToKnow ?? []).slice(0, CAUTION_LIMIT[variant]);
  const isDetail = variant === 'detail';
  const isHero = variant === 'hero';
  const showSectionLabels = isHero || isDetail;

  const classificationVariant = isHero || isDetail ? 'heading2' : 'heading3';

  return (
    <View style={style}>
      {showVenueName ? (
        <Text variant={isHero ? 'heading2' : 'heading3'} numberOfLines={1} style={styles.venueName}>
          {venue.name}
        </Text>
      ) : null}

      <Text variant={classificationVariant} style={styles.classification}>
        {classification}
      </Text>

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
              Good to know
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

      <Text variant="bodySmall" color={colors.text.secondary} style={styles.metaLine}>
        {venue.driveMinutes} min away
        {venue.estimatedSpend ? ` · Estimated ${venue.estimatedSpend}` : ''}
      </Text>

      <Text variant="caption" color={colors.text.tertiary} style={styles.scoreSecondary}>
        {formatFamilyMatchSecondary(venue.familyScore.score, venue.enrichmentStatus)}
      </Text>

      {venue.enrichmentStatus ? (
        <Text variant="caption" color={colors.text.secondary} style={styles.providerOnlyNote}>
          {getEnrichmentTrustCopy(venue.enrichmentStatus)}
        </Text>
      ) : null}

      {showTrust ? (
        <View style={styles.trustRow}>
          <Text variant="caption" color={colors.text.secondary} style={styles.trustHeading}>
            Information confidence
          </Text>
          <View style={styles.trustBadges}>
            <DataTrustBadge variant="venue_info" />
            <DataTrustBadge variant="updated_recently" label="Last checked 2 days ago" />
            <DataTrustBadge variant="opening_hours" />
            {venue.estimatedSpend ? (
              <DataTrustBadge variant="estimated" label="Estimated family cost" />
            ) : null}
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
    color: colors.secondary[600],
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
