import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BackButton } from '@/src/components/ui/BackButton';
import { Text } from '@/src/components/ui';
import { ArrowCta } from '@/src/components/ui/ArrowCta';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { PLAN_SECTION_CONTROL_PADDING, planSectionLabels } from '@/src/utils/plan-section-labels';
import { safeFooterPadding } from '@/src/utils/safe-area';
import { PlanSectionView, PlanViewModel } from '@/src/services/planning/plan-view-model';

import { PlanStopCard } from './PlanStopCard';

/**
 * The approved Plan screen, rendering a `PlanViewModel` and nothing else.
 *
 * It holds no planning logic and no fixtures: every string on it came out of the planner, through
 * the view model, which is what makes this screen honest. If a day has one stop it shows one stop;
 * it does not pad the page to three to match a reference frame.
 *
 * The section nav switches which section is shown rather than scrolling to an anchor. Anchor
 * scrolling needs the nav to reflect scroll position to stay truthful, and a highlight that lags
 * the page is worse than a control whose state is exactly what you pressed.
 */

export interface PlanScreenViewProps {
  view: PlanViewModel;
  /**
   * Things true of this day that the planner itself could not know -- today, households the parent
   * chose that could not be planned for. Shown with the day rather than withheld, because a plan
   * that silently covers fewer people than were chosen reads as a correct answer.
   */
  notices?: string[];
  onBack: () => void;
  onSave: () => void;
  saved?: boolean;
  /** Insets, so the saved-plan action clears the home indicator on every device. */
  bottomInset?: number;
  topInset?: number;
}

export function PlanScreenView({
  view,
  notices = [],
  onBack,
  onSave,
  saved = false,
  bottomInset = 0,
  topInset = 0,
}: PlanScreenViewProps) {
  const [section, setSection] = useState<PlanSectionView['id']>('day');
  const { width } = useWindowDimensions();
  const sectionLabels = planSectionLabels(width, view.sections);
  // The approved design opens the first stop and leaves the rest closed.
  const [expanded, setExpanded] = useState<number[]>(view.stops.length ? [view.stops[0].index] : []);

  const toggle = (index: number) =>
    setExpanded((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );

  return (
    <View style={styles.container}>
      {/* Frame 03's header (nodes 70:16 to 70:23): the title and its dates centred between the back
          circle and the save control. */}
      <View style={[styles.header, { paddingTop: topInset + spacing.sm }]}>
        <View style={styles.headerCircle}>
          <BackButton onPress={onBack} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {view.title}
          </Text>
          <Text style={styles.headerDates} numberOfLines={1}>
            {view.dateSummary}
          </Text>
        </View>
        {/* The same action as the persistent button below, where a parent who has read to the end of
            a long day does not have to scroll back to find it. One handler, so the two cannot
            disagree about whether the day is saved. */}
        <Pressable
          onPress={onSave}
          disabled={saved}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Plan saved' : 'Save this plan'}
          accessibilityState={{ disabled: saved }}
          style={styles.headerCircle}
          testID="plan-save-header"
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={colors.action}
          />
        </Pressable>
      </View>

      {/* Primary navigation, so all three controls are visible at once: where the full labels would
          clip (360 and 390), the travel control takes its short label (`planSectionLabels`). The
          horizontal scroller stays only as a safety net for widths below the phone floor. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        style={styles.nav}
        contentContainerStyle={styles.navContent}
      >
        {view.sections.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => setSection(entry.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === entry.id }}
            aria-selected={section === entry.id}
            style={[styles.navItem, section === entry.id && styles.navItemActive]}
            testID={`plan-section-${entry.id}`}
          >
            <Text style={[styles.navLabel, section === entry.id && styles.navLabelActive]}>{sectionLabels[entry.id] ?? entry.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing['5xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Node 70:31: "Your Saturday plan"; the summary ("A 4-hour Saturday") is kept by the model
            for saved-plan lists, but this screen's dates row already says the span. */}
        <Text variant="heading2" style={styles.summary}>
          {view.dayName ? `Your ${view.dayName} plan` : 'Your plan'}
        </Text>

        {section === 'day' ? (
          <View>
            {/* Node 74:3: one quiet line, only when the planner recorded a routine the day is home
                before. Never an alert, never invented from the clock alone. */}
            {view.insight ? (
              <View style={styles.insight} testID="plan-insight">
                <Ionicons name="checkmark" size={14} color={colors.secondary[500]} />
                <Text style={styles.insightText} numberOfLines={1}>
                  {view.insight}
                </Text>
              </View>
            ) : null}
            {notices.length ? (
              <Block title="Before you go">
                {notices.map((line) => (
                  <Text key={line} variant="bodySmall" color={colors.warning[600]}>
                    {line}
                  </Text>
                ))}
              </Block>
            ) : null}
            {view.stops.map((stop) => (
              <View key={`${stop.placeId}-${stop.index}`}>
                <PlanStopCard stop={stop} expanded={expanded.includes(stop.index)} onToggle={() => toggle(stop.index)} />
              </View>
            ))}

            {/* Node 73:33: the terminus, with the time the planner says the family is home. */}
            {view.party[0] ? (
              <View style={styles.headHome} testID="plan-head-home">
                <View style={styles.terminus} />
                <Text style={styles.headHomeTime}>{view.party[0].homeLabel}</Text>
                <Text style={styles.headHomeLabel}>Head home</Text>
              </View>
            ) : null}

            {view.unknowns.length ? (
              <Block title="Nobody has confirmed these">
                {view.unknowns.map((line) => (
                  <Text key={line} variant="bodySmall" color={colors.warning[600]}>
                    {line}
                  </Text>
                ))}
              </Block>
            ) : null}

            {view.caveats.length ? (
              <Block title="Worth knowing">
                {view.caveats.map((line) => (
                  <Text key={line} variant="bodySmall" color={colors.text.secondary}>
                    {line}
                  </Text>
                ))}
              </Block>
            ) : null}
          </View>
        ) : null}

        {section === 'who' ? (
          <View style={styles.blocks}>
            {view.party.map((party) => (
              <Block key={party.familyId} title={party.label}>
                <Line label="Leaves home" value={party.departLabel} />
                <Line label="Back home" value={party.homeLabel} />
                <Line label="Latest they could leave" value={party.latestDepartureLabel} />
                {party.notes.map((note) => (
                  <Text key={note} variant="bodySmall" color={colors.text.secondary}>
                    {note}
                  </Text>
                ))}
              </Block>
            ))}
          </View>
        ) : null}

        {section === 'travel' ? (
          <View style={styles.blocks}>
            <Block title="Parking">
              {view.travel.parking.map((row) => (
                <Line
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  warn={row.unconfirmed}
                />
              ))}
            </Block>

            <Block title="Journeys">
              {view.travel.legs.length ? (
                view.travel.legs.map((leg, index) => (
                  <View key={`${leg.label}-${index}`} style={styles.leg}>
                    <Text variant="bodySmall">{leg.label}</Text>
                    <Text variant="caption" color={colors.text.secondary}>
                      {leg.minutesLabel} · {leg.sourceLabel}
                    </Text>
                  </View>
                ))
              ) : (
                <Text variant="bodySmall" color={colors.text.secondary}>
                  No journeys were needed for this day.
                </Text>
              )}
              <Text variant="caption" color={colors.text.secondary} style={styles.provenance}>
                {view.travel.provenanceNote}
              </Text>
              {view.travel.missingNote ? (
                <Text variant="caption" color={colors.warning[600]}>
                  {view.travel.missingNote}
                </Text>
              ) : null}
            </Block>
          </View>
        ) : null}
      </ScrollView>

      {/* Node 71:30: the CTA bar. Save this plan is this product's action here; the frame's invite
          CTA belongs to the pilot-gated Plans tab. */}
      <View style={[styles.footer, { paddingBottom: safeFooterPadding(bottomInset) }]}>
        <ArrowCta label={saved ? 'Saved' : 'Save this plan'} onPress={onSave} disabled={saved} testID="plan-save" />
      </View>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="eyebrow" style={styles.blockTitle}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.blockBody}>{children}</View>
    </View>
  );
}

