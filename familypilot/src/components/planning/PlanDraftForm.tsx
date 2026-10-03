import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Text, SMALL_CHIP_GAP } from '@/src/components/ui';
import { DateField, TimeField } from '@/src/components/ui/DateTimeField';
import { colors, spacing } from '@/src/design-system/tokens';
import { PlanDraft, PlanParty, VISIT_LENGTH_CHOICES } from '@/src/services/planning/plan-draft';
import { localDate } from '@/src/stores/planning-store';
import { START_QUICK_CHOICES, dateQuickChoices, shortDateLabel } from '@/src/utils/plan-quick-choices';

/**
 * The four questions behind every plan -- when, start, who's coming, how long -- as one form.
 *
 * The Create a Plan sheet on Venue Detail and the Plans tab used to ask them with two different
 * forms: different copy ("1h 30m" against "90 min"), different gating, different fields. This is
 * the one form. The sheet renders exactly this; the Plans tab renders this and then its own extra
 * rows underneath, using the same `PlanFormRow`, so the two cannot drift again.
 *
 * Frame 04 (node 76:2) answers WHEN and START with quick chips (Today, the coming weekend day,
 * 09:30, 10:00, 10:30) and an "Other" that opens a picker; that is what this draws, with slice 4's
 * drawn date and time fields behind "Other", so nothing a parent could choose before is lost.
 *
 * It knows nothing about where the parties came from: it takes a `PlanDraft` and `PlanParty[]` and
 * reports changes back, exactly as the sheet always did.
 */
export interface PlanDraftFormProps {
  draft: PlanDraft;
  parties: PlanParty[];
  onDraftChange: (next: PlanDraft) => void;
  /** Named in the "how long" hint: "Time at Kew Gardens." Omitted, the hint is generic. */
  venueName?: string;
  /** Shown on the WHO'S COMING row, right-aligned as the frame draws it (node 76:49). */
  onAddFamily?: () => void;
  /** The day the quick chips count from. Defaults to today; passed in by tests and captures. */
  today?: string;
}

/** Compact on purpose: four choices read as one set of chips rather than wrapping to a stray row. */
export function visitLengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function PlanFormRow({
  label,
  action,
  children,
}: {
  label: string;
  /** A quiet link on the label's row, like the frame's "Add another family". */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text variant="eyebrow">{label.toUpperCase()}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function PlanDraftForm({ draft, parties, onDraftChange, venueName, onAddFamily, today }: PlanDraftFormProps) {
  const day = today ?? localDate();
  const dateChoices = dateQuickChoices(day);
  const dateIsQuick = dateChoices.some((c) => c.value === draft.date);
  const startIsQuick = START_QUICK_CHOICES.some((c) => c.value === draft.leaveAt);
  // "Other" stays open once chosen, so the picker is there to change again.
  const [dateOpen, setDateOpen] = useState(!dateIsQuick);
  const [startOpen, setStartOpen] = useState(!startIsQuick);

  const toggleParty = (id: string) => {
    const next = draft.partyIds.includes(id)
      ? draft.partyIds.filter((x) => x !== id)
      : [...draft.partyIds, id];
    onDraftChange({ ...draft, partyIds: next });
  };

  return (
    <>
      <PlanFormRow label="When">
        <View style={styles.chips}>
          {dateChoices.map((choice) => (
            <Chip
              key={choice.value}
              size="small"
              label={choice.label}
              active={draft.date === choice.value}
              onPress={() => {
                setDateOpen(false);
                onDraftChange({ ...draft, date: choice.value });
              }}
            />
          ))}
          <Chip
            size="small"
            label={!dateIsQuick ? shortDateLabel(draft.date) : 'Other date'}
            active={!dateIsQuick || dateOpen}
            onPress={() => setDateOpen(true)}
          />
        </View>
        {dateOpen ? <DateField label="" value={draft.date} onChange={(date) => onDraftChange({ ...draft, date })} /> : null}
      </PlanFormRow>

      <PlanFormRow label="Start">
        <View style={styles.chips}>
          {START_QUICK_CHOICES.map((choice) => (
            <Chip
              key={choice.value}
              size="small"
              label={choice.label}
              active={draft.leaveAt === choice.value}
              onPress={() => {
                setStartOpen(false);
                onDraftChange({ ...draft, leaveAt: choice.value });
              }}
            />
          ))}
          <Chip
            size="small"
            label={!startIsQuick ? draft.leaveAt : 'Other'}
            active={!startIsQuick || startOpen}
            onPress={() => setStartOpen(true)}
          />
        </View>
        {startOpen ? <TimeField label="" value={draft.leaveAt} onChange={(leaveAt) => onDraftChange({ ...draft, leaveAt })} /> : null}
        <Text variant="caption" color={colors.text.secondary}>
          The earliest you can leave home.
        </Text>
      </PlanFormRow>

      <PlanFormRow
        label="Who’s coming"
        action={
          // Quiet and on the label's row, as the frame draws it: adding a second household is an
          // occasional choice, and a full-width button here competes with the one action the form
          // exists for.
          onAddFamily ? (
            <Pressable onPress={onAddFamily} accessibilityRole="button" accessibilityLabel="Add another family" hitSlop={10}>
              <Text style={styles.rowLink}>Add another family</Text>
            </Pressable>
          ) : undefined
        }
      >
        <View style={styles.chips}>
          {/* One chip per household carrying its counts (node 76:51): "Our family · 2 adults, 2 children". */}
          {parties.map((party) => (
            <Chip
              key={party.id}
              size="small"
              label={`${party.label} · ${party.summary}`}
              active={draft.partyIds.includes(party.id)}
              onPress={() => toggleParty(party.id)}
            />
          ))}
        </View>
        {draft.partyIds.length === 0 ? (
          <Text variant="caption" color={colors.text.secondary}>
            Nobody chosen yet
          </Text>
        ) : null}
      </PlanFormRow>

      <PlanFormRow label="How long">
        <View style={styles.chips}>
          {VISIT_LENGTH_CHOICES.map((minutes) => (
            <Chip
              key={minutes}
              size="small"
              label={visitLengthLabel(minutes)}
              active={draft.visitMinutes === minutes}
              onPress={() => onDraftChange({ ...draft, visitMinutes: minutes })}
            />
          ))}
        </View>
        {/* Travel is always added; lunch only when one is already known, so this does not promise
            a stop the day may not contain. */}
        <Text variant="caption" color={colors.text.secondary}>
          {venueName ? `Time at ${venueName}. Travel is added around it.` : 'Time at the place. Travel is added around it.'}
        </Text>
      </PlanFormRow>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SMALL_CHIP_GAP },
  // Node 76:49: SemiBold 13, underlined, ink.
  rowLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16, color: colors.ink, textDecorationLine: 'underline' },
});
