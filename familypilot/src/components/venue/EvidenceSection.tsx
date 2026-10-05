import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { VenueTrustPanel } from '@/src/components/planning/VisitFeedback';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';

/**
 * Where the facts on a venue's page come from, and the way to add to them. Provenance is not hidden: it is one tap
 * away and says what each fact rests on (a venue source and its date, a FamilyPilot review, or parent reports, always
 * kept apart). It sits below the decision, because a parent deciding wants the verdict first and the evidence second.
 */
export function EvidenceSection({
  venueId,
  expanded,
  onToggle,
  startReport,
}: {
  venueId: string;
  expanded: boolean;
  onToggle: () => void;
  /** Open the "I've visited" form straight away (the "Help check" shortcut). */
  startReport?: boolean;
}) {
  const [mounted, setMounted] = useState(expanded);
  if (expanded && !mounted) setMounted(true);

  return (
    <View style={styles.wrap} testID="evidence-section">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text variant="heading3">How we know this</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Sources, when each fact was checked, and what parents have reported.
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
      </Pressable>
      {/* Mounted on first open and then kept, so closing it does not lose a half-filled report. */}
      {mounted ? (
        <View style={[styles.body, !expanded && styles.hidden]}>
          <VenueTrustPanel venueId={venueId} startOpen={startReport} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: 64,
  },
  headerText: { flex: 1, gap: 2 },
  body: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  hidden: { display: 'none' },
});
