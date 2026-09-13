import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PressableScale } from '@/src/components/ui/PressableScale';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { FocusedRecommendation } from '@/src/types/day-request';
import { Venue } from '@/src/types';
import { getEnrichmentTrustCopy } from '@/src/utils/family-match-classification';
import { openingStatusLabel } from '@/src/services/context/live-context';
import { formatArrivalTime } from '@/src/utils/clock-format';

interface FocusedRecommendationCardProps {
  recommendation: FocusedRecommendation;
  variant?: 'hero' | 'carousel';
  index?: number;
  /** The same venue looked up from a source that has the full record, so saving from this
   * card writes a real, complete snapshot rather than a bare ID the Saved tab can't render. */
  venueForSave?: Venue;
}

// Confirmed facts already carry which field they're about; reuse that instead of a
// second lookup, so a glance shows what's actually on offer without reading a sentence.
const FACILITY_ICON_BY_FIELD: Record<string, keyof typeof Ionicons.glyphMap> = {
  toilets: 'water-outline',
  parking: 'car-outline',
  babyChanging: 'happy-outline',
  pushchairSuitability: 'accessibility-outline',
};

export function FocusedRecommendationCard({
  recommendation,
  variant = 'carousel',
  index = 0,
  venueForSave,
}: FocusedRecommendationCardProps) {
  const router = useRouter();
  const isHero = variant === 'hero';
  const facilitySignals = recommendation.reasons.filter((r) => FACILITY_ICON_BY_FIELD[r.field]);

  return (
    <FadeInView delay={index * 60}>
      <PressableScale
        onPress={() => router.push(`/venue/${recommendation.venueId}` as never)}
        style={[styles.card, isHero && styles.hero]}
        accessibilityRole="button"
        accessibilityLabel={`${recommendation.venueName}, ${recommendation.fit}`}
      >
        <View style={isHero ? styles.heroImageWrap : undefined}>
          <VenueImage
            uri={recommendation.imageUrl}
            category={recommendation.category}
            alt={recommendation.venueName}
            style={isHero ? { ...styles.image, ...styles.heroImage } : styles.image}
            borderRadius={isHero ? radius.lg : 0}
          />
          {isHero ? (
            <>
              {venueForSave ? (
                <View style={styles.saveBadge}>
                  <SaveButton
                    venueId={recommendation.venueId}
                    venue={venueForSave}
                    size={20}
                    color={colors.text.inverse}
                    filledColor={colors.coral}
                  />
                </View>
              ) : null}
              <View style={styles.fitBadge}>
                <Text variant="caption" style={styles.fitBadgeText} numberOfLines={1}>
                  {recommendation.fit}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        <View style={styles.content}>
          {isHero ? (
            <View style={styles.heroTitleRow}>
              <Text variant="heading1" numberOfLines={2} style={styles.heroTitle}>
                {recommendation.venueName}
              </Text>
              <View style={styles.heroCta}>
                <Ionicons name="arrow-forward" size={18} color={colors.text.inverse} />
              </View>
            </View>
          ) : (
            <>
              <Text variant="heading3" numberOfLines={1}>
                {recommendation.venueName}
              </Text>
              <Text variant="bodySmall" style={styles.fitLabel}>
                {recommendation.fit}
              </Text>
            </>
          )}

          {recommendation.reasons.length > 0 ? (
            <View style={styles.block}>
              {isHero ? (
                <Text variant="bodySmall" style={styles.sectionLabel}>
                  Why it suits your family
                </Text>
              ) : null}
              <View style={styles.row}>
                <Ionicons name="checkmark-circle" size={14} color={colors.secondary[500]} />
                <Text variant="bodySmall" style={styles.rowText} numberOfLines={2}>
                  {recommendation.reasons[0].text}
                </Text>
              </View>
              {facilitySignals.length > 0 ? (
                <View style={styles.signalsRow}>
                  {facilitySignals.map((signal) => (
                    <View key={signal.field} style={styles.signalBadge}>
                      <Ionicons
                        name={FACILITY_ICON_BY_FIELD[signal.field]}
                        size={14}
                        color={colors.secondary[600]}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {recommendation.unknowns.length > 0 ? (
            <View style={styles.block}>
              {recommendation.unknowns.slice(0, 1).map((item) => (
                <View key={item.field} style={styles.row}>
                  <Ionicons name="help-circle-outline" size={14} color={colors.text.tertiary} />
                  <Text variant="caption" color={colors.text.secondary} style={styles.rowText}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {recommendation.caveats.length > 0 ? (
            <View style={styles.block}>
              {recommendation.caveats.slice(0, 1).map((item) => (
                <View key={item} style={styles.row}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.warning[600]} />
                  <Text variant="caption" color={colors.warning[600]} style={styles.rowText}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text variant="bodySmall" color={colors.text.secondary} style={styles.meta}>
            {recommendation.driveMinutes} min away · Arrive by {formatArrivalTime(recommendation.driveMinutes)} if you leave now
            {recommendation.estimatedSpend ? ` · Estimated ${recommendation.estimatedSpend}` : ''}
            {recommendation.openingStatus === 'open' ? ' · Open now' : ''}
          </Text>
          <Text variant="caption" color={colors.text.tertiary}>
            {getEnrichmentTrustCopy(recommendation.enrichmentStatus)}
            {recommendation.openingStatus !== 'open'
              ? ` · ${openingStatusLabel(recommendation.openingStatus)}`
              : ''}
          </Text>
        </View>
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
    marginBottom: spacing.lg,
  },
  hero: {
    marginBottom: spacing['2xl'],
  },
  heroImageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 140,
  },
  heroImage: {
    height: 210,
  },
  saveBadge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitBadge: {
    position: 'absolute',
    left: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    maxWidth: '65%',
  },
  fitBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text.primary,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroTitle: {
    flex: 1,
  },
  heroCta: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  fitLabel: {
    color: colors.secondary[600],
    marginBottom: spacing.sm,
  },
  block: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  signalsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  signalBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.secondary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    lineHeight: 20,
  },
  meta: {
    marginTop: spacing.sm,
  },
});
