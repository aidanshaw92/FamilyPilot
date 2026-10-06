import { useState } from 'react';
import { ConnectedFamiliesPicker } from './ConnectedFamiliesPicker';
import { AddFamilyByPostcode } from './AddFamilyByPostcode';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip, Text, SMALL_CHIP_GAP } from '@/src/components/ui';
import { DateField, TimeField } from '@/src/components/ui/DateTimeField';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { BUFFER_CHOICES, PlanDraft, PlanParty, isComing, toggleAttendee } from '@/src/services/planning/plan-draft';
import {
  MAX_VISIT_MINUTES,
  MIN_VISIT_MINUTES,
  VISIT_CHOICES,
  VisitLength,
  isPresetLength,
} from '@/src/services/planning/visit-duration';
import { localDate } from '@/src/stores/planning-store';
import { dateQuickChoices, shortDateLabel } from '@/src/utils/plan-quick-choices';

/**
 * The four questions behind every plan -- when, start, who's coming, how long -- as one form.
 *
 * START is a real time picker for when the family wants to ARRIVE (no presets to round to), WHO'S COMING names the
 * actual household with everyone selected so a parent toggles somebody out, and HOW LONG includes "Not sure" and
 * "All day". Everything that follows (leaving time, naps, lunch) is reasoned from those answers.
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
  /** Named in the hints: "When you want to arrive at Kew Gardens." Omitted, the hints are generic. */
  venueName?: string;
  /**
   * With accounts, "Add another family" lists the connected families and an invitation link; either way a family can be
   * added inline from a name and a postcode. Nothing here sends the parent to another screen and back.
   */
  connections?: boolean;
  /** The day the quick chips count from. Defaults to today; passed in by tests and captures. */
  today?: string;
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

