import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FacilitySignals } from '@/src/components/ui/FacilitySignals';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';

import { RecommendationPattern } from './RecommendationPattern';

interface DecisionCardProps {
  venue: Venue;
  index?: number;
  variant?: 'carousel' | 'list' | 'hero';
  onViewDetails?: () => void;
}

function DecisionCardComponent({
  venue,
  index = 0,
  variant = 'carousel',
  onViewDetails,
}: DecisionCardProps) {
  const router = useRouter();
  const isHero = variant === 'hero';

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails();
      return;
    }
    router.push(`/venue/${venue.id}` as never);
  };

  if (variant === 'list') {
    const classification = getMatchClassification(venue.familyScore.score, venue.enrichmentStatus);
    // The single most bespoke, relevant fact for this family (routine fit and concrete
    // duration/age/facility matches are ordered first) reads as a real answer to "why this
    // one" - a bulleted list of every known fact read as generic filler instead.
    const oneLiner = venue.familyScore.explanation[0];

    return (
      <PressableScale
        onPress={handleViewDetails}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${classification}, view details`}
        style={styles.compact}
      >
        <View style={styles.compactImageWrap}>
          <VenueImage
            uri={venue.imageUrl}
            category={venue.category}
            alt={venue.name}
            style={styles.compactImage}
            borderRadius={0}
          />
          <View style={styles.badgeOverlay}>
            <FamilyMatch score={venue.familyScore.score} variant="card" enrichmentStatus={venue.enrichmentStatus} />
          </View>
        </View>
        <View style={styles.compactContent}>
          <View style={styles.compactTitleRow}>
            <Text variant="heading3" numberOfLines={2} style={styles.compactTitle}>
              {venue.name}
            </Text>
            <View style={styles.compactCta}>
              <Ionicons name="arrow-forward" size={14} color={colors.text.inverse} />
            </View>
          </View>
          {oneLiner ? (
            <Text
              variant="bodySmall"
              color={colors.text.primary}
              numberOfLines={2}
              style={styles.compactReason}
            >
              {oneLiner}
            </Text>
          ) : null}
          <FacilitySignals facts={venue.trustedFacts} />
          <Text variant="caption" color={colors.text.tertiary}>
            {venue.category.replace('_', ' ')} · {venue.driveMinutes} min away
            {venue.estimatedSpend ? ` · ${venue.estimatedSpend}` : ''}
          </Text>
        </View>
      </PressableScale>
    );
  }

  return (
    <FadeInView delay={index * 60} style={variant === 'carousel' ? styles.carouselWrap : undefined}>
      <PressableScale
        onPress={handleViewDetails}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, view details`}
        style={[
          styles.card,
          variant === 'carousel' && styles.carousel,
          variant === 'hero' && styles.hero,
        ]}
      >
        <View style={isHero ? styles.heroImageWrap : styles.imageWrap}>
          <VenueImage
            uri={venue.imageUrl}
            category={venue.category}
            alt={venue.name}
            style={isHero ? { ...styles.image, ...styles.heroImage } : styles.image}
            borderRadius={isHero ? radius.lg : 0}
          />
          <View style={isHero ? styles.badgeOverlayHero : styles.badgeOverlay}>
            <FamilyMatch
              score={venue.familyScore.score}
              variant="card"
              enrichmentStatus={venue.enrichmentStatus}
            />
          </View>
          {isHero ? (
            <View style={styles.saveBadge}>
              <SaveButton
                venueId={venue.id}
                venue={venue}
                size={20}
                color={colors.text.inverse}
                filledColor={colors.coral}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          {isHero ? (
            <View style={styles.heroTitleRow}>
              <Text variant="heading1" numberOfLines={2} style={styles.heroTitle}>
                {venue.name}
              </Text>
              <View style={styles.heroCta}>
                <Ionicons name="arrow-forward" size={18} color={colors.text.inverse} />
              </View>
            </View>
          ) : (
            <Text variant="heading3" numberOfLines={1}>
              {venue.name}
            </Text>
          )}

          <RecommendationPattern
            venue={venue}
            variant={variant}
            showClassification={!isHero}
            showCta={!isHero}
            ctaLabel="View details"
            onCta={handleViewDetails}
          />
        </View>
      </PressableScale>
    </FadeInView>
  );
}

export const DecisionCard = memo(DecisionCardComponent);

const styles = StyleSheet.create({
  compact: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  compactImageWrap: {
    width: '100%',
    position: 'relative',
  },
  compactImage: {
    width: '100%',
    height: 130,
  },
  compactContent: {
    gap: spacing.xs,
    padding: spacing.lg,
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactTitle: {
    flex: 1,
  },
  compactReason: {
    lineHeight: 18,
  },
  compactCta: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselWrap: {
    marginRight: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  carousel: {
    width: 280,
  },
  list: {
    marginBottom: spacing.lg,
  },
  hero: {
    width: '100%',
    ...shadows.bottomSheet,
  },
  imageWrap: {
    width: '100%',
  },
  heroImageWrap: {
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 150,
  },
  heroImage: {
    height: 210,
  },
  badgeOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  badgeOverlayHero: {
    position: 'absolute',
    left: spacing.lg,
    bottom: spacing.lg,
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
  },
});
