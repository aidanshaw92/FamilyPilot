import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, fontFamily, radius, shadows } from '@/src/design-system/tokens';

export type TogetherView = 'halfway' | 'families';

const SEGMENTS: { key: TogetherView; label: string }[] = [
  { key: 'halfway', label: 'Meet halfway' },
  { key: 'families', label: 'Your families' },
];

/**
 * The two views of Together, one control: a grey track with the chosen view raised on white (approved Figma page 09,
 * "Together / Meet halfway"). A radiogroup rather than tabs: it changes what the page shows, not where you are, so the bottom
 * navigation does not move. Each segment keeps a 44 pt target and grows with the text instead of clipping it.
 */
export function TogetherSwitch({ view, onChange }: { view: TogetherView; onChange: (view: TogetherView) => void }) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Together" testID="together-switch">
      {SEGMENTS.map(({ key, label }) => {
        const active = view === key;
        return (
          <Pressable
            key={key}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => !active && onChange(key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            aria-checked={active}
            accessibilityLabel={label}
            testID={`together-view-${key}`}
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
