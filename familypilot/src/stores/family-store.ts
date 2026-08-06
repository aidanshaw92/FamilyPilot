import { create } from 'zustand';

import { mockFamilyProfile } from '@/src/data/mock-data';
import { FamilyProfile } from '@/src/types';

interface FamilyState {
  profile: FamilyProfile;
  setProfile: (profile: FamilyProfile) => void;
}

export const useFamilyStore = create<FamilyState>((set) => ({
  profile: mockFamilyProfile,
  setProfile: (profile) => set({ profile }),
}));
