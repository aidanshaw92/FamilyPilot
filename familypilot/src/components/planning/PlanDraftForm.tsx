import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Text, CHIP_GAP } from '@/src/components/ui';
import { DateField, TimeField } from '@/src/components/ui/DateTimeField';
import { colors, spacing } from '@/src/design-system/tokens';
import { PlanDraft, PlanParty, VISIT_LENGTH_CHOICES } from '@/src/services/planning/plan-draft';

/**
 * The four questions behind every plan -- when, start, who's coming, how long -- as one form.
 *
 * The Create a Plan sheet on Venue Detail and the Plans tab used to ask them with two different
 * forms: different copy ("1h 30m" against "90 min"), different gating, different fields. This is
 * the one form. The sheet renders exactly this; the Plans tab renders this and then its own extra
 * rows underneath, using the same `PlanFormRow`, so the two cannot drift again.
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
  /** Shown as a quiet action under the party chips when a second household can be added. */
  onAddFamily?: () => void;
}

/** Compact on purpose: four choices read as one set of chips rather than wrapping to a stray row. */
export function visitLengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function PlanFormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="eyebrow">{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function PlanDraftForm({ draft, parties, onDraftChange, venueName, onAddFamily }: PlanDraftFormProps) {
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

  return (
    <>
      <PlanFormRow label="When">
        <DateField label="" value={draft.date} onChange={(date) => onDraftChange({ ...draft, date })} />
      </PlanFormRow>

      <PlanFormRow label="Start">
        <TimeField label="" value={draft.leaveAt} onChange={(leaveAt) => onDraftChange({ ...draft, leaveAt })} />
        <Text variant="caption" color={colors.text.secondary}>
          The earliest you can leave home.
        </Text>
      </PlanFormRow>

      <PlanFormRow label="Who’s coming">
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
            full-width button here competes with the one action the form exists for. */}
        {onAddFamily ? (
          <Pressable
            onPress={onAddFamily}
            accessibilityRole="button"
            accessibilityLabel="Add another family"
            style={styles.addFamily}
            hitSlop={8}
          >
            <Text variant="link">Add another family</Text>
          </Pressable>
        ) : null}
      </PlanFormRow>

      <PlanFormRow label="How long">
        <View style={styles.chips}>
          {VISIT_LENGTH_CHOICES.map((minutes) => (
            <Chip
              key={minutes}
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
  row: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP },
  addFamily: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
