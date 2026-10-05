import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { StyleProp } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';

import { FamilyMatch } from '@/src/components/ui/FamilyMatch';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { SaveButton } from '@/src/components/shared/SaveButton';
import { spring } from '@/src/design-system/animations/presets';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { getTravelSignal } from '@/src/utils/family-signals';
import { matchCardReason } from '@/src/services/matching/family-match';
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
  /**
   * Set by the Home deck, which places every card with one continuous function. A card that is a rear strip
   * is the same component as the foreground card with its text, save control and CTA faded out, so the
   * photograph, the scrim and the text always move as one piece and a card changing role is never swapped.
   * `footerStyle` and `scrimStyle` are animated styles from the deck; unset, the card is fully emphasised.
   */
  footerStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  scrimStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  /** False for a card that is only a strip behind the foreground: no tap target, hidden from assistive tech. */
  interactive?: boolean;
  /** How the photograph loads. The deck loads every card it renders eagerly so a swipe never reveals a blank. */
  imageLoading?: 'lazy' | 'eager';
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
  footerStyle,
  scrimStyle,
  interactive = true,
  imageLoading,
}: PlaceShowcaseCardProps) {
  const pressed = useSharedValue(1);
  // The one line that changes a decision (what stands in the way, or what is confirmed), only where the card has the
  // room for it: on a short phone the card shrinks (see home-vertical-layout) and the photograph keeps the space.
  const cardHeight = height ?? Math.round(width * 1.28);
  const travel = getTravelSignal(venue.driveMinutes).label;
  const reason = venue.familyMatch && cardHeight >= 380 ? matchCardReason(venue.familyMatch) : '';
  // With the note showing, the journey leads the note and the badge row holds the badge alone, so a long badge
  // ("Good for Sloane and Theo") is never squeezed against the distance.
  const note = reason ? `${travel} · ${reason}` : '';
  const noteLines = cardHeight >= 410 ? 2 : 1;
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));

  // The card is ONE button and the save heart is a sibling control, never a child of it: a button
  // nested in a button cannot be reached by a screen reader or the keyboard. The button is an empty
  // overlay under the artwork; the artwork ignores the pointer, so a tap anywhere lands on it, and the
  // heart (the only thing above it that takes a tap) sits beside it in the tree.
  return (
    <Animated.View
      style={[styles.card, { width, height: height ?? Math.round(width * 1.28) }, style, pressStyle]}
      pointerEvents={interactive ? 'auto' : 'none'}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
    >
      {interactive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${venue.name}, see more`}
          style={styles.fill}
          onPressIn={() => {
            pressed.value = withSpring(0.97, spring.snappy);
          }}
          onPressOut={() => {
            pressed.value = withSpring(1, spring.gentle);
          }}
          onPress={() => {
            if (isSwiping?.()) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
        />
      ) : null}
      <VenueImage
        uri={venue.imageUrl}
        category={venue.category}
        alt={interactive ? venue.name : ''}
        style={styles.fill}
        borderRadius={0}
        showCredit={false}
        pointerEvents="none"
        loading={imageLoading}
      />
      <Animated.View style={[styles.fill, scrimStyle]} pointerEvents="none">
        <LinearGradient
          colors={SCRIM_COLORS}
          locations={SCRIM_STOPS}
          style={styles.fill}
          pointerEvents="none"
        />
      </Animated.View>

      {interactive ? (
        <Animated.View style={[styles.saveSlot, footerStyle]} pointerEvents="box-none">
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
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.footer, footerStyle]} pointerEvents="none">
        <Text variant="caption" color="rgba(255,255,255,0.92)" style={[styles.footerText, styles.eyebrow]}>
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
          <FamilyMatch
            score={venue.familyScore.score}
            enrichmentStatus={venue.enrichmentStatus}
            match={venue.familyMatch}
            tone="onImage"
          />
          {note ? null : (
            <Text variant="body" color="rgba(255,255,255,0.9)" numberOfLines={1} style={styles.distance}>
              {travel}
            </Text>
          )}
        </View>

        {note ? (
          <Text
            variant="caption"
            color="rgba(255,255,255,0.88)"
            numberOfLines={noteLines}
            style={[styles.footerText, styles.note]}
          >
            {note}
          </Text>
        ) : null}

        <View style={styles.cta} pointerEvents="none">
          <Text variant="heading3" color={colors.text.inverse} style={styles.ctaLabel}>
            See more
          </Text>
          <View style={[styles.ctaDisc, styles.ctaDiscFace]} aria-hidden>
            <Ionicons name="arrow-forward" size={20} color={colors.action} />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
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
// Green-black, not neutral black: the identity's photo cards fade into the brand green.
/**
 * Text drawn directly on a photograph needs to hold on a bright one too (a pale museum hall, a pale sky), and the
 * approved scrim only darkens the lower part of the card. A soft, tight shadow is invisible on the dark scrim and
 * is what keeps the category, name and journey time legible where the photograph is light.
 */
const ON_PHOTO_SHADOW = {
  textShadowColor: 'rgba(6, 28, 24, 0.5)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

const SCRIM_COLORS = [
  'rgba(10, 46, 39, 0)',
  'rgba(10, 46, 39, 0.3)',
  'rgba(10, 46, 39, 0.7)',
  'rgba(10, 46, 39, 0.9)',
] as const;
const SCRIM_STOPS: readonly [number, number, ...number[]] = [
  SCRIM_TOP,
  SCRIM_TOP + (1 - SCRIM_TOP) * 0.4,
  SCRIM_TOP + (1 - SCRIM_TOP) * 0.75,
  1,
];

/** The neutral the frame shows behind a photograph while it loads. */
const CARD_BACKDROP = '#B8BBBE';

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
    backgroundColor: 'rgba(10, 46, 39, 0.32)',
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
    ...ON_PHOTO_SHADOW,
    letterSpacing: 1.04,
    textTransform: 'uppercase',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 16,
    marginBottom: 4,
  },
  title: {
    ...ON_PHOTO_SHADOW,
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
    ...ON_PHOTO_SHADOW,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 17,
  },
  // One or two quiet lines between the badge row and the button, led by the journey.
  note: {
    ...ON_PHOTO_SHADOW,
    marginTop: -10,
    marginBottom: 12,
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    lineHeight: 16,
  },
  cta: {
    justifyContent: 'center',
    height: 58,
    borderRadius: radius.full,
    // The identity's one emphasised action is green, on the photograph too (Figma "Home v2").
    backgroundColor: colors.glass.action,
  },
  ctaLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16.5,
    lineHeight: 20,
    letterSpacing: 0,
    textAlign: 'center',
  },
  ctaDiscFace: {
    width: CTA_DISC,
    height: CTA_DISC,
    borderRadius: CTA_DISC / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisc: {
    position: 'absolute',
    right: 6,
    top: (58 - CTA_DISC) / 2,
  },
});
