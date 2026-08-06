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

interface DecisionCardProps {
  venue: Venue;
  index?: number;
  variant?: 'carousel' | 'list' | 'hero';
  onGo?: () => void;
}

function DecisionCardComponent({
  venue,
  index = 0,
  variant = 'carousel',
  onGo,
}: DecisionCardProps) {
  const router = useRouter();
  const matchPercent = venue.familyScore.score;
  const isHero = variant === 'hero';

  const handleGo = () => {
    if (onGo) {
      onGo();
      return;
    }
    router.push(`/venue/${venue.id}` as never);
  };

  const handleCardPress = () => {
    router.push(`/venue/${venue.id}` as never);
  };

  const reasons = venue.familyScore.explanation.slice(0, isHero ? 3 : 2);

  return (
    <FadeInView delay={index * 60} style={variant === 'carousel' ? styles.carouselWrap : undefined}>
      <PressableScale
        onPress={handleCardPress}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${matchPercent} percent family match, ${venue.driveMinutes} minutes away`}
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
            <FamilyMatch score={matchPercent} variant="card" />
          </View>
        </View>

        <View style={styles.content}>
          <Text variant={isHero ? 'heading2' : 'heading3'} numberOfLines={1}>
            {venue.name}
          </Text>

          {isHero ? (
            <Text variant="caption" color={colors.text.secondary} style={styles.perfectLabel}>
              Top reasons today
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

          <View style={styles.metaRow}>
            <MetaChip icon="car-outline" label={`${venue.driveMinutes} min`} />
            {venue.estimatedSpend ? (
              <MetaChip icon="wallet-outline" label={`Est. ${venue.estimatedSpend}`} />
            ) : null}
            {venue.isOpen ? (
              <MetaChip icon="time-outline" label="Usually open" highlight />
            ) : null}
          </View>

          <Button
            label="GO"
            onPress={handleGo}
            size={isHero ? 'lg' : 'md'}
            style={styles.goButton}
          />
        </View>
      </PressableScale>
    </FadeInView>
  );
}

function MetaChip({
  icon,
  label,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metaChip, highlight && styles.metaChipHighlight]}>
      <Ionicons
        name={icon}
        size={12}
        color={highlight ? colors.secondary[600] : colors.text.secondary}
      />
      <Text variant="caption" color={highlight ? colors.secondary[600] : colors.text.secondary}>
        {label}
      </Text>
    </View>
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
  perfectLabel: {
    marginTop: spacing.sm,
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
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  metaChipHighlight: {
    backgroundColor: colors.secondary[50],
  },
  goButton: {
    width: '100%',
  },
});
