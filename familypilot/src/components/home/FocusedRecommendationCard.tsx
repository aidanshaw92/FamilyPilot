import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PressableScale } from '@/src/components/ui/PressableScale';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { FocusedRecommendation } from '@/src/types/day-request';
import { getEnrichmentTrustCopy } from '@/src/utils/family-match-classification';
import { openingStatusLabel } from '@/src/services/context/live-context';

interface FocusedRecommendationCardProps {
  recommendation: FocusedRecommendation;
  variant?: 'hero' | 'carousel';
  index?: number;
}

export function FocusedRecommendationCard({
  recommendation,
  variant = 'carousel',
  index = 0,
}: FocusedRecommendationCardProps) {
  const router = useRouter();
  const isHero = variant === 'hero';

  return (
    <FadeInView delay={index * 60}>
      <PressableScale
        onPress={() => router.push(`/venue/${recommendation.venueId}` as never)}
        style={[styles.card, isHero && styles.hero]}
        accessibilityRole="button"
        accessibilityLabel={`${recommendation.venueName}, ${recommendation.fit}`}
      >
        <VenueImage
          uri={recommendation.imageUrl}
          category={recommendation.category}
          alt={recommendation.venueName}
          style={isHero ? { ...styles.image, ...styles.heroImage } : styles.image}
          borderRadius={isHero ? radius.lg : 0}
        />
        <View style={styles.content}>
          <Text variant={isHero ? 'heading2' : 'heading3'} numberOfLines={1}>
            {recommendation.venueName}
          </Text>
          <Text variant={isHero ? 'heading2' : 'heading3'} style={styles.fitLabel}>
            {recommendation.fit}
          </Text>

          {recommendation.reasons.length > 0 ? (
            <View style={styles.block}>
              {isHero ? (
                <Text variant="bodySmall" style={styles.sectionLabel}>
                  Why it suits your family
                </Text>
              ) : null}
              {recommendation.reasons.slice(0, isHero ? 3 : 2).map((reason) => (
                <View key={`${reason.field}-${reason.text}`} style={styles.row}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.secondary[500]} />
                  <Text variant="bodySmall" style={styles.rowText} numberOfLines={2}>
                    {reason.text}
                  </Text>
                </View>
              ))}
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
            {recommendation.driveMinutes} min away
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
  image: {
    width: '100%',
    height: 140,
  },
  heroImage: {
    height: 200,
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
