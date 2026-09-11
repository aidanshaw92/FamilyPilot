import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SavedGroup, SavedItem, Venue } from '@/src/types';

type SavedType = SavedItem['type'];

function inferSavedType(venue: Venue): SavedType {
  if (venue.category === 'restaurant' || venue.category === 'cafe') return 'restaurant';
  if (venue.category === 'hotel') return 'hotel';
  if (venue.category === 'shop') return 'shop';
  return 'place';
}

interface SavedState {
  savedIds: string[];
  items: SavedItem[];
  isSaved: (venueId: string) => boolean;
  saveVenue: (venue: Venue, type?: SavedType, group?: SavedGroup) => void;
  removeSaved: (venueId: string) => void;
  restoreSaved: (item: SavedItem) => void;
  toggleSaved: (venueId: string, venue?: Venue, type?: SavedType, group?: SavedGroup) => void;
}

export const useSavedStore = create<SavedState>()(
  persist(
    (set, get) => ({
      savedIds: [],
      items: [],
      isSaved: (venueId) => get().savedIds.includes(venueId),
      saveVenue: (venue, type = inferSavedType(venue), group = 'want') =>
        set((state) => {
          const existing = state.items.find((item) => item.venue.id === venue.id);
          const item: SavedItem = {
            id: existing?.id ?? `saved-${venue.id}`,
            type,
            venue,
            group: existing?.group ?? group,
            savedAt: new Date().toISOString(),
          };
          return {
            savedIds: [venue.id, ...state.savedIds.filter((id) => id !== venue.id)],
            items: [item, ...state.items.filter((row) => row.venue.id !== venue.id)],
          };
        }),
      removeSaved: (venueId) =>
        set((state) => ({
          savedIds: state.savedIds.filter((id) => id !== venueId),
          items: state.items.filter((item) => item.venue.id !== venueId),
        })),
      restoreSaved: (item) =>
        set((state) => ({
          savedIds: [item.venue.id, ...state.savedIds.filter((id) => id !== item.venue.id)],
          items: [item, ...state.items.filter((row) => row.venue.id !== item.venue.id)],
        })),
      toggleSaved: (venueId, venue, type, group) => {
        if (get().isSaved(venueId)) {
          get().removeSaved(venueId);
          return;
        }
        if (venue) {
          get().saveVenue(venue, type, group);
          return;
        }
        // Compatibility for callers/tests that only know an ID. User-facing save controls pass
        // a venue snapshot so Saved can render the real live place after an app restart.
        set((state) => ({
          savedIds: [venueId, ...state.savedIds.filter((id) => id !== venueId)],
        }));
      },
    }),
    {
      name: 'familypilot-saved-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ savedIds: state.savedIds, items: state.items }),
    },
  ),
);
