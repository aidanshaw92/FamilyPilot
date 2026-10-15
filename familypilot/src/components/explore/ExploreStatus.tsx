import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Coverage, formatMiles, RadiusMiles } from '@/src/utils/explore-geo';
import { Relaxation } from '@/src/utils/explore-results';

/** The honest line about how much FamilyPilot knows near here, shown when the answer is small. */
export function CoverageNote({ count, radius, onSearchAll }: { count: number; radius: RadiusMiles; onSearchAll: () => void }) {
  return (
    <View style={styles.note} testID="explore-coverage-note">
      <Text variant="caption" color={colors.text.secondary}>
        FamilyPilot knows {count} {count === 1 ? 'place' : 'places'} within {radius} miles. That is the places on record, not every place there is.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Search all of London" onPress={onSearchAll} style={styles.link} testID="explore-coverage-search-all">
        <Text variant="link">Search all of London</Text>
      </Pressable>
    </View>
  );
}

/**
 * Nothing matches. Says why in the numbers FamilyPilot holds, and offers one tap to take each thing off (or to widen), with how
 * many places each would bring back, so a parent relaxes one thing rather than starting again.
 */
export function EmptyExplanation({
  scope,
  radius,
  coverage,
  filterCount,
  relaxations,
  onRelax,
  onClearAll,
}: {
  scope: 'nearby' | 'all';
  radius: RadiusMiles;
  coverage: Coverage;
  filterCount: number;
  relaxations: Relaxation[];
  onRelax: (id: string) => void;
  onClearAll: () => void;
}) {
  const within = radius === 2 ? coverage.within2 : radius === 5 ? coverage.within5 : coverage.within10;
  const thin = scope === 'nearby' && within === 0;
  const title = thin ? `No places we know within ${radius} miles` : filterCount > 0 ? 'Nothing matches all of these' : 'Nothing matches that';
  const body = thin
    ? `FamilyPilot knows ${coverage.within10} ${coverage.within10 === 1 ? 'place' : 'places'} within 10 miles${coverage.nearestMiles != null ? `; the nearest is ${formatMiles(coverage.nearestMiles)} away` : ''}. That is the places on record, not every place there is.`
    : relaxations.length
      ? 'Taking one thing off brings places back. Nothing has been left out because it was not checked.'
      : 'No place we know fits this, even with everything else taken off. That is the places on record, not every place there is.';
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite" testID="explore-empty">
      <Text variant="heading3" style={styles.emptyTitle}>{title}</Text>
      <Text variant="bodySmall" color={colors.text.secondary}>{body}</Text>
      <View style={styles.actions}>
        {relaxations.slice(0, 4).map((r) => (
          <Button
            key={r.id}
            label={`${r.label} · ${r.count} ${r.count === 1 ? 'place' : 'places'}`}
            variant="outline"
            size="md"
            fullWidth
            onPress={() => onRelax(r.id)}
            testID={`explore-relax-${r.id}`}
          />
        ))}
        {relaxations.length === 0 || filterCount > 0 ? <Button label="Clear all" variant="secondary" size="md" fullWidth onPress={onClearAll} testID="explore-empty-clear" /> : null}
      </View>
    </View>
  );
}

/** A place hidden or unchecked is counted, never silently dropped: this is the one line and the one control. */
export function ToggleRow({ text, actionLabel, onPress, testID }: { text: string; actionLabel: string; onPress: () => void; testID: string }) {
  return (
    <View style={styles.toggle} testID={testID}>
      <Text variant="caption" color={colors.text.secondary} style={styles.toggleText}>{text}</Text>
      {actionLabel ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${text}`} onPress={onPress} style={styles.link} testID={`${testID}-action`}>
          <Text variant="link">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListHeading({ text, testID }: { text: string; testID?: string }) {
  return (
    <Text variant="bodySmall" style={styles.heading} accessibilityRole="header" testID={testID}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  note: { gap: 2, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm },
  link: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, justifyContent: 'center', alignSelf: 'flex-start' },
  empty: { marginHorizontal: spacing.screenPadding, marginTop: spacing.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg },
  emptyTitle: { marginBottom: 2 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  toggleText: { flex: 1 },
  heading: { fontFamily: 'Inter_600SemiBold', paddingTop: spacing.md, paddingBottom: spacing.xs },
});
