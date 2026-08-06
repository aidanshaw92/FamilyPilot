import { create } from 'zustand';

interface FiltersState {
  primaryFilter: string;
  advancedFilters: string[];
  filterSheetOpen: boolean;
  setPrimaryFilter: (id: string) => void;
  toggleAdvancedFilter: (id: string) => void;
  clearAdvancedFilters: () => void;
  setFilterSheetOpen: (open: boolean) => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  primaryFilter: 'popular',
  advancedFilters: [],
  filterSheetOpen: false,
  setPrimaryFilter: (id) => set({ primaryFilter: id }),
  toggleAdvancedFilter: (id) =>
    set((state) => ({
      advancedFilters: state.advancedFilters.includes(id)
        ? state.advancedFilters.filter((f) => f !== id)
        : [...state.advancedFilters, id],
    })),
  clearAdvancedFilters: () => set({ advancedFilters: [] }),
  setFilterSheetOpen: (open) => set({ filterSheetOpen: open }),
}));
