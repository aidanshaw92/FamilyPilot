import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useSavedSuccessor } from '@/src/hooks/use-saved-successor';
import { confirmReconnect, reconnectMessage } from '@/src/services/saved/reconnect-actions';
import { useSavedStore } from '@/src/stores/saved-store';
import type { SavedItem } from '@/src/types';

import { ReconnectSheet } from './ReconnectSheet';

/**
 * The quiet line under a saved place whose old listing has gone: "This place has a new listing. Reconnect".
 *
 * It renders NOTHING unless the catalogue answered and the saved id is not among what it lists, so a place that still resolves, a place that has not
 * been checked yet, and a place whose check failed all look exactly as they did. It never opens the sheet by itself: the parent taps. `onDone` carries a
 * sentence back to the screen to say what happened.
 */
export function ReconnectLine({ item, onDone }: { item: SavedItem; onDone: (message: string) => void }) {
  const { data } = useSavedSuccessor(item);
  const [open, setOpen] = useState(false);
  if (!data || data.status === 'listed') return null;
  const relisted = data.status === 'relisted';
  const name = item.venue.name;
  return (
    <>
      <View style={styles.line} testID={`reconnect-line-${item.venue.id}`}>
        <Text variant="caption" color={colors.text.secondary} style={styles.text}>
          {relisted ? 'This place has a new listing.' : 'This place isn’t listed any more.'}
        </Text>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={relisted ? `Reconnect ${name} to its new listing` : `What can I do about ${name}, which isn’t listed any more`}
          style={styles.action}
          testID={`reconnect-open-${item.venue.id}`}
        >
          <Text variant="link">{relisted ? 'Reconnect' : 'What can I do?'}</Text>
        </Pressable>
      </View>
      <ReconnectSheet
        visible={open}
        onClose={() => setOpen(false)}
        saved={item}
        lookup={data}
        onConfirm={(venue) => {
          const outcome = confirmReconnect(item.venue.id, venue);
          setOpen(false);
          onDone(reconnectMessage(venue.name, outcome));
        }}
        onRemove={() => {
          useSavedStore.getState().removeSaved(item.venue.id);
          setOpen(false);
          onDone(`${name} removed from saved.`);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Sits directly under the row's card: pulled up into the card's bottom margin so the two read as one thing.
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  text: { flexShrink: 1 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
});
