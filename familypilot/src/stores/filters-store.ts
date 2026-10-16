import { create } from 'zustand';

import { DEFAULT_RADIUS_MILES, ExploreAnchor, RadiusMiles } from '@/src/utils/explore-geo';

export type ExploreBudgetFilter = 'any' | 'free' | 'under_25' | 'under_50' | 'under_100';
export type ExploreScope = 'nearby' | 'all';
export type ExploreView = 'list' | 'map';

interface FiltersState {
  categoryFilter: string;
  exploreMaxDrive: number | 'any';
  exploreBudget: ExploreBudgetFilter;
  advancedFilters: string[];
  filterSheetOpen: boolean;
  /**
   * EXPLORE'S ONE STATE. The search text, the group, every filter, how far, and which of the two modes and two views is showing
   * live together, so switching Nearby / Search all or List / Map never resets another. Nothing here is persisted: the
   * store is in memory only, which is also why the device location in `exploreAnchor` is never written anywhere.
   */
  exploreScope: ExploreScope;
  exploreView: ExploreView;
  exploreRadius: RadiusMiles;
  exploreQuery: string;
  /** Where Nearby measures from; null means the family's home area. A device location lives only here, in memory. */
  exploreAnchor: ExploreAnchor | null;
  /** Whether places hidden for a confirmed conflict are being shown (with the reason on each). */
  exploreShowHidden: boolean;
  setCategoryFilter: (id: string) => void;
  setExploreMaxDrive: (minutes: number | 'any') => void;
  setExploreBudget: (budget: ExploreBudgetFilter) => void;
  toggleAdvancedFilter: (id: string) => void;
  clearAdvancedFilters: () => void;
  resetExploreFilters: () => void;
  setFilterSheetOpen: (open: boolean) => void;
  setExploreScope: (scope: ExploreScope) => void;
  setExploreView: (view: ExploreView) => void;
  setExploreRadius: (radius: RadiusMiles) => void;
  setExploreQuery: (query: string) => void;
  setExploreAnchor: (anchor: ExploreAnchor | null) => void;
  setExploreShowHidden: (show: boolean) => void;
  /** "Clear all": the search, the group, every filter and the distance. Where you are looking, and the mode, stay. */
  clearAllExplore: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  categoryFilter: 'all',
  exploreMaxDrive: 'any',
  exploreBudget: 'any',
  advancedFilters: [],
  filterSheetOpen: false,
  exploreScope: 'nearby',
  exploreView: 'list',
  exploreRadius: DEFAULT_RADIUS_MILES,
  exploreQuery: '',
  exploreAnchor: null,
  exploreShowHidden: false,
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
      exploreRadius: DEFAULT_RADIUS_MILES,
    }),
  setFilterSheetOpen: (open) => set({ filterSheetOpen: open }),
  setExploreScope: (scope) => set({ exploreScope: scope }),
  setExploreView: (view) => set({ exploreView: view }),
  setExploreRadius: (radius) => set({ exploreRadius: radius }),
  setExploreQuery: (query) => set({ exploreQuery: query }),
  setExploreAnchor: (anchor) => set({ exploreAnchor: anchor }),
  setExploreShowHidden: (show) => set({ exploreShowHidden: show }),
  clearAllExplore: () =>
    set({
      exploreQuery: '',
      categoryFilter: 'all',
      exploreMaxDrive: 'any',
      exploreBudget: 'any',
      advancedFilters: [],
      exploreRadius: DEFAULT_RADIUS_MILES,
      exploreShowHidden: false,
    }),
}));
