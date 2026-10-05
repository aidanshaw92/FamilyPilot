import { useRouter } from 'expo-router';
import { accountRequired } from '@/src/stores/auth-store';
import { useState } from 'react';
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
  WELCOME_BRAND,
  WELCOME_COLLAGE,
  WELCOME_FRAME_INSET,
  WELCOME_FRAME_WIDTH,
  WELCOME_GIRAFFE_MIN_LEFT,
  WELCOME_HEADLINE,
  WELCOME_PX,
  WELCOME_STAGE_END_PX,
  WELCOME_SUBTITLE,
  welcomeLineShift,
  welcomeSubtitleWidth,
} from '@/src/utils/welcome-layout';

/** Frame 166:128 at 393 pt, in points from the bottom of the status inset (each minus the 59 pt status band).
 * The type does not scale with the phone. */
const BRAND_TOP = WELCOME_BRAND.topPx * WELCOME_PX - WELCOME_FRAME_INSET;
const HEADLINE_TOP = WELCOME_HEADLINE.topPx * WELCOME_PX - WELCOME_FRAME_INSET;
const SUBTITLE_TOP = WELCOME_SUBTITLE.topPx * WELCOME_PX - WELCOME_FRAME_INSET;
/** Frame y below which the stickers are the collage's, not the header's. */
const STICKER_SEAM_PX = 330;
const HEADLINE = 'The everyday app for family life';
const SUBTITLE = 'Personalised days out, activities and recommendations for your family.';
/** The first line of Welcome's own art that is a header mark (the strokes by the wordmark) starts here. */
const HEADER_ART_START_PX = 100;
/** The collage's width is capped, so a tablet gets the same composition rather than a stretched one. */
const MAX_STAGE_WIDTH = 480;
/** Frame 166:128 is drawn at the 393pt reference width. */
const REFERENCE_WIDTH = 393;
/** The giraffe may shrink about its right edge to this fraction to stay clear of the headline, no further. */
const GIRAFFE_MIN_SCALE = 0.6;

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
  const stageWidth = Math.min(width, MAX_STAGE_WIDTH);
  const scale = stageWidth / WELCOME_FRAME_WIDTH;
  const k = stageWidth / REFERENCE_WIDTH;
  // The brand lockup scales with the stickers beside it (it is a logo, not running text), or the wordmark
  // runs into the strokes on a narrow phone. It never grows past the frame. Running text is NOT scaled: the
  // subtitle reflows instead (below).
  const ts = Math.min(1, k);
  // The subtitle wraps before the ice-cream sticker, which moves with the width.
  const subtitleWidth = welcomeSubtitleWidth(scale);
  // The frame sets the headline and the subtitle on two lines each. If either takes a third (a narrow phone,
  // or a font that runs wider than expected), the collage and its stickers move down by that line rather
  // than the text being shrunk or running into the photographs. The estimate is the first paint; the lines
  // the text really took, measured after layout, replace it, so a difference between the two never leaves
  // the collage overlapping the type or leaving a gap.
  const [measured, setMeasured] = useState<{ headline?: number; subtitle?: number }>({});
  const headlineLines =
    measured.headline ?? estimateLineCount(HEADLINE, WELCOME_HEADLINE.fontSize, WELCOME_HEADLINE.maxWidth, 'bold');
  const subtitleLines = measured.subtitle ?? estimateLineCount(SUBTITLE, WELCOME_SUBTITLE.fontSize, subtitleWidth);
  const shift = welcomeLineShift(headlineLines, subtitleLines, k);
  const inset = WELCOME_FRAME_INSET * k;
  const stageHeight = WELCOME_STAGE_END_PX * scale - inset + shift.collage;
  // Everyone has an account: Get started goes to creating one (or, in a build with no account backend, straight to
  // the family). The family's details are collected after it, and stay on the device.
  const start = () => router.push((accountRequired() ? '/(onboarding)/account' : '/(onboarding)/setup') as never);

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
            const top = cutout.y * scale - inset + (slot.id === 'zoo' ? 0 : shift.collage);
            if (slot.id === 'zoo') {
              // The giraffe bleeds off the right edge. On a phone narrower than the frame, shrink it
              // about that edge rather than slide it under the headline.
              const right = left + w;
              const f = Math.max(GIRAFFE_MIN_SCALE, Math.min(1, (right - WELCOME_GIRAFFE_MIN_LEFT) / w));
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
            from={HEADER_ART_START_PX}
            to={STICKER_SEAM_PX}
            anchor="top"
            style={{ top: HEADER_ART_START_PX * scale - inset }}
          />
          <ScreenArt
            art={WELCOME_ART}
            width={stageWidth}
            from={STICKER_SEAM_PX}
            to={WELCOME_STAGE_END_PX}
            anchor="top"
            style={{ top: STICKER_SEAM_PX * scale - inset + shift.collage }}
          />

          <View style={[styles.brandRow, { top: BRAND_TOP }]}>
            <BrandMark size={WELCOME_BRAND.markPx * WELCOME_PX * ts} tone="light" testID="welcome-brand-mark" decorative />
            <Text variant="heading2" style={[styles.brandName, { fontSize: WELCOME_BRAND.fontSize * ts, lineHeight: WELCOME_BRAND.lineHeight * ts }]}>
              Family
              <Text variant="heading2" color={colors.action} style={[styles.brandName, { fontSize: WELCOME_BRAND.fontSize * ts, lineHeight: WELCOME_BRAND.lineHeight * ts }]}>
                Pilot
              </Text>
            </Text>
          </View>

          <Text
            variant="display"
            onLayout={(e) => {
              const lines = Math.max(1, Math.round(e.nativeEvent.layout.height / WELCOME_HEADLINE.lineHeight));
              setMeasured((m) => (m.headline === lines ? m : { ...m, headline: lines }));
            }}
            style={[styles.headline, styles.headlineFont, { top: HEADLINE_TOP, maxWidth: WELCOME_HEADLINE.maxWidth }]}
          >
            {HEADLINE}
            <Text variant="display" color={colors.action} style={styles.headlineFont}>
              .
            </Text>
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            onLayout={(e) => {
              const lines = Math.max(1, Math.round(e.nativeEvent.layout.height / WELCOME_SUBTITLE.lineHeight));
              setMeasured((m) => (m.subtitle === lines ? m : { ...m, subtitle: lines }));
            }}
            style={[styles.subtitle, { top: SUBTITLE_TOP + shift.headline, maxWidth: subtitleWidth }]}
          >
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
    left: WELCOME_BRAND.leftPx * WELCOME_PX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandName: {
    fontFamily: 'Inter_700Bold',
    fontSize: WELCOME_BRAND.fontSize,
    lineHeight: WELCOME_BRAND.lineHeight,
  },
  // Bold 65.6px = 30.3pt on a 35.3 line, two lines, 24pt in.
  headline: {
    position: 'absolute',
    left: WELCOME_HEADLINE.leftPx * WELCOME_PX,
  },
  headlineFont: {
    fontFamily: 'Inter_700Bold',
    fontSize: WELCOME_HEADLINE.fontSize,
    lineHeight: WELCOME_HEADLINE.lineHeight,
  },
  // 32px = 14.8pt on a 20.7 line, 25.4pt in.
  subtitle: {
    position: 'absolute',
    left: WELCOME_SUBTITLE.leftPx * WELCOME_PX,
    maxWidth: WELCOME_SUBTITLE.maxWidth,
    fontSize: WELCOME_SUBTITLE.fontSize,
    lineHeight: WELCOME_SUBTITLE.lineHeight,
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
