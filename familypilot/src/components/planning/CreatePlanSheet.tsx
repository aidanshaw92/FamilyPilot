import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Text } from '@/src/components/ui';
import { ArrowCta } from '@/src/components/ui/ArrowCta';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { PlanDraft, PlanParty, planDraftBlocker } from '@/src/services/planning/plan-draft';

import { PlanDraftForm } from './PlanDraftForm';
import { ProfileReceipt } from './ProfileReceipt';

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
  /** Show the connected families and an invitation link under "Add another family". */
  connections?: boolean;
  /** True while a plan is being generated, so the button cannot be pressed twice. */
  busy?: boolean;
  /** Frame 04's profile receipt: which of the parent's details the plan will use. Null hides it. */
  receipt?: string | null;
  /** Where the receipt's "Edit" goes. */
  onEditProfile?: () => void;
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
  connections = false,
  busy = false,
  receipt = null,
  onEditProfile,
}: CreatePlanSheetProps) {
  // Guards against a second submit while the first is still generating, independently of the
  // button's own disabled state -- a double tap can land before React re-renders.
  const [submitted, setSubmitted] = useState(false);

  const blocker = useMemo(() => planDraftBlocker(draft, parties), [draft, parties]);

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
      {/* Frame 04 (nodes 76:27, 76:28): "Plan your day" over "Around <venue>". The venue's own
          button still says Create a plan; this is the sheet it opens. */}
      <View style={styles.header}>
        <Text variant="heading2">Plan your day</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          Around {venueName}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PlanDraftForm
          draft={draft}
          parties={parties}
          onDraftChange={onDraftChange}
          venueName={venueName}
          onAddFamily={onAddFamily}
          connections={connections}
        />
        {receipt ? <ProfileReceipt text={receipt} onEdit={onEditProfile} style={styles.receipt} /> : null}
      </ScrollView>

      <View style={styles.footer}>
        {blocker ? (
          <Text variant="bodySmall" color={colors.warning[600]} accessibilityRole="alert">
            {blocker}
          </Text>
        ) : null}
        {/* Node 76:65: the frame's arrow CTA, "Build my plan". */}
        <ArrowCta
          label={busy || submitted ? 'Building your day…' : 'Build my plan'}
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
  receipt: { marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    borderTopLeftRadius: radius.sm,
  },
});
