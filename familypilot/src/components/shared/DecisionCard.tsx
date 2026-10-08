import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ArrowCta } from '@/src/components/ui/ArrowCta';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { seedVenueDetail } from '@/src/services/venue-detail-seed';
import {
  EXPLORE_CARD_CONTENT_PADDING,
  EXPLORE_CARD_PADDING_LEFT,
  EXPLORE_CARD_PADDING_RIGHT,
  EXPLORE_CARD_PHOTO_WIDTH,
  exploreCardCtaLabel,
} from '@/src/utils/explore-card-layout';
import { getMatchClassification } from '@/src/utils/family-match-classification';
import { matchCardReason, matchClassification, withClosedLine } from '@/src/services/matching/family-match';

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
  const { width: windowWidth } = useWindowDimensions();
  const isHero = variant === 'hero';

  const handleViewDetails = () => {
    seedVenueDetail(venue);
    if (onViewDetails) {
      onViewDetails();
      return;
    }
    router.push(`/venue/${venue.id}` as never);
  };

  if (variant === 'list') {
    const match = venue.familyMatch;
    const classification = match ? matchClassification(match) : getMatchClassification(venue.familyScore.score, venue.enrichmentStatus);
    const unreviewed = venue.enrichmentStatus === 'provider_only';
    // Two concrete facts read as bespoke; one alone can look like a generic template repeated
    // across every card, so combine the two most relevant reasons where there's a second one.
    // (A third was tried and tested worse: numberOfLines={2} below just truncates it with an
    // ellipsis rather than showing it, which reads as a cut-off fragment instead of a fact.)
    // An unreviewed place has no reason line: the badge under the title already says "Not yet
    // reviewed", its only heuristic reason is the distance, and the meta line carries that.
    const reason = match ? withClosedLine(match, matchCardReason(match)) : unreviewed ? '' : venue.familyScore.explanation.slice(0, 2).join(' · ');
    const ctaLabel = exploreCardCtaLabel(windowWidth, unreviewed);

    // The Explore result card (Figma "Explore card", node 90:106): the photograph down the left,
    // then title, Family Fit, the reason line, the metadata and a compact green arrow CTA. The
    // reason says only what the evidence says: `familyScore.explanation` is built from confirmed
    // facts and the travel label from a computed time, so "Baby changing confirmed on site" and
    // "About 12 minutes from home" appear only when they are true.
    return (
      <PressableScale
        onPress={handleViewDetails}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${classification}, view details`}
        style={styles.compact}
      >
        <VenueImage
          uri={venue.imageUrl}
          category={venue.category}
          alt={venue.name}
          style={styles.compactImage}
          borderRadius={0}
        />
        <View style={styles.compactContent}>
          <Text variant="heading3" numberOfLines={2} style={styles.compactTitle}>
            {venue.name}
          </Text>
          {/* The same badge as Home and Venue Detail, under the title rather than beside it: beside,
              it forced "Kettleford Play House" to truncate at 360 wide. */}
          <FamilyMatch
            score={venue.familyScore.score}
            enrichmentStatus={venue.enrichmentStatus}
            match={match}
            size="explore"
            style={styles.compactFit}
          />
          {reason ? (
            <Text variant="bodySmall" color={colors.text.primary} numberOfLines={2} style={styles.compactReason}>
              {reason}
            </Text>
          ) : null}
          {/* Two lines, not one: the spend ("£8 to £15 for a family of four") is dynamic and long, and one line
              cut it to "£8 to £1…", which reads as a different price. The frame's own meta is the first line. */}
          <Text variant="caption" color={colors.text.secondary} numberOfLines={2} style={styles.compactMeta}>
            {venue.category.replace('_', ' ')} · {travelTimeLabel(venue.driveMinutes, 'estimated')}
            {venue.estimatedSpend ? ` · ${venue.estimatedSpend}` : ''}
          </Text>
          <ArrowCta
            size="compact"
            disc="mint"
            label={ctaLabel}
            onPress={handleViewDetails}
            // The card is the button; its CTA is the visible cue for it, not a second button inside it.
            decorative
            style={styles.compactCta}
          />
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
  // The approved Explore frame 294:133 (pt = px / 2.17): a 13.8 radius, a 111 photograph, the title
  // Bold 17.1, the reason lines 12.5 on 16.6, the meta 12.2, 9 between cards.
  compact: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 9,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...shadows.card,
  },
  compactImage: {
    width: EXPLORE_CARD_PHOTO_WIDTH,
  },
  compactTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17.1,
    lineHeight: 21,
  },
  compactFit: {
    marginTop: 6,
  },
  compactReason: {
    fontSize: 12.5,
    lineHeight: 16.6,
    marginTop: 7,
  },
  compactMeta: {
    fontSize: 12.2,
    lineHeight: 15,
    marginTop: 3,
  },
  compactContent: {
    flex: 1,
    paddingTop: EXPLORE_CARD_CONTENT_PADDING,
    paddingBottom: 11,
    paddingLeft: EXPLORE_CARD_PADDING_LEFT,
    paddingRight: EXPLORE_CARD_PADDING_RIGHT,
  },
  compactCta: {
    marginTop: 10,
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
