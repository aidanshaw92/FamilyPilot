import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { FamilyProfile } from '@/src/types';
import { createEmptyProfile, withCompletion } from '@/src/utils/profile-defaults';

interface FamilyState {
  profile: FamilyProfile;
  hasCompletedOnboarding: boolean;
  hasSeenSplash: boolean;
  profileRevision: number;
  _hasHydrated: boolean;
  setProfile: (profile: FamilyProfile) => void;
  updateProfile: (updates: Partial<FamilyProfile>) => void;
  completeOnboarding: () => void;
  markSplashSeen: () => void;
  resetForTesting: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (set) => ({
      profile: createEmptyProfile(),
      hasCompletedOnboarding: false,
      hasSeenSplash: false,
      profileRevision: 0,
      _hasHydrated: false,

      setProfile: (profile) =>
        set((state) => ({
          profile: withCompletion(profile),
          profileRevision: state.profileRevision + 1,
        })),

      updateProfile: (updates) =>
        set((state) => ({
          profile: withCompletion({ ...state.profile, ...updates }),
          profileRevision: state.profileRevision + 1,
        })),

      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

      markSplashSeen: () => set({ hasSeenSplash: true }),

      resetForTesting: () =>
        set({
          profile: createEmptyProfile(),
          hasCompletedOnboarding: false,
          hasSeenSplash: false,
          profileRevision: 0,
        }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'familypilot-family-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasSeenSplash: state.hasSeenSplash,
        profileRevision: state.profileRevision,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
