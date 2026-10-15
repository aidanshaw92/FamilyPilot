import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, fontFamily, radius, shadows } from '@/src/design-system/tokens';
import { ExploreScope } from '@/src/stores/filters-store';

const SEGMENTS: { key: ExploreScope; label: string }[] = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'all', label: 'Search all' },
];

/**
 * Explore's two modes, one control (approved Figma page 10): Nearby, the places within a distance of where you are looking from,
 * and Search all, every place FamilyPilot knows. A radiogroup, because it changes which places are considered rather than where you
 * are in the app. Switching never resets the search or the filters (they are one state, see the filters store).
 */
export function ExploreSwitch({ scope, onChange }: { scope: ExploreScope; onChange: (scope: ExploreScope) => void }) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Explore" testID="explore-switch">
      {SEGMENTS.map(({ key, label }) => {
        const active = scope === key;
        return (
          <Pressable
            key={key}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => !active && onChange(key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            aria-checked={active}
            accessibilityLabel={label}
            testID={`explore-scope-${key}`}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.borderLight, borderRadius: radius.xl, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: MIN_TARGET, paddingHorizontal: 8, borderRadius: radius.xl - 4, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surface, ...shadows.card },
  label: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20, color: colors.text.secondary, textAlign: 'center' },
  labelActive: { fontFamily: fontFamily.semiBold, color: colors.ink },
});
