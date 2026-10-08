import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

/**
 * The one question put to a parent whose stored journey limit or budget cannot be told from the app's old default.
 *
 * It is set aside, not applied (utils/preferences.ts), so nothing is limited while this shows. It never blocks saving and
 * is answered by tapping the value (keep it) or ANY choice in the row beneath it, "No limit" included.
 */
export function UnconfirmedPreferenceNotice({
  testID,
  question,
  keepLabel,
  onKeep,
}: {
  testID: string;
  question: string;
  keepLabel: string;
  onKeep: () => void;
}) {
  return (
    <View style={styles.box} testID={testID}>
      <Text variant="bodySmall" color={colors.text.secondary}>
        {question}
      </Text>
      <Button label={keepLabel} variant="outline" onPress={onKeep} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
  },
});
