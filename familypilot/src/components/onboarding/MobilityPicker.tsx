import { StyleSheet, View } from 'react-native';

import { Chip, CHIP_GAP, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { ChildMobility } from '@/src/types';
import { MOBILITY_LABELS } from '@/src/utils/family-mobility';

/**
 * How one child usually gets around. Several can be true at once (walks most of the way with a buggy
 * for tired legs; a baby in a carrier and a buggy), so it is a set, not a single choice. The options a
 * child is offered come from their age: nobody asks a baby whether they walk.
 */
export function MobilityPicker({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: ChildMobility[];
  value: ChildMobility[];
  onChange: (next: ChildMobility[]) => void;
}) {
  const who = name.trim() || 'your child';
  const toggle = (option: ChildMobility) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  return (
    <View>
      <Text variant="body" style={styles.question}>
        {`How does ${who} usually get around on a day out?`}
      </Text>
      <Text variant="caption" color={colors.text.secondary} style={styles.hint}>
        Choose all that apply
      </Text>
      <View style={styles.row}>
        {options.map((option) => (
          <Chip
            key={option}
            label={MOBILITY_LABELS[option]}
            active={value.includes(option)}
            onPress={() => toggle(option)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  question: { fontWeight: '600' },
  hint: { marginTop: spacing.xs, marginBottom: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP },
});
