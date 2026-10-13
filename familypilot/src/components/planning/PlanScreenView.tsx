import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BackButton } from '@/src/components/ui/BackButton';
import { Chip, Text } from '@/src/components/ui';
import { ArrowCta } from '@/src/components/ui/ArrowCta';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { familyDisplayName } from '@/src/utils/family-title';
import { PLAN_SECTION_CONTROL_PADDING, planSectionLabels } from '@/src/utils/plan-section-labels';
import { safeFooterPadding } from '@/src/utils/safe-area';
import {
  PlanAdviceOptionView,
  PlanAdviceView,
  PlanSectionView,
  PlanViewModel,
} from '@/src/services/planning/plan-view-model';

import { PlanStopCard } from './PlanStopCard';
import { PlanTimeline } from './PlanTimeline';
import { TimelineEdit, TimelineRow } from '@/src/services/planning/plan-timeline';

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
  /** Applies one of the options under a piece of routine advice: the plan builds again with that change. */
  onApplyOption?: (option: PlanAdviceOptionView) => void;
  /**
   * "Keep it as planned": the parent has seen the plan runs into a routine and chooses it anyway (signature), or takes that
   * back (null). Absent on a saved plan, which can only be changed by editing it.
   */
  onKeepConflict?: (signature: string | null) => void;
  /** Stay a particular length: the full visit back after FamilyPilot shortened it for a routine. */
  onChooseVisit?: (minutes: number) => void;
  /** Reopens Create a plan on this plan's answers, so the length (or anything else) can be changed. Absent on a saved plan. */
  onChangePlan?: () => void;
  /** Adds lunch to the day, or takes it out, and builds the plan again. */
  onToggleLunch?: () => void;
  /** The day as a timeline (plan-timeline.ts). Absent, the stop cards alone describe the day. */
  timeline?: TimelineRow[];
  /** A row's change (arrival, visit length, lunch, the earlier departure): the screen re-plans. */
  onEditRow?: (edit: TimelineEdit, row: TimelineRow) => void;
  /** On a saved day: open it for editing, from its saved answers. */
  onEditPlan?: () => void;
  /** A saved plan opened again (from Plans): there is nothing to save, and the action is Add to calendar. */
  saved?: boolean;
  /**
   * Where saving a freshly built day has got to. "saved" is only ever said once the day is confirmed in the phone's
   * storage (save-plan.ts); "already" is the same day saved before, recognised by its content.
   */
  saveState?: 'idle' | 'saving' | 'saved' | 'already' | 'failed';
  saveError?: string;
  /** Opens the plan that was just saved, as it now appears in Plans. */
  onViewPlan?: () => void;
  /** A plan reached through "View plan": the way on to the Plans list, where it now sits. */
  onSeeAllPlans?: () => void;
  /** Hands the plan to the phone's calendar (add-to-calendar.ts). Offered only for a plan that is saved. */
  onAddToCalendar?: () => void;
  /** What happened after Add to calendar, when there is something to say. */
  calendarMessage?: string;
  /**
   * Sending or sharing this day. `to` is the connected family (or families) it can be sent to in the app, as one phrase;
   * absent when the day was planned with nobody connected. `status` says where a sent day has got to ("Kevin’s family
   * accepted"), from the invitation itself.
   */
  share?: {
    to?: string;
    state: 'idle' | 'sending' | 'sent' | 'failed';
    message?: string;
    status?: { text: string; tone: 'waiting' | 'accepted' | 'declined' };
    /** Saves (when not yet saved) and sends. */
    onSend?: () => void;
    /** The phone's share sheet, with the day in a few lines: for a family without an account, or anyone else. */
    onShareText?: () => void;
  };
  /** This day is an invitation from a connected family: the reader answers it here instead of saving it. */
  invite?: {
    fromLabel: string;
    status: 'pending' | 'accepted' | 'declined';
    busy: boolean;
    error?: string;
    onAccept: () => void;
    onDecline: () => void;
  };
  /** Insets, so the saved-plan action clears the home indicator on every device. */
  bottomInset?: number;
  topInset?: number;
}