function Line({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.lineLabel}>
        {label}
      </Text>
      <Text
        variant="bodySmall"
        color={warn ? colors.warning[600] : colors.text.primary}
        style={styles.lineValue}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerText: { flex: 1, gap: 2, alignItems: 'center' },
  // Node 70:22: SemiBold 17, -0.255; node 70:23: 13 secondary.
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 21, letterSpacing: -0.255, color: colors.ink, textAlign: 'center' },
  headerDates: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 16, color: colors.text.secondary, textAlign: 'center' },
  headerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `flexGrow: 0` keeps the horizontal scroller to its content's height instead of taking the
  // column's spare vertical space, which would push the day's content off the screen.
  nav: { flexGrow: 0, marginBottom: spacing.md },
  navContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.screenPadding,
  },
  // Node 70:25: 40 tall, radius 20; green when active, white when not. 16 either side rather than
  // the frame's 18 so the three full labels fit a 430 screen on one visible row.
  navItem: {
    height: 40,
    paddingHorizontal: PLAN_SECTION_CONTROL_PADDING,
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  navItemActive: { backgroundColor: colors.action },
  navLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 17, color: colors.ink },
  navLabelActive: { fontFamily: 'Inter_600SemiBold', color: colors.text.inverse },
  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.fill,
    paddingHorizontal: 15,
    marginBottom: spacing.lg,
  },
  insightText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 16, color: colors.text.secondary },
  headHome: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 44, paddingLeft: 42 - spacing.screenPadding },
  terminus: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.action },
  headHomeTime: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16, color: colors.ink },
  headHomeLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 18, color: colors.text.secondary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenPadding },
  summary: { marginBottom: spacing.md },
  blocks: { gap: spacing.md },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  blockTitle: { marginBottom: spacing.sm },
  blockBody: { gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineLabel: { width: 128 },
  lineValue: { flex: 1 },
  leg: { gap: 2 },
  provenance: { marginTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
