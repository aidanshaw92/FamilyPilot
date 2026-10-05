import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WELCOME_ART, WELCOME_CUTOUTS } from '@/src/assets/art/figma-art';
import { WELCOME_PHOTOS } from '@/src/assets/welcome-photos';
import { BenefitCard } from '@/src/components/onboarding/BenefitCard';
import { BrandMark, Button, PhotoSlot, ScreenArt, Text } from '@/src/components/ui';
import { colors } from '@/src/design-system/tokens';
import { estimateLineCount } from '@/src/utils/home-header-layout';
import {
  WELCOME_BENEFITS,
  WELCOME_COLLAGE,
  WELCOME_FRAME_INSET,
  WELCOME_FRAME_WIDTH,
  WELCOME_PX,
  WELCOME_STAGE_END_PX,
} from '@/src/utils/welcome-layout';

/** Frame 166:128 at 393 pt, in points from the bottom of the status inset: lockup y 160px, headline
 * 276px, subtitle 443px (each minus the 59 pt status band). The type does not scale with the phone. */
const BRAND_TOP = 160 * WELCOME_PX - WELCOME_FRAME_INSET;
const HEADLINE_TOP = 276 * WELCOME_PX - WELCOME_FRAME_INSET;
const SUBTITLE_TOP = 443 * WELCOME_PX - WELCOME_FRAME_INSET;
const HEADLINE_WIDTH = 272;
/** Frame y below which the stickers are the collage's, not the header's. */
const STICKER_SEAM_PX = 330;
const SUBTITLE = 'Personalised days out, activities and recommendations for your family.';
/** Where the headline's first line ends (Bold 30.3, "The everyday app"), plus a gap: the giraffe starts no earlier. */
const GIRAFFE_MIN_LEFT = 24 + 264 + 4;

