import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useSavedSuccessor } from '@/src/hooks/use-saved-successor';
import type { SavedItem } from '@/src/types';

import type { ActiveReconnect } from './ReconnectHost';

/**
 * The quiet line under a saved place whose old listing has gone: "This place has a new listing. Reconnect".
 *
 * It renders NOTHING unless the catalogue answered and the saved id is not among what it lists, so a place that still resolves, a place that has not
 * been checked yet, and a place whose check failed all look exactly as they did. It never opens the sheet by itself: the parent taps, and the SCREEN
 * (which owns the one sheet, see ReconnectHost) is told which place and what the catalogue said.
 */
export function ReconnectLine({ item, onOpen }: { item: SavedItem; onOpen: (active: ActiveReconnect) => void }) {
  const { data } = useSavedSuccessor(item);
  if (!data || data.status === 'listed') return null;
  const relisted = data.status === 'relisted';
  const name = item.venue.name;
  return (
    <View style={styles.line} testID={`reconnect-line-${item.venue.id}`}>
      <Text variant="caption" color={colors.text.secondary} style={styles.text}>
        {relisted ? 'This place has a new listing.' : 'This place isn’t listed any more.'}
      </Text>
      <Pressable
        onPress={() => onOpen({ item, lookup: data })}
        accessibilityRole="button"
        accessibilityLabel={relisted ? `Reconnect ${name} to its new listing` : `What can I do about ${name}, which isn’t listed any more`}
        style={styles.action}
        testID={`reconnect-open-${item.venue.id}`}
      >
        <Text variant="link">{relisted ? 'Reconnect' : 'What can I do?'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits directly under the row's card: pulled up into the card's bottom margin so the two read as one thing.
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  text: { flexShrink: 1 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
});
