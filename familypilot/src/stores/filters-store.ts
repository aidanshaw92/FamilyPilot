import { create } from 'zustand';

export type ExploreBudgetFilter = 'any' | 'free' | 'under_25' | 'under_50' | 'under_100';

interface FiltersState {
  categoryFilter: string;
  exploreMaxDrive: number | 'any';
  exploreBudget: ExploreBudgetFilter;
  advancedFilters: string[];
  filterSheetOpen: boolean;
  setCategoryFilter: (id: string) => void;
  setExploreMaxDrive: (minutes: number | 'any') => void;
  setExploreBudget: (budget: ExploreBudgetFilter) => void;
  toggleAdvancedFilter: (id: string) => void;
  clearAdvancedFilters: () => void;
  resetExploreFilters: () => void;
  setFilterSheetOpen: (open: boolean) => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  categoryFilter: 'all',
  exploreMaxDrive: 'any',
  exploreBudget: 'any',
  advancedFilters: [],
  filterSheetOpen: false,
  setCategoryFilter: (id) => set({ categoryFilter: id }),
  setExploreMaxDrive: (minutes) => set({ exploreMaxDrive: minutes }),
  setExploreBudget: (budget) => set({ exploreBudget: budget }),
  toggleAdvancedFilter: (id) =>
    set((state) => ({
      advancedFilters: state.advancedFilters.includes(id)
        ? state.advancedFilters.filter((f) => f !== id)
        : [...state.advancedFilters, id],
    })),
  clearAdvancedFilters: () => set({ advancedFilters: [] }),
  resetExploreFilters: () =>
    set({
      categoryFilter: 'all',
      exploreMaxDrive: 'any',
      exploreBudget: 'any',
      advancedFilters: [],
    }),
  setFilterSheetOpen: (open) => set({ filterSheetOpen: open }),
}));
