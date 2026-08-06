import { create } from 'zustand';

const INITIAL_SAVED = ['venue-1', 'venue-4'];

interface SavedState {
  savedIds: Set<string>;
  isSaved: (venueId: string) => boolean;
  toggleSaved: (venueId: string) => void;
}

export const useSavedStore = create<SavedState>((set, get) => ({
  savedIds: new Set(INITIAL_SAVED),
  isSaved: (venueId) => get().savedIds.has(venueId),
  toggleSaved: (venueId) =>
    set((state) => {
      const next = new Set(state.savedIds);
      if (next.has(venueId)) {
        next.delete(venueId);
      } else {
        next.add(venueId);
      }
      return { savedIds: next };
    }),
}));