/**
 * Welcome, built from the approved frame 166:128: the E3 mark and wordmark, the headline, a collage
 * of photograph cut-outs shaped by the frame's own masks with its illustrated stickers over them,
 * three benefit cards and "Get started". The photographs come from `welcome-photos.ts`; a slot
 * without one renders the category gradient inside the same cut-out, which is a placeholder, not the
 * finished screen.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The collage and its stickers scale with the phone (capped, so a tablet gets the same composition);
  // the type does not.
  const stageWidth = Math.min(width, 480);
  const scale = stageWidth / WELCOME_FRAME_WIDTH;
  const k = stageWidth / 393;
  // The brand lockup scales with the stickers beside it (it is a logo, not running text), or the wordmark
  // runs into the strokes on a narrow phone. It never grows past the frame. Running text is NOT scaled: the
  // subtitle reflows instead (below).
  const ts = Math.min(1, k);
  // The subtitle wraps before the ice-cream sticker, which sits 628px into the frame and moves with the width.
  const subtitleWidth = Math.min(260, 628 * scale - 55 * WELCOME_PX - 6);
  // A third line would run into the collage, so the collage and its stickers move down by that line
  // rather than the text being shrunk. (The frame's subtitle is two lines at 20.7.)
  const subtitleLines = estimateLineCount(SUBTITLE, 14.8, subtitleWidth);
  const shift = Math.max(0, subtitleLines - 2) * 20.7;
  const inset = WELCOME_FRAME_INSET * k;
  const stageHeight = WELCOME_STAGE_END_PX * scale - inset + shift;
  const start = () => router.push('/(onboarding)/setup' as never);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* The scroll area takes only the height its content needs, so on a phone where everything
          fits (the frame's 393x852 does) "Get started" follows the third card as it does in the frame;
          on a shorter phone the content scrolls and the button stays in view. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 14 }}
      >
        <View style={{ width: stageWidth, height: stageHeight, alignSelf: 'center' }}>
          {WELCOME_COLLAGE.slots.map((slot) => {
            const cutout = WELCOME_CUTOUTS[slot.id];
            let w = cutout.width * scale;
            let h = cutout.height * scale;
            let left = cutout.x * scale;
            const top = cutout.y * scale - inset + (slot.id === 'zoo' ? 0 : shift);
            if (slot.id === 'zoo') {
              // The giraffe bleeds off the right edge. On a phone narrower than the frame, shrink it
              // about that edge rather than slide it under the headline.
              const right = left + w;
              const f = Math.max(0.6, Math.min(1, (right - GIRAFFE_MIN_LEFT) / w));
              left = right - w * f;
              w *= f;
              h *= f;
            }
            return (
              <PhotoSlot
                key={slot.id}
                category={slot.category}
                cutout={cutout}
                icon={slot.icon}
                source={WELCOME_PHOTOS[slot.id]}
                testID={`welcome-slot-${slot.id}`}
                width={w}
                height={h}
                style={{ left, top }}
              />
            );
          })}
          {/* The frame's stickers, drawn over the photographs and under the type. The strokes by the wordmark
              (above the seam) belong to the header and stay put; everything below moves with the collage. */}
          <ScreenArt
            art={WELCOME_ART}
            width={stageWidth}
            from={100}
            to={STICKER_SEAM_PX}
            anchor="top"
            style={{ top: 100 * scale - inset }}
          />
          <ScreenArt
            art={WELCOME_ART}
            width={stageWidth}
            from={STICKER_SEAM_PX}
            to={WELCOME_STAGE_END_PX}
            anchor="top"
            style={{ top: STICKER_SEAM_PX * scale - inset + shift }}
          />

          <View style={[styles.brandRow, { top: BRAND_TOP }]}>
            <BrandMark size={79.5 * WELCOME_PX * ts} tone="light" testID="welcome-brand-mark" decorative />
            <Text variant="heading2" style={[styles.brandName, { fontSize: 29.3 * ts, lineHeight: 36 * ts }]}>
              Family
              <Text variant="heading2" color={colors.action} style={[styles.brandName, { fontSize: 29.3 * ts, lineHeight: 36 * ts }]}>
                Pilot
              </Text>
            </Text>
          </View>

          <Text variant="display" style={[styles.headline, styles.headlineFont, { top: HEADLINE_TOP, maxWidth: HEADLINE_WIDTH }]}>
            The everyday app for family life
            <Text variant="display" color={colors.action} style={styles.headlineFont}>
              .
            </Text>
          </Text>
          <Text variant="body" color={colors.text.secondary} style={[styles.subtitle, { top: SUBTITLE_TOP, maxWidth: subtitleWidth }]}>
            {SUBTITLE}
          </Text>
        </View>

        <View style={styles.benefits}>
          {WELCOME_BENEFITS.map((benefit) => (
            <BenefitCard key={benefit.title} {...benefit} onPress={start} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Get started" fullWidth trailingIcon="arrow-forward" onPress={start} />
        <Text variant="caption" color={colors.text.tertiary} style={styles.footerNote}>
          Takes about a minute • You can add more details later.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  // Lockup 60px in (27.7pt): the mark 79.5px, the wordmark Bold 63.6px = 29.3pt 12pt after it.
  brandRow: {
    position: 'absolute',
    left: 60 * WELCOME_PX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 29.3,
    lineHeight: 36,
  },
  // Bold 65.6px = 30.3pt on a 35.3 line, two lines, 24pt in.
  headline: {
    position: 'absolute',
    left: 52 * WELCOME_PX,
  },
  headlineFont: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30.3,
    lineHeight: 35.3,
  },
  // 32px = 14.8pt on a 20.7 line, 25.4pt in.
  subtitle: {
    position: 'absolute',
    left: 55 * WELCOME_PX,
    maxWidth: 260,
    fontSize: 14.8,
    lineHeight: 20.7,
  },
  benefits: {
    paddingHorizontal: 48 * WELCOME_PX,
    paddingTop: 1,
    gap: 5.3,
  },
  footer: {
    gap: 7.5,
    paddingHorizontal: 47 * WELCOME_PX,
    paddingTop: 0,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 10.9,
    lineHeight: 14,
  },
});
