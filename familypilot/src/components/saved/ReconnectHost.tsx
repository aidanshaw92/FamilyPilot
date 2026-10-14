import { confirmReconnect, reconnectMessage } from '@/src/services/saved/reconnect-actions';
import type { SuccessorLookup } from '@/src/services/saved/reconnect-lookup';
import { useSavedStore } from '@/src/stores/saved-store';
import type { SavedItem } from '@/src/types';

import { ReconnectSheet } from './ReconnectSheet';

export interface ActiveReconnect { item: SavedItem; lookup: Extract<SuccessorLookup, { status: 'relisted' | 'gone' }> }

/**
 * The one sheet a screen shows for the reconnect, rendered at the screen's root (a sheet draws over the whole screen, so it cannot live inside a scrolling
 * row). The screen holds which saved place is being reconnected; this owns what a tap on the sheet does, and hands a sentence back through `onDone`.
 */
export function ReconnectHost({ active, onClose, onDone }: { active: ActiveReconnect | null; onClose: () => void; onDone: (message: string) => void }) {
  if (!active) return null;
  const { item, lookup } = active;
  return (
    <ReconnectSheet
      visible
      onClose={onClose}
      saved={item}
      lookup={lookup}
      onConfirm={(venue) => {
        const outcome = confirmReconnect(item.venue.id, venue);
        onClose();
        onDone(reconnectMessage(venue.name, outcome));
      }}
      onRemove={() => {
        useSavedStore.getState().removeSaved(item.venue.id);
        onClose();
        onDone(`${item.venue.name} removed from saved.`);
      }}
    />
  );
}
