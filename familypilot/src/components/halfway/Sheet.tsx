import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { Button, Text } from '@/src/components/ui';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, fontFamily, radius, shadows, spacing } from '@/src/design-system/tokens';
import { isLargeText, useFontScale } from '@/src/hooks/use-font-scale';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { HalfwayOption, topCardLabel } from '@/src/services/planning/meet-halfway';
import { checksToShow, chipName, chipsFitBeside, missingJourneyNotice, placeUnreviewed, journeysKnown, positionLine } from '@/src/services/planning/halfway-view';
import { formatCategory } from '@/src/utils/format-category';

import { SheetSurface } from './chrome';
import { EvidenceLegend, FamilyFitMine, FamilyFitOther, FamilyFitUnreviewed, FitChips, JourneyComparison, LabelPill, bothChipName } from './parts';

/** A swipe on the grabber: up opens, down closes. The grabber is also a button, so nothing depends on the gesture. */
function useSwipe(onUp?: () => void, onDown?: () => void) {
  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24) onUp?.();
        else if (g.dy > 24) onDown?.();
      },
    }),
  ).current;
}

/** Below this window height the collapsed card is dense (smaller photo, journeys on a line) so the map keeps room to be a map. */
export const DENSE_SHEET_BELOW = 820;

/**
 * The recommendation under the map, collapsed: the engine's own label, the place, each family's Family Fit, the journeys and the
 * two actions. "Details" opens the full sheet. It stands on the screen's bottom edge; the floating navigation sits over its
 * foot, so it keeps `bottomClearance` of padding beneath the actions.
 */
export function CollapsedRecommendation({
  option,
  index,
  total,
  otherLabel,
  bottomClearance,
  onExpand,
  onPlan,
  onLayoutHeight,
  inline = false,
}: {
  option: HalfwayOption;
  index: number;
  total: number;
  otherLabel: string;
  bottomClearance: number;
  onExpand: () => void;
  onPlan: () => void;
  onLayoutHeight?: (height: number) => void;
  /** In the page's scroll (larger text) rather than standing on the screen's bottom edge over the map. */
  inline?: boolean;
}) {
  const swipe = useSwipe(onExpand);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const dense = windowHeight < DENSE_SHEET_BELOW;
  // At larger text the card is tall: it is then an ordinary block in the screen's scroll (`inline`) rather than a card over the map.
  const big = isLargeText(useFontScale());
  // The frame's 80 pt photo, with the chips beside it, where they fit; a smaller photo with the chips under it where not.
  const pair = placeUnreviewed(option)
    ? [{ name: bothChipName(otherLabel), grade: option.fits.mine.label }]
    : [
        { name: chipName('mine', ''), grade: option.fits.mine.label },
        { name: chipName('other', otherLabel), grade: option.fits.other.label },
      ];
  const beside = !dense && !big && chipsFitBeside(pair, windowWidth - 40 - 80 - 12);
  const thumb = beside ? 80 : dense ? 56 : 64;
  const chips = (
    <View style={beside ? styles.chipsBeside : styles.chips} testID="halfway-fit-chips">
      <FitChips option={option} otherLabel={otherLabel} />
    </View>
  );
  const notice = journeysKnown(option) ? null : missingJourneyNotice(option);
  const place = (
    <>
      <View style={styles.venueRow}>
        <VenueImage uri={option.venue.imageUrl} category={option.venue.category} alt={option.venue.name} style={{ width: thumb, height: thumb }} borderRadius={radius.lg} />
        <View style={styles.venueText}>
          <Text style={[styles.name, dense && styles.nameDense]} numberOfLines={big ? undefined : dense ? 1 : 2} testID="halfway-selected-name">{option.venue.name}</Text>
          <Text style={styles.category}>{formatCategory(option.venue.category)}</Text>
          {beside ? chips : null}
        </View>
      </View>
      {/* Long grades ("Not yet reviewed") do not fit beside the photo: they go under it, across the card, side by side,
          instead of stacking and making the sheet tall. */}
      {beside ? null : chips}
      <JourneyComparison option={option} dense={dense} />
      {notice ? <Text variant="caption" color={colors.text.secondary}>{notice.title}. {notice.body}</Text> : null}
    </>
  );
  return (
    <View style={inline ? undefined : styles.dock} onLayout={(e) => onLayoutHeight?.(e.nativeEvent.layout.height)} testID="halfway-sheet-collapsed" {...swipe.panHandlers}>
      <SheetSurface bottomPadding={Math.max(bottomClearance - 8, 0)} onGrab={onExpand} grabLabel="Show details">
        <View style={styles.topRow}>
          <LabelPill text={topCardLabel(option)} supported={option.supported} />
          <Text style={styles.position} testID="halfway-position">{`${index + 1} of ${total}`}</Text>
        </View>
        {place}
        <View style={[styles.actions, big && styles.actionsBig]}>
          <Button label="Plan this day" onPress={onPlan} style={big ? styles.planBig : styles.plan} testID="halfway-plan" />
          <Button label="Details" variant="outline" onPress={onExpand} style={big ? styles.planBig : styles.details} testID="halfway-details" />
        </View>
      </SheetSurface>
    </View>
  );
}

