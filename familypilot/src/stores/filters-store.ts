import { create } from 'zustand';

import { ExploreFilter } from '@/src/types';

const defaultFilters: ExploreFilter[] = [
  { id: 'all', label: 'All', active: true },
  { id: 'parks', label: 'Parks', active: false },
  { id: 'cafes', label: 'Cafés', active: false },
  { id: 'playgrounds', label: 'Playgrounds', active: false },
  { id: 'indoor', label: 'Indoor', active: false },
  { id: 'free', label: 'Free', active: false },
];

interface FiltersState {
  filters: ExploreFilter[];
  toggleFilter: (id: string) => void;
  resetFilters: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  filters: defaultFilters,
  toggleFilter: (id) =>
    set((state) => ({
      filters: state.filters.map((f) =>
        id === 'all'
          ? { ...f, active: f.id === 'all' }
          : f.id === id
            ? { ...f, active: !f.active }
            : f.id === 'all'
              ? { ...f, active: false }
              : f,
      ),
    })),
  resetFilters: () => set({ filters: defaultFilters }),
}));