export function PlanScreenView({
  view,
  notices = [],
  onBack,
  onSave,
  onApplyOption,
  onKeepConflict,
  onChooseVisit,
  onChangePlan,
  onToggleLunch,
  timeline,
  onEditRow,
  onEditPlan,
  saved = false,
  saveState = 'idle',
  saveError,
  onViewPlan,
  onSeeAllPlans,
  onAddToCalendar,
  calendarMessage,
  share,
  invite,
  bottomInset = 0,
  topInset = 0,
}: PlanScreenViewProps) {
  const done = saved || saveState === 'saved' || saveState === 'already';
  const [section, setSection] = useState<PlanSectionView['id']>('day');
  const routinesVisible = Boolean(view.routines && view.routines.headline);
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
        {invite ? (
          <View style={styles.headerSpacer} />
        ) : (
          <Pressable
            onPress={onSave}
            disabled={done || saveState === 'saving'}
            accessibilityRole="button"
            accessibilityLabel={done ? 'Plan saved' : 'Save this plan'}
            accessibilityState={{ disabled: done || saveState === 'saving' }}
            style={styles.headerCircle}
            testID="plan-save-header"
          >
            <Ionicons
              name={done ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={colors.action}
            />
          </Pressable>
        )}
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
            {view.insight && !routinesVisible ? (
              <View style={[styles.insight, view.insightTone === 'tight' && styles.insightTight]} testID="plan-insight">
                <Ionicons
                  name={view.insightTone === 'tight' ? 'time-outline' : 'checkmark'}
                  size={14}
                  color={view.insightTone === 'tight' ? colors.warning[600] : colors.secondary[500]}
                />
                <Text style={[styles.insightText, view.insightTone === 'tight' && styles.insightTextTight]} numberOfLines={view.insightTone === 'tight' ? 3 : 1}>
                  {view.insight}
                </Text>
              </View>
            ) : null}
            {/* Unconfirmed must-haves: prominent and unresolved, never a fact either way. The day is built regardless. */}
            {view.needsChecking.length ? (
              <View style={styles.checkFirst} testID="plan-needs-checking">
                <View style={styles.checkFirstHead}>
                  <Ionicons name="alert-circle" size={18} color={colors.warning[600]} />
                  <Text style={styles.checkFirstTitle}>Needs checking before you go</Text>
                </View>
                {view.needsChecking.map((line) => (
                  <Text key={line} variant="bodySmall">
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
            {view.routines?.visitNote ? (
              // "We’ve allowed 1 hr 30 min — you can change this." The change is offered only where it can be made.
              <Text variant="caption" color={colors.text.secondary} style={styles.visitNote} testID="plan-visit-note">
                {view.routines.visitNote}
                {onChangePlan ? (
                  <>
                    {' — '}
                    <Text
                      variant="caption"
                      color={colors.action}
                      style={styles.visitChange}
                      onPress={onChangePlan}
                      accessibilityRole="link"
                      testID="plan-visit-change"
                    >
                      you can change this
                    </Text>
                    .
                  </>
                ) : (
                  '.'
                )}
              </Text>
            ) : null}
            {view.routines?.restoreVisit && onChooseVisit ? (
              <View style={styles.adviceOptions} testID="plan-restore-visit">
                <Chip size="small" label={`${view.routines.restoreVisit.label} instead`} onPress={() => onChooseVisit(view.routines!.restoreVisit!.minutes)} />
              </View>
            ) : null}
            {routinesVisible && view.routines ? (
              <Block title="Around your routines" testID="plan-routines">
                {view.routines.conflict ? (
                  // The day runs into a routine kept at home. It stays here, in warning colours, until the plan changes or the
                  // parent says they are keeping it: a tick elsewhere on the screen never stands in for this.
                  <View style={[styles.conflict, view.routines.conflict.accepted && styles.conflictAccepted]} testID={view.routines.conflict.accepted ? 'plan-conflict-accepted' : 'plan-conflict'}>
                    <View style={styles.tightRow}>
                      <Ionicons name={view.routines.conflict.accepted ? 'information-circle-outline' : 'alert-circle'} size={18} color={colors.warning[600]} />
                      <View style={styles.conflictBody}>
                        <Text style={styles.checkFirstTitle}>
                          {view.routines.conflict.accepted ? 'You’re keeping this plan as it is' : 'This plan doesn’t fit a routine yet'}
                        </Text>
                        {view.routines.conflict.lines.map((line) => (
                          <Text key={line} variant="bodySmall">
                            {line}
                          </Text>
                        ))}
                        {view.routines.conflict.hint && !view.routines.conflict.accepted ? (
                          <Text variant="bodySmall" color={colors.text.secondary}>
                            {view.routines.conflict.hint}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {onKeepConflict ? (
                      <View style={styles.adviceOptions}>
                        <Chip
                          size="small"
                          label={view.routines.conflict.accepted ? 'Look at the options again' : 'Keep it as planned'}
                          onPress={() => onKeepConflict(view.routines!.conflict!.accepted ? null : view.routines!.conflict!.signature)}
                          testID="plan-conflict-keep"
                        />
                      </View>
                    ) : onEditPlan && !view.routines.conflict.accepted ? (
                      <View style={styles.adviceOptions}>
                        <Chip size="small" label="Edit this plan" onPress={onEditPlan} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {view.routines.conflict?.accepted && !onApplyOption ? null : view.routines.conflict?.accepted ? (
                  // The banner above already says the plan is being kept; the options stay for a parent who changes their mind.
                  <Text variant="caption" color={colors.text.secondary} testID="plan-routines-headline">
                    If you change your mind
                  </Text>
                ) : (
                <Text variant="label" style={view.routines.recommendation ? styles.recommendationTitle : undefined} testID="plan-routines-headline">
                    {view.routines.headline}
                  </Text>
                )}
                {view.routines.recommendation && !(view.routines.conflict?.accepted && !onApplyOption) ? (
                  // FamilyPilot's answer first: the change, what it does, one tap to use it. Then the other options, then the
                  // details for anyone who wants them.
                  <View style={styles.recommendation} testID="plan-recommendation">
                    {view.routines.recommendation.lines.map((line) => (
                      <Text key={line} variant="bodySmall">
                        {line}
                      </Text>
                    ))}
                    {onApplyOption ? (
                      <View style={styles.adviceOptions} testID="plan-recommendation-apply">
                        <Chip
                          size="small"
                          active
                          label={view.routines.recommendation.option.label}
                          onPress={() => onApplyOption(view.routines!.recommendation!.option)}
                        />
                      </View>
                    ) : null}
                    {onApplyOption && view.routines.otherOptions.length ? (
                      <View style={styles.otherOptions}>
                        <Text variant="caption" color={colors.text.secondary}>
                          Or
                        </Text>
                        <View style={styles.adviceOptions}>
                          {view.routines.otherOptions.map((option) => (
                            <Chip key={option.key} size="small" label={option.label} onPress={() => onApplyOption(option)} />
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {view.routines.advice
                  // The banner above already says each nap that is run into; its entry returns only if it carries options of its own.
                  .filter((item) => !view.routines!.conflict?.adviceIds.includes(item.id) || item.options.length > 0)
                  .map((item) => (
                  <AdviceItem key={item.id} item={item} onApply={onApplyOption} />
                ))}
                {/* Home only just before a routine: a warning with the two times, never a tick (home-margin.ts). The
                    chip is a verified re-run, offered only when the planner found one that builds. */}
                {view.routines.tight.map((item) => (
                  <View key={item.id} style={styles.tight} testID="plan-tight-home">
                    <View style={styles.tightRow}>
                      <Ionicons name="time-outline" size={16} color={colors.warning[600]} />
                      <Text variant="bodySmall" style={styles.tightText}>
                        {item.text}
                      </Text>
                    </View>
                    {onApplyOption && item.options.length ? (
                      <View style={styles.adviceOptions} testID="plan-tight-home-options">
                        {item.options.map((option) => (
                          <Chip key={option.key} size="small" label={option.label} onPress={() => onApplyOption(option)} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
                {view.routines.homeBefore.map((line) => (
                  <View key={line} style={styles.goodNews}>
                    {/* A tick only when nothing else in this section is unsettled; beside a clash it is a plain fact. */}
                    <Ionicons
                      name={view.routines!.conflict || view.routines!.advice.some((item) => item.severity === 'soft') ? 'time-outline' : 'checkmark'}
                      size={14}
                      color={view.routines!.conflict || view.routines!.advice.some((item) => item.severity === 'soft') ? colors.text.tertiary : colors.secondary[500]}
                    />
                    <Text variant="bodySmall" style={styles.goodNewsText}>
                      {line}
                    </Text>
                  </View>
                ))}
                {view.routines.together.map((line) => (
                  <Text key={line} variant="bodySmall" color={colors.text.secondary}>
                    {line}
                  </Text>
                ))}
              </Block>
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
            {/* The day as it unfolds, with each timing's source; the stop cards below hold the places' details. */}
            {timeline && timeline.length ? (
              <Block title="Your day" testID="plan-day">
                {onEditPlan ? (
                  <Pressable onPress={onEditPlan} accessibilityRole="button" accessibilityLabel="Edit this plan" style={styles.lunchLink} hitSlop={8} testID="plan-edit">
                    <Ionicons name="create-outline" size={18} color={colors.action} />
                    <Text style={styles.lunchLinkText}>Edit this plan: times, how long, lunch</Text>
                  </Pressable>
                ) : null}
                <PlanTimeline rows={timeline} onEdit={onEditRow} />
              </Block>
            ) : null}
            {view.stops.map((stop) => (
              <View key={`${stop.placeId}-${stop.index}`}>
                <PlanStopCard stop={stop} expanded={expanded.includes(stop.index)} onToggle={() => toggle(stop.index)} />
              </View>
            ))}

            {/* Food belongs to the plan: add a lunch (and the timings are rechecked) or take it out. */}
            {onToggleLunch && view.lunch.available ? (
              <Pressable
                onPress={onToggleLunch}
                accessibilityRole="button"
                accessibilityLabel={view.lunch.included ? 'Take lunch out of the plan' : 'Add a 45-minute lunch and recheck the timings'}
                style={styles.lunchLink}
                hitSlop={8}
                testID="plan-toggle-lunch"
              >
                <Ionicons name={view.lunch.included ? 'remove-circle-outline' : 'add-circle-outline'} size={18} color={colors.action} />
                <Text style={styles.lunchLinkText}>
                  {view.lunch.included ? 'Take lunch out' : 'Add a 45-minute lunch and recheck the timings'}
                </Text>
              </Pressable>
            ) : null}

            {/* Node 73:33: the terminus, with the time the planner says the family is home. */}
            {view.party[0] ? (
              <View style={styles.headHome} testID="plan-head-home">
                <View style={styles.terminus} />
                <Text style={styles.headHomeTime}>{view.party[0].homeLabel}</Text>
                <Text style={styles.headHomeLabel} numberOfLines={1}>
                  Home
                  {view.party[0].homeNote ? <Text style={styles.headHomeNote}>{` · ${view.party[0].homeNote}`}</Text> : null}
                </Text>
              </View>
            ) : null}

            {view.unknowns.length ? (
              <Block title="Check before you go" testID="plan-check-before">
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
        {invite ? (
          <View style={styles.savedFooter} testID="plan-invite-footer">
            {invite.status === 'pending' ? (
              <>
                <Text style={styles.inviteLine} testID="plan-invite-from">{`${familyDisplayName(invite.fromLabel)} invited you to this day`}</Text>
                {invite.error ? (
                  <Text variant="bodySmall" color={colors.error[600]} accessibilityRole="alert" style={styles.saveError} testID="plan-invite-error">
                    {invite.error}
                  </Text>
                ) : null}
                <ArrowCta label={invite.busy ? 'One moment…' : 'Accept'} onPress={invite.onAccept} disabled={invite.busy} testID="plan-invite-accept" />
                <Pressable onPress={invite.onDecline} disabled={invite.busy} accessibilityRole="button" style={styles.secondaryAction} hitSlop={8} testID="plan-invite-decline">
                  <Text style={styles.secondaryActionText}>Decline</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.savedLine} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="plan-invite-answered">
                  <Ionicons name={invite.status === 'accepted' ? 'checkmark-circle' : 'close-circle'} size={20} color={invite.status === 'accepted' ? colors.secondary[500] : colors.text.secondary} />
                  <Text style={styles.savedText}>{invite.status === 'accepted' ? 'You’re going. It’s in your plans' : 'You declined this invitation'}</Text>
                </View>
                {invite.status === 'accepted' && onAddToCalendar ? <ArrowCta label="Add to calendar" onPress={onAddToCalendar} testID="plan-add-to-calendar" /> : null}
                {onSeeAllPlans ? (
                  <Pressable onPress={onSeeAllPlans} accessibilityRole="link" style={styles.secondaryAction} hitSlop={8} testID="plan-see-all-plans">
                    <Text style={styles.secondaryActionText}>See all your plans</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.action} />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : saved ? (
          // A saved plan, opened again: the one thing left to do with it here is put it in the calendar (and, straight after
          // saving, find it among the family's other plans).
          <View style={styles.savedFooter}>
            <ShareBlock share={share} />
            {onAddToCalendar ? (share?.to ? (
              <Pressable onPress={onAddToCalendar} accessibilityRole="button" style={styles.secondaryAction} hitSlop={8} testID="plan-add-to-calendar">
                <Ionicons name="calendar-outline" size={18} color={colors.action} />
                <Text style={styles.secondaryActionText}>Add to calendar</Text>
              </Pressable>
            ) : <ArrowCta label="Add to calendar" onPress={onAddToCalendar} testID="plan-add-to-calendar" />) : null}
            {onSeeAllPlans ? (
              <Pressable onPress={onSeeAllPlans} accessibilityRole="link" style={styles.secondaryAction} hitSlop={8} testID="plan-see-all-plans">
                <Text style={styles.secondaryActionText}>See all your plans</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.action} />
              </Pressable>
            ) : null}
          </View>
        ) : saveState === 'saved' || saveState === 'already' ? (
          <View style={styles.savedFooter} testID="plan-saved-confirmation">
            <View style={styles.savedLine} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={20} color={colors.secondary[500]} />
              <Text style={styles.savedText}>{saveState === 'already' ? 'Already in your plans' : 'Plan saved'}</Text>
            </View>
            <ShareBlock share={share} />
            <ArrowCta label="View plan" onPress={onViewPlan ?? (() => {})} testID="plan-view-saved" />
            {onAddToCalendar ? (
              <Pressable onPress={onAddToCalendar} accessibilityRole="button" style={styles.secondaryAction} hitSlop={8} testID="plan-add-to-calendar">
                <Ionicons name="calendar-outline" size={18} color={colors.action} />
                <Text style={styles.secondaryActionText}>Add to calendar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            {saveState === 'failed' && saveError ? (
              <Text variant="bodySmall" color={colors.error[600]} accessibilityRole="alert" style={styles.saveError} testID="plan-save-error">
                {saveError}
              </Text>
            ) : null}
            {share?.to && share.onSend && saveState !== 'failed' ? (
              <>
                <ArrowCta
                  label={saveState === 'saving' ? 'Saving…' : `Save & send to ${share.to}`}
                  onPress={share.onSend}
                  disabled={saveState === 'saving'}
                  testID="plan-save-and-send"
                />
                <Pressable onPress={onSave} disabled={saveState === 'saving'} accessibilityRole="button" style={styles.secondaryAction} hitSlop={8} testID="plan-save">
                  <Text style={styles.secondaryActionText}>Save only</Text>
                </Pressable>
              </>
            ) : (
              <ArrowCta
                label={saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Try again' : 'Save this plan'}
                onPress={onSave}
                disabled={saveState === 'saving'}
                testID="plan-save"
              />
            )}
          </>
        )}
        {calendarMessage ? (
          <Text variant="caption" color={colors.text.secondary} style={styles.calendarMessage} testID="plan-calendar-message">
            {calendarMessage}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * What can be done with a saved day for the people it is for: send it to the connected family it was planned with, see where
 * a sent one has got to, or put it in the phone's share sheet. Nothing here is shown for a day with nobody else on it.
 */
function ShareBlock({ share }: { share: PlanScreenViewProps['share'] }) {
  if (!share) return null;
  const { to, state, message, status, onSend, onShareText } = share;
  const sendable = Boolean(to && onSend && !status && state !== 'sent');
  return (
    <View style={styles.shareBlock} testID="plan-share">
      {status ? (
        <View style={styles.savedLine} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="plan-share-status">
          <Ionicons
            name={status.tone === 'accepted' ? 'checkmark-circle' : status.tone === 'declined' ? 'close-circle' : 'paper-plane-outline'}
            size={20}
            color={status.tone === 'accepted' ? colors.secondary[500] : colors.text.secondary}
          />
          <Text style={styles.savedText}>{status.text}</Text>
        </View>
      ) : state === 'sent' ? (
        <View style={styles.savedLine} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="plan-share-status">
          <Ionicons name="paper-plane-outline" size={20} color={colors.text.secondary} />
          <Text style={styles.savedText}>{`Sent to ${to}`}</Text>
        </View>
      ) : null}
      {state === 'failed' && message ? (
        <Text variant="bodySmall" color={colors.error[600]} accessibilityRole="alert" style={styles.saveError} testID="plan-share-error">
          {message}
        </Text>
      ) : null}
      {sendable ? (
        <ArrowCta label={state === 'sending' ? 'Sending…' : state === 'failed' ? 'Try sending again' : `Send to ${to}`} onPress={onSend!} disabled={state === 'sending'} testID="plan-send" />
      ) : null}
      {onShareText ? (
        <Pressable onPress={onShareText} accessibilityRole="button" style={styles.secondaryAction} hitSlop={8} testID="plan-share-text">
          <Ionicons name="share-outline" size={18} color={colors.action} />
          <Text style={styles.secondaryActionText}>Share the plan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AdviceItem({ item, onApply }: { item: PlanAdviceView; onApply?: (option: PlanAdviceOptionView) => void }) {
  return (
    <View style={styles.advice} testID={`plan-advice-${item.severity}`}>
      <View style={styles.adviceHead}>
        <View style={[styles.adviceDot, item.severity === 'soft' ? styles.adviceDotSoft : styles.adviceDotInfo]} />
        <View style={styles.adviceText}>
          <Text style={styles.adviceTitle}>{item.title}</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            It {item.where}.
          </Text>
        </View>
      </View>
      <Text variant="bodySmall">{item.detail}</Text>
      {onApply && item.options.length ? (
        <View style={styles.adviceOptions}>
          {item.options.map((option) => (
            <Chip key={option.key} size="small" label={option.label} onPress={() => onApply(option)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Block({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.block} testID={testID}>
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
  // Keeps the title centred where an invitation has no save button.
  headerSpacer: { width: 44, height: 44 },
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
  insightTight: { backgroundColor: colors.warning[50], borderWidth: 1, borderColor: colors.warning[100], alignItems: 'flex-start' },
  insightTextTight: { color: colors.warning[600] },
  tight: { gap: spacing.sm, backgroundColor: colors.warning[50], borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.warning[100] },
  tightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tightText: { flex: 1, color: colors.warning[600] },
  visitNote: { marginBottom: spacing.md },
  visitChange: { textDecorationLine: 'underline' },
  recommendationTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 22, color: colors.ink },
  recommendation: { gap: spacing.xs },
  otherOptions: { gap: 4, marginTop: spacing.xs },
  checkFirst: {
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[100],
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  checkFirstHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkFirstTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: colors.ink },
  advice: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
  adviceHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  adviceDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  adviceDotSoft: { backgroundColor: colors.warning[500] },
  adviceDotInfo: { backgroundColor: colors.text.tertiary },
  adviceText: { flex: 1, gap: 2 },
  adviceTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: colors.ink },
  adviceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.xs },
  conflict: { gap: spacing.sm, backgroundColor: colors.warning[50], borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.warning[100], marginBottom: spacing.sm },
  conflictAccepted: { backgroundColor: colors.fill, borderColor: colors.borderLight },
  conflictBody: { flex: 1, gap: 4 },
  goodNews: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  goodNewsText: { flex: 1 },
  lunchLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.sm },
  lunchLinkText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 18, color: colors.action },
  headHome: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 44, paddingLeft: 42 - spacing.screenPadding },
  terminus: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.action },
  headHomeTime: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16, color: colors.ink },
  headHomeLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 18, color: colors.text.secondary },
  headHomeNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.text.tertiary },
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
  savedFooter: { gap: spacing.sm },
  savedLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
  savedText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22, color: colors.ink },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 44 },
  secondaryActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: colors.action },
  saveError: { textAlign: 'center', marginBottom: spacing.sm },
  shareBlock: { gap: spacing.sm },
  inviteLine: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22, color: colors.ink, textAlign: 'center' },
  calendarMessage: { textAlign: 'center', marginTop: spacing.xs },
});