/**
 * The recommendation in full, over the map: the photo (or the labelled illustration), the engine's label, the journeys, and
 * Family Fit for each family with what is confirmed, what is only reasonable to expect and what is not checked yet. Your
 * family's is shown in full; the other family's is a grade and the words "based only on what they shared", and nothing more.
 * The actions stay pinned at the foot, above the navigation.
 */
export function ExpandedRecommendation({
  option,
  index,
  total,
  otherLabel,
  bottomClearance,
  top,
  onCollapse,
  onPlan,
  onOpenPlace,
}: {
  option: HalfwayOption;
  index: number;
  total: number;
  otherLabel: string;
  bottomClearance: number;
  top: number;
  onCollapse: () => void;
  onPlan: () => void;
  onOpenPlace: () => void;
}) {
  const reduced = useReducedMotion();
  const swipe = useSwipe(undefined, onCollapse);
  const notice = journeysKnown(option) ? null : missingJourneyNotice(option);
  const { needs, others } = checksToShow(option);
  // The pinned actions are taller at larger text (the labels wrap, the buttons stack): the scrolling content makes room for what they measure.
  const big = isLargeText(useFontScale());
  const [pinnedHeight, setPinnedHeight] = useState(0);
  const roomForActions = Math.max(bottomClearance + 92, pinnedHeight + 16);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="halfway-sheet-expanded">
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCollapse} accessibilityRole="button" accessibilityLabel="Close details" />
      </Animated.View>
      <Animated.View entering={reduced ? undefined : SlideInDown.duration(240)} style={[styles.expanded, { top }]} accessibilityViewIsModal accessibilityLabel={`${option.venue.name}, recommendation details`}>
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: roomForActions }}
          testID="halfway-sheet-scroll"
        >
          <View style={styles.hero}>
            <VenueImage uri={option.venue.imageUrl} category={option.venue.category} alt={option.venue.name} style={StyleSheet.absoluteFill} borderRadius={0} />
            <View style={styles.heroGrab} {...swipe.panHandlers}>
              <Pressable onPress={onCollapse} accessibilityRole="button" accessibilityLabel="Collapse details" hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}>
                <View style={styles.heroGrabber} />
              </Pressable>
            </View>
            <Pressable style={styles.close} onPress={onCollapse} accessibilityRole="button" accessibilityLabel="Close" testID="halfway-sheet-close">
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.body}>
            <View style={styles.identity}>
              <LabelPill text={topCardLabel(option)} supported={option.supported} />
              <Text variant="heading1" style={styles.bigName} accessibilityRole="header">{option.venue.name}</Text>
              <Text style={styles.position}>{positionLine(option, index, total)}</Text>
            </View>
            <View style={styles.section}>
              <JourneyComparison option={option} heading />
              <Text variant="caption" color={colors.text.tertiary}>Estimated drive time from distance.</Text>
              {notice ? (
                <View style={styles.notice}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noticeTitle}>{notice.title}</Text>
                    <Text style={styles.noticeBody}>{notice.body}</Text>
                  </View>
                </View>
              ) : null}
            </View>
            <View style={styles.section}>
              <Text variant="heading3" accessibilityRole="header">Family Fit</Text>
              <EvidenceLegend />
              {placeUnreviewed(option) ? (
                <FamilyFitUnreviewed option={option} label={otherLabel} />
              ) : (
                <>
                  <FamilyFitMine option={option} />
                  <FamilyFitOther option={option} label={otherLabel} />
                </>
              )}
            </View>
            {needs.length + others.length > 0 ? (
              <View style={styles.section} testID="halfway-before-you-go">
                <Text variant="heading3" accessibilityRole="header">Before you go</Text>
                {needs.length > 0 ? (
                  <View style={styles.needs} testID="halfway-needs-checking">
                    <Ionicons name="alert-circle-outline" size={18} color={colors.warning[600]} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.needsTitle}>Needs checking before you go</Text>
                      {needs.map((line) => (
                        <Text key={line} style={styles.needsBody}>{line}.</Text>
                      ))}
                    </View>
                  </View>
                ) : null}
                {others.map((line) => (
                  <View key={line} style={styles.checkRow}>
                    <Ionicons name="help-circle-outline" size={18} color={colors.text.tertiary} style={{ marginTop: 1 }} />
                    <Text style={styles.checkText}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={[styles.pinned, { paddingBottom: bottomClearance - 10, paddingTop: 12 }]} pointerEvents="box-none" onLayout={(e) => setPinnedHeight(e.nativeEvent.layout.height)}>
          <View style={styles.pinnedFade} pointerEvents="none" />
          <View style={[styles.actions, big && styles.actionsBig]}>
            <Button label="Plan this day" onPress={onPlan} style={big ? styles.planBig : styles.plan} testID="halfway-plan" />
            <Button label="See the place" variant="outline" onPress={onOpenPlace} style={big ? styles.planBig : styles.details} testID="halfway-see-place" />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  position: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17, color: colors.text.secondary, flexShrink: 0 },
  venueRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  thumb: { width: 72, height: 72 },
  thumbDense: { width: 60, height: 60 },
  venueText: { flex: 1, gap: 2, justifyContent: 'center' },
  name: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: colors.ink },
  nameDense: { fontSize: 19, lineHeight: 23 },
  category: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 18, color: colors.text.secondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chipsBeside: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionsBig: { flexWrap: 'wrap' },
  planBig: { flexGrow: 1, flexBasis: 150 },
  plan: { flex: 1.45 },
  details: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.sheetScrim },
  expanded: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden', ...shadows.bottomSheet },
  scroll: { flex: 1 },
  hero: { height: 126, backgroundColor: colors.fill },
  heroGrab: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  heroGrabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.85)' },
  close: { position: 'absolute', top: 8, right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  body: { paddingHorizontal: spacing.screenPadding, paddingTop: 14, gap: 18 },
  identity: { gap: 6 },
  bigName: { marginTop: 2 },
  section: { gap: 10 },
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.screenPadding },
  pinnedFade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: -2, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderLight },
  needs: { flexDirection: 'row', gap: 8, backgroundColor: colors.warning[50], borderColor: colors.warning[100], borderWidth: 1, borderRadius: radius.lg, padding: 12 },
  needsTitle: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18, color: colors.warning[600] },
  needsBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 19, color: colors.ink },
  checkRow: { flexDirection: 'row', gap: 10 },
  checkText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: colors.text.secondary },
  notice: { flexDirection: 'row', gap: 8, backgroundColor: colors.fill, borderRadius: radius.lg, padding: 12 },
  noticeTitle: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18, color: colors.text.secondary },
  noticeBody: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, color: colors.ink },
});
