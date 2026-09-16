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
import { getTravelSignal } from '@/src/utils/family-signals';
import { formatCategory } from '@/src/utils/format-category';

interface PlaceShowcaseCardProps {
  venue: Venue;
  onPress: () => void;
  width: number;
  height?: number;
  style?: ViewStyle;
  /**
   * Set by a container that also drags this card, such as the Home deck. Asked at the moment of
   * the press, so a swipe that ends inside the card is not mistaken for a tap.
   */
  isSwiping?: () => boolean;
}

/**
 * The hero of the whole app: a tall photograph carrying the card, a scrim so white type
 * stays readable, and only the few facts a parent scans for. Everything else waits on the
 * detail screen.
 *
 * The photograph is a preview. Google's policy lets a space-constrained preview omit the
 * per-photo author attribution as long as the user can reach a larger version that carries it in
 * full — which is what tapping through to the venue does. Home instead carries the Google Maps
 * mark once, beneath the deck.
 */
export function PlaceShowcaseCard({
  venue,
  onPress,
  width,
  height,
  style,
  isSwiping,
}: PlaceShowcaseCardProps) {

  return (
    <PressableScale
      onPress={() => {
        if (isSwiping?.()) return;
        onPress();
      }}
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
        showCredit={false}
        pointerEvents="none"
      />
      <LinearGradient
        colors={SCRIM_COLORS}
        locations={SCRIM_STOPS}
        style={styles.fill}
        pointerEvents="none"
      />

      <View style={styles.saveSlot}>
        <View style={styles.saveGlass}>
          <SaveButton
            venueId={venue.id}
            venue={venue}
            size={22}
            color={colors.text.inverse}
            filledColor={colors.coral}
            isSwiping={isSwiping}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text variant="caption" color="rgba(255,255,255,0.82)" style={[styles.footerText, styles.eyebrow]}>
          {formatCategory(venue.category)}
        </Text>
        <Text
          variant="heading1"
          color={colors.text.inverse}
          numberOfLines={2}
          style={[styles.footerText, styles.title]}
        >
          {venue.name}
        </Text>

        {/* Frame: one meta row — the Family Fit badge with travel time beside it, not below. */}
        <View style={[styles.footerText, styles.metaRow]}>
          <FamilyFitBadge
            score={venue.familyScore.score}
            enrichmentStatus={venue.enrichmentStatus}
            tone="onImage"
          />
          <Text variant="body" color="rgba(255,255,255,0.9)" numberOfLines={1} style={styles.distance}>
            {getTravelSignal(venue.driveMinutes).label}
          </Text>
        </View>

        <View style={styles.cta} pointerEvents="none">
          <Text variant="heading3" color={colors.text.inverse} style={styles.ctaLabel}>
            See more
          </Text>
          <CircleButton
            icon="arrow-forward"
            accessibilityLabel={`See more about ${venue.name}`}
            tone="light"
            size={CTA_DISC}
            iconSize={20}
            style={styles.ctaDisc}
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
  // The frame scales a rear card whole, corner radius included: the next card's 21.327 is the
  // active card's 28 at its own 0.7617.
  const borderRadius = radius['3xl'] * (width / ACTIVE_CARD_WIDTH);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.card,
        styles.rearCard,
        { width, height: height ?? Math.round(width * 1.28), borderRadius },
        style,
      ]}
    >
      <VenueImage
        uri={venue.imageUrl}
        category={venue.category}
        alt=""
        style={styles.fill}
        borderRadius={0}
        showCredit={false}
        pointerEvents="none"
      />
      <LinearGradient
        colors={SCRIM_COLORS}
        locations={SCRIM_STOPS}
        style={[styles.fill, styles.rearScrim]}
        pointerEvents="none"
      />
    </View>
  );
}

/** Frame: the CTA runs to 14 from each card edge and carries a 46px arrow disc inset 6. */
const CTA_INSET = 14;
const CTA_DISC = 46;

/**
 * The frame's scrim (node 8:6) is a separate box covering the card's bottom 300 of 428, filled
 * with a four-stop ramp. Expressed here across the whole card, so one gradient does the job:
 * its first stop sits where the frame's box begins.
 */
const SCRIM_TOP = 128 / 428;
const SCRIM_COLORS = [
  'rgba(8, 8, 10, 0)',
  'rgba(8, 8, 10, 0.26)',
  'rgba(8, 8, 10, 0.66)',
  'rgba(8, 8, 10, 0.88)',
] as const;
const SCRIM_STOPS: readonly [number, number, ...number[]] = [
  SCRIM_TOP,
  SCRIM_TOP + (1 - SCRIM_TOP) * 0.4,
  SCRIM_TOP + (1 - SCRIM_TOP) * 0.75,
  1,
];

/** The neutral the frame shows behind a photograph while it loads. */
const CARD_BACKDROP = '#B8BBBE';

/** The active card's width on the frame's artboard, used to scale a rear card's radius. */
const ACTIVE_CARD_WIDTH = 312;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    backgroundColor: CARD_BACKDROP,
    shadowColor: 'rgba(15, 15, 20, 1)',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 10,
  },
  // The frame runs the same ramp behind a rear card, at a third of the strength.
  rearScrim: {
    opacity: 0.35,
  },
  rearCard: {
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
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
    backgroundColor: 'rgba(20, 20, 23, 0.32)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // The footer's rhythm is the frame's own, measured card-local on node 8:4 (312 x 428):
  // eyebrow y=244 h=16, title y=264 h=31, meta y=306 h=32, CTA y=356 h=58, 14 to the card edge.
  footer: {
    position: 'absolute',
    left: CTA_INSET,
    right: CTA_INSET,
    bottom: CTA_INSET,
  },
  // Text sits at x=20 while the CTA runs wider, to x=14.
  footerText: {
    marginHorizontal: spacing.xl - CTA_INSET,
  },
  eyebrow: {
    letterSpacing: 1.04,
    textTransform: 'uppercase',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 16,
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.52,
    marginBottom: 11,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 32,
    marginBottom: 18,
  },
  distance: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 17,
  },
  cta: {
    justifyContent: 'center',
    height: 58,
    borderRadius: radius.full,
    backgroundColor: 'rgba(18, 18, 20, 0.72)',
  },
  ctaLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16.5,
    lineHeight: 20,
    letterSpacing: 0,
    textAlign: 'center',
  },
  ctaDisc: {
    position: 'absolute',
    right: 6,
    top: (58 - CTA_DISC) / 2,
  },
});
