import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { CircleButton } from '@/src/components/ui/CircleButton';
import { FamilyFitBadge } from '@/src/components/ui/FamilyFitBadge';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getCardSignals } from '@/src/utils/family-signals';
import { formatCategory } from '@/src/utils/format-category';

interface PlaceShowcaseCardProps {
  venue: Venue;
  onPress: () => void;
  width: number;
  height?: number;
  style?: ViewStyle;
}

/**
 * The hero of the whole app: a tall photograph carrying the card, a scrim so white type
 * stays readable, and only the few facts a parent scans for. Everything else waits on the
 * detail screen.
 */
export function PlaceShowcaseCard({ venue, onPress, width, height, style }: PlaceShowcaseCardProps) {
  const signals = getCardSignals(venue, 3);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, see more`}
      style={[styles.card, { width, height: height ?? Math.round(width * 1.28) }, style]}
    >
      <VenueImage
        uri={venue.imageUrl}
        category={venue.category}
        alt={venue.name}
        style={styles.fill}
        borderRadius={0}
      />
      <LinearGradient
        colors={[colors.gradient.heroStart, colors.gradient.heroMid, colors.gradient.heroEnd]}
        locations={[0.32, 0.6, 1]}
        style={styles.fill}
        pointerEvents="none"
      />

      <View style={styles.saveSlot}>
        <View style={styles.saveGlass}>
          <SaveButton
            venueId={venue.id}
            venue={venue}
            size={20}
            color={colors.text.inverse}
            filledColor={colors.coral}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text variant="caption" color="rgba(255,255,255,0.82)" style={styles.eyebrow}>
          {formatCategory(venue.category)}
        </Text>
        <Text variant="heading1" color={colors.text.inverse} numberOfLines={2} style={styles.title}>
          {venue.name}
        </Text>

        <View style={styles.metaRow}>
          <FamilyFitBadge
            score={venue.familyScore.score}
            enrichmentStatus={venue.enrichmentStatus}
            tone="onImage"
          />
        </View>

        <View style={styles.signals}>
          {signals.map((signal) => (
            <View key={signal.key} style={styles.signal}>
              <Ionicons name={signal.icon} size={13} color="rgba(255,255,255,0.9)" />
              <Text variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={1}>
                {signal.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.cta} pointerEvents="none">
          <Text variant="heading3" color={colors.text.inverse} style={styles.ctaLabel}>
            See more
          </Text>
          <CircleButton
            icon="arrow-forward"
            accessibilityLabel={`See more about ${venue.name}`}
            tone="light"
            size={40}
            iconSize={18}
          />
        </View>
      </View>
    </PressableScale>
  );
}

/**
 * The layers stacked behind the active card in the Home deck. Only a strip of each one is
 * ever visible, and the locked design shows photography there — so this deliberately does
 * not run the active card's pipeline. No footer, no save, no badge, no CTA: a photograph,
 * the same corner radius, and a light scrim matching the reference's 0.35 rear treatment.
 */
export function PlaceShowcaseCardRear({
  venue,
  width,
  height,
  style,
}: Pick<PlaceShowcaseCardProps, 'venue' | 'width' | 'height' | 'style'>) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.card, { width, height: height ?? Math.round(width * 1.28) }, style]}
    >
      <VenueImage
        uri={venue.imageUrl}
        category={venue.category}
        alt=""
        style={styles.fill}
        borderRadius={0}
      />
      <View style={styles.rearScrim} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    backgroundColor: colors.primary[100],
  },
  rearScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.gradient.heroEnd,
    opacity: 0.35,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  saveSlot: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
  },
  saveGlass: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
  },
  eyebrow: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 2,
  },
  title: {
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  signals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.glass.darker,
  },
  ctaLabel: {
    letterSpacing: -0.2,
  },
});
