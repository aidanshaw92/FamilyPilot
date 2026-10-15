import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/src/components/ui/BackButton';
import { EmptyState } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { confirmReconnect } from '@/src/services/saved/reconnect-actions';
import type { SuccessorLookup } from '@/src/services/saved/reconnect-lookup';
import { useSavedStore } from '@/src/stores/saved-store';
import type { SavedItem } from '@/src/types';

import { ReconnectSheet } from './ReconnectSheet';

/**
 * What a venue page shows, in place of "Could not load this place ... try again" (a Retry that can never succeed), when the address is a saved place
 * whose listing has gone. An address nobody saved keeps today's wording; this only exists where the device holds a saved copy and the catalogue has
 * clearly said the id is not listed. Nothing here acts on its own: the offer opens the same sheet as the Saved screen.
 */
export function ReconnectOffer({
  saved,
  lookup,
  onBack,
  onReconnected,
  paddingTop,
}: {
  saved: SavedItem;
  lookup: Extract<SuccessorLookup, { status: 'relisted' | 'gone' }>;
  onBack: () => void;
  /** Called with the confirmed venue's id, so the screen can open the page that now resolves. */
  onReconnected: (newVenueId: string) => void;
  paddingTop: number;
}) {
  const [open, setOpen] = useState(false);
  const relisted = lookup.status === 'relisted';
  return (
    <View style={[styles.container, { paddingTop }]} testID="reconnect-offer">
      <BackButton onPress={onBack} />
      <EmptyState
        icon="swap-horizontal-outline"
        title={relisted ? 'This place has a new listing' : 'This place isn’t listed any more'}
        message={
          relisted
            ? `You saved ${saved.venue.name}. Check it’s the same place and we’ll update your saved copy. Plans you have already made stay as they are.`
            : `You saved ${saved.venue.name}, but it isn’t in today’s listings. Your saved copy and your plans stay as they are.`
        }
        actionLabel={relisted ? 'Look at the new listing' : 'What can I do?'}
        onAction={() => setOpen(true)}
      />
      <ReconnectSheet
        visible={open}
        onClose={() => setOpen(false)}
        saved={saved}
        lookup={lookup}
        onConfirm={(venue) => {
          confirmReconnect(saved.venue.id, venue);
          setOpen(false);
          onReconnected(venue.id);
        }}
        onRemove={() => {
          useSavedStore.getState().removeSaved(saved.venue.id);
          setOpen(false);
          onBack();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.screenPadding },
});
