import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Chip, Text, CHIP_GAP } from '@/src/components/ui';
import { DateField, TimeField } from '@/src/components/ui/DateTimeField';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import {
  PlanDraft,
  PlanParty,
  VISIT_LENGTH_CHOICES,
  planDraftBlocker,
} from '@/src/services/planning/plan-draft';
import { weekdayOf } from '@/src/services/planning/plan-view-model';

/**
 * The approved Create a Plan sheet: when, start, who's coming, how long.
 *
 * Four rows and a button. The product intention is that a parent reads the defaults, recognises
 * them, and taps Create -- so every row is pre-answered and nothing is required. It must not grow
 * into a booking form; anything that is not one of these four questions belongs on the Plan screen
 * afterwards, where it can be changed with the day in front of them.
 *
 * Knows nothing about where the family came from. It takes a `PlanDraft` and a `PlanParty[]` and
 * reports changes back, so when accounts and real profiles land the defaults change upstream in
 * `planDraftDefaults` and this component is untouched.
 */

export interface CreatePlanSheetProps {
  visible: boolean;
  onClose: () => void;
  venueName: string;
  draft: PlanDraft;
  parties: PlanParty[];
  onDraftChange: (next: PlanDraft) => void;
  onCreate: (draft: PlanDraft) => void;
  /** Shown in place of the party row's hint when there is no family described yet. */
  onAddFamily?: () => void;
  /** True while a plan is being generated, so the button cannot be pressed twice. */
  busy?: boolean;
}

/** Compact on purpose: four choices read as one set of chips rather than wrapping to a stray row. */
function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * "Friday 2 October", under the date field.
 *
 * A native date input renders in the browser's or device's own locale, so the same day reads
 * 10/02/2026 in one place and 02/10/2026 in another. A parent choosing a Saturday out should not
 * have to work out which of those they are looking at, so the day is also spelled out.
 */
function spelledDate(date: string): string | null {
  const parts = weekdayOf(date);
  if (!parts) return null;
  const MONTHS: Record<string, string> = {
    Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
    Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
  };
  return `${parts.long} ${parts.day} ${MONTHS[parts.month] ?? parts.month}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color={colors.text.secondary} style={styles.rowLabel}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export function CreatePlanSheet({
  visible,
  onClose,
  venueName,
  draft,
  parties,
  onDraftChange,
  onCreate,
  onAddFamily,
  busy = false,
}: CreatePlanSheetProps) {
  // Guards against a second submit while the first is still generating, independently of the
  // button's own disabled state -- a double tap can land before React re-renders.
  const [submitted, setSubmitted] = useState(false);

  const blocker = useMemo(() => planDraftBlocker(draft, parties), [draft, parties]);
  const chosen = parties.filter((p) => draft.partyIds.includes(p.id));
  const partyLine = chosen.length
    ? chosen.map((p) => `${p.label} · ${p.summary}`).join('  +  ')
    : 'Nobody chosen yet';

  const toggleParty = (id: string) => {
    const next = draft.partyIds.includes(id)
      ? draft.partyIds.filter((x) => x !== id)
      : [...draft.partyIds, id];
    onDraftChange({ ...draft, partyIds: next });
  };

  const create = () => {
    if (busy || submitted || blocker) return;
    setSubmitted(true);
    onCreate(draft);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        setSubmitted(false);
        onClose();
      }}
      accessibilityLabel={`Create a plan for ${venueName}`}
      testID="create-plan-sheet"
    >
      <View style={styles.header}>
        <Text variant="heading2">Create a plan</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          A day around {venueName}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Row label="When">
          <DateField label="" value={draft.date} onChange={(date) => onDraftChange({ ...draft, date })} />
          {spelledDate(draft.date) ? (
            <Text variant="caption" color={colors.text.secondary}>
              {spelledDate(draft.date)}
            </Text>
          ) : null}
        </Row>

        <Row label="Start">
          <TimeField label="" value={draft.leaveAt} onChange={(leaveAt) => onDraftChange({ ...draft, leaveAt })} />
          <Text variant="caption" color={colors.text.secondary}>
            The earliest you can leave home.
          </Text>
        </Row>

        <Row label="Who’s coming">
          <Text variant="body">{partyLine}</Text>
          <View style={styles.chips}>
            {parties.map((party) => (
              <Chip
                key={party.id}
                label={party.label}
                active={draft.partyIds.includes(party.id)}
                onPress={() => toggleParty(party.id)}
              />
            ))}
          </View>
          {/* Quiet and left-aligned: adding a second household is an occasional choice, and a
              full-width button here competes with the one action this sheet exists for. */}
          {onAddFamily ? (
            <View style={styles.addFamily}>
              <Button label="Add another family" variant="ghost" size="sm" onPress={onAddFamily} />
            </View>
          ) : null}
        </Row>

        <Row label="How long">
          <View style={styles.chips}>
            {VISIT_LENGTH_CHOICES.map((minutes) => (
              <Chip
                key={minutes}
                label={lengthLabel(minutes)}
                active={draft.visitMinutes === minutes}
                onPress={() => onDraftChange({ ...draft, visitMinutes: minutes })}
              />
            ))}
          </View>
          {/* Travel is always added; lunch only when one is already known, so this does not promise
              a stop the day may not contain. */}
          <Text variant="caption" color={colors.text.secondary}>
            Time at {venueName}. Travel is added around it.
          </Text>
        </Row>
      </ScrollView>

      <View style={styles.footer}>
        {blocker ? (
          <Text variant="bodySmall" color={colors.warning[600]} accessibilityRole="alert">
            {blocker}
          </Text>
        ) : null}
        <Button
          label={busy || submitted ? 'Building your day…' : 'Create plan'}
          disabled={busy || submitted || Boolean(blocker)}
          onPress={create}
          testID="create-plan-submit"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  row: { gap: spacing.xs },
  rowLabel: { letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP },
  addFamily: { alignItems: 'flex-start' },
  footer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    borderTopLeftRadius: radius.sm,
  },
});
