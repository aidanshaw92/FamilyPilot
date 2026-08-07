import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';

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
  const classification = getMatchClassification(venue.familyScore.score);
  const reasons = venue.familyScore.explanation.slice(0, isHero ? 3 : 2);
  const cautions = (venue.goodToKnow ?? []).slice(0, isHero ? 2 : 1);

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails();
      return;
    }
    router.push(`/venue/${venue.id}` as never);
  };

  return (
    <FadeInView delay={index * 60} style={variant === 'carousel' ? styles.carouselWrap : undefined}>
      <PressableScale
        onPress={handleViewDetails}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${classification}, ${venue.driveMinutes} minutes away`}
        style={[
          styles.card,
          variant === 'carousel' && styles.carousel,
          variant === 'list' && styles.list,
          variant === 'hero' && styles.hero,
        ]}
      >
        <View style={styles.imageWrap}>
          <VenueImage
            uri={venue.imageUrl}
            category={venue.category}
            alt={venue.name}
            style={isHero ? { ...styles.image, ...styles.heroImage } : styles.image}
            borderRadius={0}
          />
          <View style={styles.matchPill}>
            <FamilyMatch score={venue.familyScore.score} variant="card" />
          </View>
        </View>

        <View style={styles.content}>
          <Text variant={isHero ? 'heading2' : 'heading3'} numberOfLines={1}>
            {venue.name}
          </Text>

          <Text variant="bodySmall" color={colors.text.secondary} style={styles.metaLine}>
            {venue.driveMinutes} min away
            {venue.estimatedSpend ? ` · Estimated ${venue.estimatedSpend}` : ''}
          </Text>

          {isHero ? (
            <Text variant="bodySmall" style={styles.sectionLabel}>
              Why it suits your family
            </Text>
          ) : null}

          {reasons.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Ionicons name="checkmark-circle" size={14} color={colors.secondary[500]} />
              <Text variant="bodySmall" numberOfLines={2} style={styles.reason}>
                {reason}
              </Text>
            </View>
          ))}

          {cautions.length > 0 ? (
            <View style={styles.cautionBlock}>
              {isHero ? (
                <Text variant="bodySmall" style={styles.sectionLabel}>
                  Good to know
                </Text>
              ) : null}
              {cautions.map((item) => (
                <View key={item} style={styles.cautionRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.warning[600]} />
                  <Text variant="bodySmall" style={styles.cautionText} numberOfLines={2}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Button
            label="View details"
            onPress={handleViewDetails}
            size={isHero ? 'lg' : 'md'}
            style={styles.ctaButton}
          />
        </View>
      </PressableScale>
    </FadeInView>
  );
}

export const DecisionCard = memo(DecisionCardComponent);

const styles = StyleSheet.create({
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
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 150,
  },
  heroImage: {
    height: 200,
  },
  matchPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  content: {
    padding: spacing.lg,
  },
  metaLine: {
    marginTop: spacing.sm,
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
  reason: {
    flex: 1,
    color: colors.text.primary,
    lineHeight: 20,
  },
  cautionBlock: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  ctaButton: {
    width: '100%',
    marginTop: spacing.lg,
  },
});
