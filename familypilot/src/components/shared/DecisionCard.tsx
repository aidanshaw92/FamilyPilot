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
      <VenueImage uri={venue.imageUrl} alt={venue.name} style={{ width: 88, height: 88 }} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text variant="heading3" numberOfLines={2}>{venue.name}</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>{venue.category.replace('_', ' ')} · ~{venue.driveMinutes} min drive</Text>
        <Text variant="caption" color={colors.text.secondary} numberOfLines={1}>{venue.address}</Text>
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
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderLight },
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
