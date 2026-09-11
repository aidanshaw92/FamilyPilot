import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FadeInView } from '@/src/components/ui/FadeInView';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';

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

  if (variant === 'list') return (
    <PressableScale onPress={handleViewDetails} accessibilityRole="button" accessibilityLabel={`${venue.name}, view details`} style={styles.compact}>
      <VenueImage uri={venue.imageUrl} category={venue.category} alt={venue.name} style={styles.compactImage} />
      <View style={styles.compactContent}>
        <View style={styles.compactTitleRow}>
          <Text variant="heading3" numberOfLines={2} style={styles.compactTitle}>{venue.name}</Text>
          <View style={styles.scoreBadge} accessibilityLabel={`Family Match ${venue.familyScore.score}`}>
            <Text variant="bodySmall" style={styles.scoreText}>{venue.familyScore.score}</Text>
          </View>
        </View>
        <Text variant="bodySmall" color={colors.text.secondary}>{venue.category.replace('_', ' ')} · ~{venue.driveMinutes} min drive</Text>
        {venue.address ? <Text variant="caption" color={colors.text.secondary} numberOfLines={1}>{venue.address}</Text> : null}
        <Text variant="caption" color={colors.primary[600]}>{venue.enrichmentStatus === 'provider_only' ? 'Family details to check' : 'View family details'} →</Text>
      </View>
    </PressableScale>
  );

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
        <VenueImage
          uri={venue.imageUrl}
          category={venue.category}
          alt={venue.name}
          style={isHero ? { ...styles.image, ...styles.heroImage } : styles.image}
          borderRadius={isHero ? radius.lg : 0}
        />

        <View style={styles.content}>
          <Text variant={isHero ? 'heading2' : 'heading3'} numberOfLines={1}>
            {venue.name}
          </Text>

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
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  compactImage: {
    width: 92,
    height: 92,
  },
  compactContent: {
    flex: 1,
    gap: spacing.xs,
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  compactTitle: {
    flex: 1,
  },
  scoreBadge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary[50],
    borderWidth: 1,
    borderColor: colors.secondary[100],
  },
  scoreText: {
    color: colors.secondary[600],
    fontFamily: 'Inter_700Bold',
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
    borderWidth: 2,
    borderColor: colors.primary[100],
    ...shadows.bottomSheet,
  },
  image: {
    width: '100%',
    height: 150,
  },
  heroImage: {
    height: 220,
  },
  content: {
    padding: spacing.lg,
  },
});