export function PlanDraftForm({ draft, parties, onDraftChange, venueName, connections = false, today }: PlanDraftFormProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [byPostcode, setByPostcode] = useState(false);
  const day = today ?? localDate();
  const dateChoices = dateQuickChoices(day);
  const dateIsQuick = dateChoices.some((c) => c.value === draft.date);
  // "Other date" stays open once chosen, so the picker is there to change again.
  const [dateOpen, setDateOpen] = useState(!dateIsQuick);
  const [moreOpen, setMoreOpen] = useState(Boolean(draft.returnBy) || draft.environment !== 'either' || draft.bufferMinutes !== 15);
  const [customOpen, setCustomOpen] = useState(typeof draft.visit === 'number' && !isPresetLength(draft.visit));

  const mine = parties.find((p) => p.people && p.people.length > 0);
  const others = parties.filter((p) => p !== mine);

  const toggleParty = (id: string) => {
    const next = draft.partyIds.includes(id)
      ? draft.partyIds.filter((x) => x !== id)
      : [...draft.partyIds, id];
    onDraftChange({ ...draft, partyIds: next });
  };
  const addFamilyId = (id: string) => {
    if (!draft.partyIds.includes(id)) onDraftChange({ ...draft, partyIds: [...draft.partyIds, id] });
  };

  const setVisit = (visit: VisitLength) => onDraftChange({ ...draft, visit });
  const visitIsCustom = typeof draft.visit === 'number' && !isPresetLength(draft.visit);

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
        {dateOpen ? <DateField label="" a11yLabel="Date of the plan" value={draft.date} onChange={(date) => onDraftChange({ ...draft, date })} /> : null}
      </PlanFormRow>

      <PlanFormRow label="Start">
        {/* A real time picker, not a few presets to round to: the day is worked out from the time you actually name. */}
        <TimeField label="" a11yLabel="Arrival time" value={draft.startAt} onChange={(startAt) => onDraftChange({ ...draft, startAt })} />
        <Text variant="caption" color={colors.text.secondary}>
          {venueName ? `When you want to arrive at ${venueName}. ` : 'When you want to arrive. '}We’ll work out when to leave.
        </Text>
      </PlanFormRow>

      <PlanFormRow
        label="Who’s coming"
        action={
          <Pressable
            onPress={() => setAddOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Add another family"
            accessibilityState={{ expanded: addOpen }}
            hitSlop={10}
          >
            <Text style={styles.rowLink}>{addOpen ? 'Close' : 'Add another family'}</Text>
          </Pressable>
        }
      >
        {/* The actual household, everyone selected: a parent takes somebody OUT rather than building a list up. */}
        {mine ? (
          <View style={styles.household} testID="who-household">
            <Text variant="caption" color={colors.text.secondary} style={styles.householdTitle}>
              {mine.label.toUpperCase()}
            </Text>
            <View style={styles.chips}>
              {mine.people!.map((person) => (
                <Chip
                  key={person.id}
                  size="small"
                  label={person.name}
                  active={isComing(draft, person.id) && draft.partyIds.includes(mine.id)}
                  onPress={() => onDraftChange(toggleAttendee(draft, mine.people!, person.id))}
                />
              ))}
            </View>
          </View>
        ) : null}
        {others.length ? (
          <View style={styles.chips}>
            {others.map((party) => (
              <Chip
                key={party.id}
                size="small"
                label={`${party.label} · ${party.summary}`}
                active={draft.partyIds.includes(party.id)}
                onPress={() => toggleParty(party.id)}
              />
            ))}
          </View>
        ) : null}
        {draft.partyIds.length === 0 ? (
          <Text variant="caption" color={colors.text.secondary}>
            Nobody chosen yet
          </Text>
        ) : null}
        {mine && draft.attendeeIds ? (
          <Text variant="caption" color={colors.text.secondary}>
            Planning without {mine.people!.filter((p) => !isComing(draft, p.id)).map((p) => p.name).join(', ')}.
          </Text>
        ) : null}
        {addOpen ? (
          byPostcode || !connections ? (
            <AddFamilyByPostcode
              onAdded={(family) => {
                addFamilyId(family.id);
                setByPostcode(false);
                setAddOpen(false);
              }}
              onCancel={connections ? () => setByPostcode(false) : () => setAddOpen(false)}
            />
          ) : (
            <ConnectedFamiliesPicker
              selectedIds={draft.partyIds}
              onSelect={addFamilyId}
              onAddManually={() => setByPostcode(true)}
            />
          )
        ) : null}
      </PlanFormRow>

      <PlanFormRow label="How long">
        <View style={styles.chips}>
          {VISIT_CHOICES.map((choice) => (
            <Chip
              key={String(choice.value)}
              size="small"
              label={choice.label}
              active={!visitIsCustom && draft.visit === choice.value}
              onPress={() => {
                setCustomOpen(false);
                setVisit(choice.value);
              }}
            />
          ))}
          <Chip
            size="small"
            label={visitIsCustom ? `${draft.visit} min` : 'Custom'}
            active={visitIsCustom || customOpen}
            onPress={() => {
              setCustomOpen(true);
              if (!visitIsCustom) setVisit(75);
            }}
          />
        </View>
        {customOpen ? <CustomMinutes value={typeof draft.visit === 'number' ? draft.visit : 75} onChange={setVisit} /> : null}
        <Text variant="caption" color={colors.text.secondary}>
          {draft.visit === 'not-sure'
            ? 'We’ll use what we know about the place and your routines, and tell you what we assumed.'
            : draft.visit === 'all-day'
              ? 'Until it closes, or about 6 hours if we don’t know when that is.'
              : venueName
                ? `Time at ${venueName}. Travel is added around it.`
                : 'Time at the place. Travel is added around it.'}
        </Text>
      </PlanFormRow>

      {/* The old planner's limits, kept but out of the way: most days need none of them. */}
      <Pressable
        onPress={() => setMoreOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        accessibilityLabel="More options"
        style={styles.moreToggle}
        hitSlop={8}
        testID="plan-more-options"
      >
        <Text style={styles.rowLink}>{moreOpen ? 'Fewer options' : 'More options'}</Text>
      </Pressable>
      {moreOpen ? (
        <>
          <PlanFormRow label="Home by">
            <TimeField label="" a11yLabel="Home by" value={draft.returnBy} onChange={(returnBy) => onDraftChange({ ...draft, returnBy })} optional />
            <Text variant="caption" color={colors.text.secondary}>
              Optional. The day is planned to end before this.
            </Text>
          </PlanFormRow>
          <PlanFormRow label="Extra time each way">
            <View style={styles.chips}>
              {BUFFER_CHOICES.map((minutes) => (
                <Chip key={minutes} size="small" label={`${minutes} min`} active={draft.bufferMinutes === minutes} onPress={() => onDraftChange({ ...draft, bufferMinutes: minutes })} />
              ))}
            </View>
            <Text variant="caption" color={colors.text.secondary}>
              For traffic, parking and getting everyone ready.
            </Text>
          </PlanFormRow>
          <PlanFormRow label="Setting">
            <View style={styles.chips}>
              {(['either', 'indoor', 'outdoor'] as const).map((value) => (
                <Chip key={value} size="small" label={{ either: 'Any setting', indoor: 'Indoors', outdoor: 'Outdoors' }[value]} active={draft.environment === value} onPress={() => onDraftChange({ ...draft, environment: value })} />
              ))}
            </View>
          </PlanFormRow>
        </>
      ) : null}
    </>
  );
}

/** Minutes, for the length nobody's preset covers. Kept to what the planner accepts. */
function CustomMinutes({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <View style={styles.custom}>
      <TextInput
        accessibilityLabel="Minutes at the place"
        value={text}
        keyboardType="number-pad"
        inputMode="numeric"
        onChangeText={(next) => {
          const cleaned = next.replace(/[^0-9]/g, '').slice(0, 3);
          setText(cleaned);
          const minutes = Number(cleaned);
          if (Number.isFinite(minutes) && minutes >= MIN_VISIT_MINUTES && minutes <= MAX_VISIT_MINUTES) onChange(minutes);
        }}
        style={styles.customInput}
        testID="custom-visit-minutes"
      />
      <Text variant="bodySmall" color={colors.text.secondary}>
        minutes ({MIN_VISIT_MINUTES}–{MAX_VISIT_MINUTES})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SMALL_CHIP_GAP },
  // Node 76:49: SemiBold 13, underlined, ink.
  moreToggle: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  household: { gap: spacing.xs },
  householdTitle: { letterSpacing: 0.6 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customInput: {
    minWidth: 88,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: 16,
    color: colors.text.primary,
    outlineColor: colors.action,
  },
  rowLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16, color: colors.action, textDecorationLine: 'underline' },
});
