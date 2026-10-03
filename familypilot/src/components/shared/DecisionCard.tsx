import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { FadeInView } from '@/src/components/ui/FadeInView';
import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';

import { RecommendationPattern } from './RecommendationPattern';
import { travelTimeLabel } from '@/src/utils/travel-time';

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
    // Two concrete facts read as bespoke; one alone can look like a generic template repeated
    // across every card, so combine the two most relevant reasons where there's a second one.
    // (A third was tried and tested worse: numberOfLines={2} below just truncates it with an
    // ellipsis rather than showing it, which reads as a cut-off fragment instead of a fact.)
    // An unreviewed place has no reason line: the badge under the title already says "Not yet
    // reviewed", its only heuristic reason is the distance, and the meta line carries that.
    const reason =
      venue.enrichmentStatus === 'provider_only' ? '' : venue.familyScore.explanation.slice(0, 2).join(' · ');

    return (
      <PressableScale
        onPress={handleViewDetails}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${classification}, view details`}
        style={styles.compact}
      >
        <View style={styles.compactAccent} />
        <VenueImage
          uri={venue.imageUrl}
          category={venue.category}
          alt={venue.name}
          style={styles.compactImage}
          borderRadius={0}
        />
        <View style={styles.compactContent}>
          <Text variant="heading3" numberOfLines={2}>
            {venue.name}
          </Text>
          {/* The same badge as Home and Venue Detail, under the title rather than beside it: beside,
              it forced "Kettleford Play House" to truncate at 360 wide. */}
          <FamilyMatch score={venue.familyScore.score} enrichmentStatus={venue.enrichmentStatus} />
          {reason ? (
            <Text variant="bodySmall" color={colors.text.primary} numberOfLines={2} style={styles.compactReason}>
              {reason}
            </Text>
          ) : null}
          <Text variant="caption" color={colors.text.tertiary}>
            {venue.category.replace('_', ' ')} · {travelTimeLabel(venue.driveMinutes, 'estimated')}
            {venue.estimatedSpend ? ` · ${venue.estimatedSpend}` : ''}
          </Text>
          <Text variant="link" style={styles.compactCta}>
            {venue.enrichmentStatus === 'provider_only' ? 'Family details to check' : 'View family details'} →
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
          {isHero ? (
            <LinearGradient
              colors={[colors.gradient.heroStart, colors.gradient.heroEnd]}
              style={styles.heroScrim}
              pointerEvents="none"
            />
          ) : null}
          <View style={styles.badgeOverlay}>
            <FamilyMatch
              score={venue.familyScore.score}
              enrichmentStatus={venue.enrichmentStatus}
              tone="onImage"
            />
          </View>
          {isHero ? (
            <Text variant="heading1" color={colors.text.inverse} style={styles.heroNameOverlay} numberOfLines={2}>
              {venue.name}
            </Text>
          ) : null}
        </View>

        <View style={styles.content}>
          {isHero ? null : (
            <Text variant="heading3" numberOfLines={1}>
              {venue.name}
            </Text>
          )}

          <RecommendationPattern
            venue={venue}
            variant={variant}
            showCta
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
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  // Left edge accent signals match quality at a glance without covering the photo.
  compactAccent: {
    width: 4,
    backgroundColor: colors.secondary[500],
  },
  compactImage: {
    width: 92,
  },
  compactContent: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  compactReason: {
    lineHeight: 18,
  },
  compactCta: {
    marginTop: 2,
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
    height: 260,
  },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  badgeOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  heroNameOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  content: {
    padding: spacing.lg,
  },
});
