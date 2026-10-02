import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
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
  // The approved design opens the first stop and leaves the rest closed.
  const [expanded, setExpanded] = useState<number[]>(view.stops.length ? [view.stops[0].index] : []);

  const toggle = (index: number) =>
    setExpanded((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );

  let lastPeriod: string | null = null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + spacing.sm }]}>
        <BackButton onPress={onBack} />
        <View style={styles.headerText}>
          <Text variant="heading3" numberOfLines={1}>
            {view.title}
          </Text>
          <Text variant="caption" color={colors.text.secondary}>
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
          style={styles.headerSave}
          testID="plan-save-header"
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={saved ? colors.primary[500] : colors.text.secondary}
          />
        </Pressable>
      </View>

      {/* Scrolls in its own container rather than pushing the page sideways. At 360 wide the three
          approved labels come to 364px, so a fixed row made the whole Plan screen scroll
          horizontally; the nav is horizontal by design, so this is where that scroll belongs. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.nav}
        contentContainerStyle={styles.navContent}
      >
        {view.sections.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => setSection(entry.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === entry.id }}
            style={[styles.navItem, section === entry.id && styles.navItemActive]}
            testID={`plan-section-${entry.id}`}
          >
            <Text
              variant="bodySmall"
              color={section === entry.id ? colors.text.inverse : colors.text.secondary}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing['5xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading1" style={styles.summary}>
          {view.summary}
        </Text>

        {section === 'day' ? (
          <View>
            {notices.length ? (
              <Block title="Before you go">
                {notices.map((line) => (
                  <Text key={line} variant="bodySmall" color={colors.warning[600]}>
                    {line}
                  </Text>
                ))}
              </Block>
            ) : null}
            {view.stops.map((stop) => {
              const periodLabel = stop.period === lastPeriod ? undefined : stop.period;
              lastPeriod = stop.period;
              return (
                <PlanStopCard
                  key={`${stop.placeId}-${stop.index}`}
                  stop={stop}
                  periodLabel={periodLabel}
                  expanded={expanded.includes(stop.index)}
                  onToggle={() => toggle(stop.index)}
                />
              );
            })}

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

      <View style={[styles.footer, { paddingBottom: bottomInset + spacing.md }]}>
        <Button
          label={saved ? 'Saved' : 'Save this plan'}
          onPress={onSave}
          disabled={saved}
          testID="plan-save"
        />
      </View>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="label" color={colors.text.secondary} style={styles.blockTitle}>
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
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  headerSave: { padding: spacing.xs },
  // `flexGrow: 0` keeps the horizontal scroller to its content's height instead of taking the
  // column's spare vertical space, which would push the day's content off the screen.
  nav: { flexGrow: 0, marginBottom: spacing.md },
  navContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.screenPadding,
  },
  navItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  navItemActive: { backgroundColor: colors.text.primary, borderColor: colors.text.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenPadding },
  summary: { marginBottom: spacing.sm },
  blocks: { gap: spacing.md },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  blockTitle: { letterSpacing: 0.8, marginBottom: spacing.sm },
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
